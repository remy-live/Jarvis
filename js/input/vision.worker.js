/**
 * WORKER DE VISION — worker CLASSIQUE, surtout pas `type: 'module'` :
 * MediaPipe charge son runtime WASM via importScripts(), qui est interdit
 * dans les workers module. Le bundle ES est donc chargé par import()
 * dynamique, autorisé, lui, dans un worker classique.
 *
 * Toute l'inférence tourne ici, hors du thread principal :
 * `detectForVideo` est synchrone, mais il ne bloque plus que ce worker.
 * La page reste à 60 fps quel que soit le coût d'une analyse.
 *
 * Protocole (messages du thread principal) :
 *   { type:'init', wasm, models, delegate, players }  → 'ready' | 'init-error'
 *   { type:'config', enabled:{hands,pose,face} }
 *   { type:'players', count }
 *   { type:'frame', bitmap, ts }                      → 'results' | 'frame-error'
 */

const libReady = import('../vendor/vision_bundle.js');

let landmarkers = { hand: null, pose: null, face: null };
let canvas = null;
let ctx = null;

let enabled = { hands: true, pose: false, face: false };
let cursor = 0;
let lastTs = 0;

// Détection d'image statique : une vignette en niveaux de gris suffit
// à savoir si quoi que ce soit a bougé depuis la dernière analyse.
const TINY_W = 32;
const TINY_H = 24;
let tinyCanvas = null;
let tinyCtx = null;
let previousTiny = null;
let staticThreshold = 0;
let staticMaxSkipMs = 500;
let lastAnalysisAt = 0;

self.onmessage = async (event) => {
    const msg = event.data;
    try {
        switch (msg.type) {
            case 'init': await init(msg); break;
            case 'config': enabled = msg.enabled; break;
            case 'players': await setPlayers(msg.count); break;
            case 'frame': detect(msg); break;
            default: break;
        }
    } catch (error) {
        const message = String(error?.message || error);
        if (msg.type === 'init') self.postMessage({ type: 'init-error', message });
        else self.postMessage({ type: 'frame-error', message });
    }
};

async function init({ wasm, models, delegate, players, analysisWidth, analysisHeight,
                      staticThreshold: threshold = 0, staticMaxSkipMs: maxSkip = 500 }) {
    canvas = new OffscreenCanvas(analysisWidth, analysisHeight);
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    tinyCanvas = new OffscreenCanvas(TINY_W, TINY_H);
    tinyCtx = tinyCanvas.getContext('2d', { willReadFrequently: true });
    staticThreshold = threshold;
    staticMaxSkipMs = maxSkip;

    // Le délégué GPU exige un contexte WebGL dans le worker : s'il refuse,
    // on retombe sur le CPU plutôt que d'échouer.
    try {
        await createLandmarkers(wasm, models, delegate, players);
    } catch (error) {
        if (delegate === 'GPU') await createLandmarkers(wasm, models, 'CPU', players);
        else throw error;
    }

    self.postMessage({ type: 'ready' });
}

async function createLandmarkers(wasm, models, delegate, players) {
    const { HandLandmarker, PoseLandmarker, FaceLandmarker, FilesetResolver } = await libReady;
    const vision = await FilesetResolver.forVisionTasks(wasm);

    const [hand, pose, face] = await Promise.all([
        HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: models.hand, delegate },
            runningMode: 'VIDEO',
            numHands: players,
            minHandDetectionConfidence: 0.5
        }),
        PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: models.pose, delegate },
            runningMode: 'VIDEO',
            numPoses: players,
            minPoseDetectionConfidence: 0.5
        }),
        FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: models.face, delegate },
            runningMode: 'VIDEO',
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
            numFaces: players
        })
    ]);

    landmarkers = { hand, pose, face };
}

async function setPlayers(count) {
    await Promise.all([
        landmarkers.hand?.setOptions({ numHands: count }),
        landmarkers.pose?.setOptions({ numPoses: count }),
        landmarkers.face?.setOptions({ numFaces: count })
    ]);
}

/**
 * L'image est-elle identique à la précédente ?
 *
 * On compare une vignette 32×24 : 768 pixels, quelques dizaines de
 * microsecondes, à mettre en face des dizaines de millisecondes d'une
 * inférence. Une analyse est tout de même forcée périodiquement, pour
 * qu'un seuil mal réglé ne puisse jamais figer le suivi.
 */
function isStatic(bitmap, ts) {
    if (staticThreshold <= 0) return false;
    if (ts - lastAnalysisAt > staticMaxSkipMs) return false;

    tinyCtx.drawImage(bitmap, 0, 0, TINY_W, TINY_H);
    const pixels = tinyCtx.getImageData(0, 0, TINY_W, TINY_H).data;

    const current = new Uint8Array(TINY_W * TINY_H);
    for (let i = 0, p = 0; i < current.length; i++, p += 4) {
        // Luminance approchée, sans multiplication flottante
        current[i] = (pixels[p] * 77 + pixels[p + 1] * 150 + pixels[p + 2] * 29) >> 8;
    }

    if (!previousTiny) {
        previousTiny = current;
        return false;
    }

    let sum = 0;
    for (let i = 0; i < current.length; i++) sum += Math.abs(current[i] - previousTiny[i]);
    previousTiny = current;

    return sum / current.length < staticThreshold;
}

/** Un détecteur par frame reçue, en tour de rôle parmi les actifs. */
function detect({ bitmap, ts }) {
    const active = [];
    if (enabled.pose) active.push('pose');
    if (enabled.hands) active.push('hand');
    if (enabled.face) active.push('face');

    if (active.length === 0) {
        bitmap.close();
        self.postMessage({ type: 'results', kind: null, payload: null, ms: 0 });
        return;
    }

    // Rien n'a bougé depuis la dernière analyse ? Les résultats précédents
    // sont encore valables : on économise toute l'inférence.
    //
    // La vignette est tirée de l'image SOURCE, jamais du canvas d'analyse :
    // relire les pixels de ce dernier juste avant `detectForVideo` fige
    // MediaPipe (le canvas sert de texture GPU, la relecture crée un point
    // de synchronisation dont l'inférence ne revient pas).
    let skip = false;
    try {
        skip = isStatic(bitmap, ts);
    } catch (error) {
        // Ce détecteur est une optimisation : s'il échoue, on analyse
        // normalement plutôt que de bloquer le suivi.
        self.postMessage({ type: 'frame-error', message: `isStatic: ${error.message}` });
        staticThreshold = 0;
    }

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    if (skip) {
        self.postMessage({ type: 'results', kind: null, payload: null, ms: 0, skipped: true });
        return;
    }
    lastAnalysisAt = ts;

    // MediaPipe exige des timestamps strictement croissants
    lastTs = Math.max(Math.round(ts), lastTs + 1);

    cursor = (cursor + 1) % active.length;
    const kind = active[cursor];

    const started = performance.now();
    const result = landmarkers[kind].detectForVideo(canvas, lastTs);
    const ms = performance.now() - started;

    // On ne renvoie que ce que les jeux lisent : les landmarks normalisés
    const payload = kind === 'face'
        ? { faceLandmarks: result.faceLandmarks }
        : { landmarks: result.landmarks };

    self.postMessage({ type: 'results', kind, payload, ms });
}
