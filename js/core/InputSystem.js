import { HandLandmarker, PoseLandmarker, FaceLandmarker, FilesetResolver } from '../vendor/vision_bundle.js';
import { CONFIG } from './Config.js';
import { FallbackInput } from './FallbackInput.js';

/**
 * SYSTÈME D'ENTRÉES
 *
 * Transforme la webcam en manette : mains, corps et visage deviennent
 * deux "joueurs" normalisés que les jeux consomment via `inputs.players`.
 *
 * Deux modes :
 *   - 'vision'  : MediaPipe + webcam (mode normal)
 *   - 'fallback': souris + clavier (si caméra ou modèles indisponibles)
 *
 * Dans les deux cas la forme des données est identique : un jeu n'a pas
 * à savoir d'où viennent les entrées.
 */
export class InputSystem {
    constructor() {
        // 1. Éléments DOM
        this.video = document.getElementById('webcam-video');
        this.feedbackCanvas = document.getElementById('feedback-canvas');
        this.feedbackCtx = this.feedbackCanvas.getContext('2d');

        // 2. Canvas invisible pour l'analyse IA
        this.analysisCanvas = document.createElement('canvas');
        this.analysisCanvas.width = CONFIG.vision.analysisWidth;
        this.analysisCanvas.height = CONFIG.vision.analysisHeight;
        this.analysisCtx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });

        // 3. État du système
        this.players = [];
        this.isReady = false;
        this.mode = 'fallback';     // 'vision' | 'fallback'
        this.fallbackReason = null; // message affiché à l'écran de boot

        this.enableHands = true;
        this.enableFace = false;
        this.enablePose = false;

        // --- CONFIGURATION & MÉMOIRE ---
        this.smoothing = CONFIG.input.smoothing;
        this.previousStates = {};
        this.calibration = this.loadCalibration();

        // --- OPTION FANTÔME (touche G) : duplique le joueur 1 pour tester le 2 joueurs
        this.useGhost = false;

        // Curseur / compat historique
        this.hand = null;
        this.mouse = { x: 0, y: 0 };

        // Cadencement de l'IA (le rendu reste à 60 fps)
        this._lastDetectionTime = 0;
        this._lastTimestamp = 0;
        this._lastFrameTime = 0;
        this._results = { hand: null, pose: null, face: null };

        // Auto-régulation : coût moyen d'une analyse, et détection des
        // nouvelles images webcam pour ne jamais analyser deux fois la même.
        this._detectionBudget = 0;
        this._videoFrameSeen = false;
        this._hasFrameCallback = false;
        this.lastInferenceMs = 0;

        // Tampons réutilisés : le miroir des landmarks de pose était
        // recréé à chaque frame (33 objets × 2 joueurs × 60 fps).
        this._mirrorBuffers = [[], []];

        // Mémoire de détection : évite le clignotement quand l'IA rate une frame
        this._lostFrames = [0, 0];
        this._lastGoodPlayers = [null, null];

        this.fallback = new FallbackInput();

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const key = e.key.toLowerCase();
            if (key === 'v') this.toggleView();
            if (key === 'g') {
                this.useGhost = !this.useGhost;
                console.log(`👻 MODE FANTÔME: ${this.useGhost ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
            }
        });

        this.feedbackCanvas.classList.add('view-vignette');
    }

    // ==========================================================
    //  A. RÉGLAGES & PERSISTANCE
    // ==========================================================

    setSmoothing(val) {
        this.smoothing = Math.max(0.01, Math.min(1.0, val));
    }

    saveCalibration(data) {
        this.calibration = { ...this.calibration, ...data };
        try {
            localStorage.setItem('arcade_calibration', JSON.stringify(this.calibration));
        } catch (e) {
            console.warn('⚠️ Calibration non sauvegardée (stockage indisponible).', e);
        }
    }

    loadCalibration() {
        const defaults = {
            scaleX: 30, scaleY: 20, scaleZ: 40,
            offsetX: 0, offsetY: 0, offsetZ: 0,
            refSize: 0
        };
        try {
            const data = localStorage.getItem('arcade_calibration');
            return data ? { ...defaults, ...JSON.parse(data) } : defaults;
        } catch (e) {
            // localStorage corrompu ou navigation privée : on repart des valeurs par défaut
            console.warn('⚠️ Calibration illisible, valeurs par défaut utilisées.', e);
            return defaults;
        }
    }

    /**
     * Lissage exponentiel indépendant du framerate.
     * `smoothing` = fraction rattrapée en 1/60 s (0 = mou, 1 = brut).
     */
    _smoothValue(id, axis, targetVal, dt) {
        if (!this.previousStates[id]) this.previousStates[id] = {};
        const prev = this.previousStates[id][axis];

        if (prev === undefined || !Number.isFinite(prev)) {
            this.previousStates[id][axis] = targetVal;
            return targetVal;
        }

        const alpha = 1 - Math.pow(1 - this.smoothing, Math.max(dt, 0) * 60);
        const next = prev + (targetVal - prev) * alpha;
        this.previousStates[id][axis] = next;
        return next;
    }

    /** Profondeur estimée à partir de la taille apparente de la main. */
    getCalibratedZ(currentSize) {
        if (this.calibration.refSize > 0) {
            return (currentSize / this.calibration.refSize - 1) * this.calibration.scaleZ;
        }
        return 0;
    }

    // ==========================================================
    //  B. AFFICHAGE DU RETOUR CAMÉRA
    // ==========================================================

    toggleView() {
        const cl = this.feedbackCanvas.classList;
        if (cl.contains('view-vignette')) cl.replace('view-vignette', 'view-fullscreen');
        else cl.replace('view-fullscreen', 'view-vignette');
        this.resizeFeedbackCanvas();
    }

    resizeFeedbackCanvas() {
        const { clientWidth, clientHeight } = this.feedbackCanvas;
        if (!clientWidth || !clientHeight) return;
        if (this.feedbackCanvas.width !== clientWidth || this.feedbackCanvas.height !== clientHeight) {
            this.feedbackCanvas.width = clientWidth;
            this.feedbackCanvas.height = clientHeight;
        }
    }

    setCameraMode(mode) {
        this.feedbackCanvas.classList.remove('view-vignette', 'view-fullscreen');

        // Sans caméra, afficher un rectangle noir n'apporte rien
        if (this.mode !== 'vision' || mode === 'hidden') {
            this.feedbackCanvas.style.display = 'none';
            return;
        }

        this.feedbackCanvas.style.display = 'block';
        this.feedbackCanvas.classList.add(mode === 'fullscreen' ? 'view-fullscreen' : 'view-vignette');
        this.resizeFeedbackCanvas();
    }

    /**
     * Active uniquement les IA nécessaires au jeu courant.
     * Chaque détecteur désactivé, c'est ~30 % de CPU en moins.
     */
    setActiveTrackers(config = {}) {
        this.enableHands = config.hands !== false; // activé par défaut (curseur)
        this.enableFace = config.face === true;
        this.enablePose = config.pose === true;
        console.log(`⚙️ INPUTS: mains=${this.enableHands} pose=${this.enablePose} visage=${this.enableFace}`);
    }

    // ==========================================================
    //  C. BOUCLE PRINCIPALE
    // ==========================================================

    update(timestamp, display) {
        // dt réel entre deux frames, borné (retour d'onglet, lag...)
        const dt = this._lastFrameTime
            ? Math.min((timestamp - this._lastFrameTime) / 1000, CONFIG.engine.maxDelta)
            : 1 / 60;
        this._lastFrameTime = timestamp;

        const p1 = this._createEmptyPlayer(0, 0.25, display);
        const p2 = this._createEmptyPlayer(1, 0.75, display);

        if (this.mode === 'vision' && this.isReady) {
            this._updateFromVision(timestamp, display, dt, p1, p2);
        } else {
            this._updateFromFallback(display, dt, p1, p2);
        }

        this._applyGhost(display, p1, p2);
        this._applyDetectionMemory([p1, p2]);

        this.players = [p1, p2];
        this.hand = p1;

        if (display.updateCursor) display.updateCursor(p1);
    }

    _createEmptyPlayer(id, defaultX, display) {
        const x = defaultX * display.virtW;
        const y = 0.5 * display.virtH;
        return {
            id,
            detected: false,
            x, y, z: 0,
            type: 'none',
            isClicking: false,

            // Compat historique
            indexTip: { x, y },
            handCenter: { x, y },
            raw: { size: 0 },

            hand: null,
            face: null,
            pose: null,
            poseLandmarks: null
        };
    }

    // ---------- MODE SOURIS / CLAVIER ----------

    _updateFromFallback(display, dt, p1, p2) {
        const detections = this.fallback.sample(dt);
        const targets = [p1, p2];

        detections.forEach((det, i) => {
            if (!det.active) return;
            const target = targets[i];
            const pos = display.toVirtual(det.screenX, det.screenY);

            target.detected = true;
            target.type = 'virtual';
            target.x = this._smoothValue(target.id, 'x', pos.x, dt);
            target.y = this._smoothValue(target.id, 'y', pos.y, dt);
            target.isClicking = det.pinch;

            if (this.enablePose) {
                target.pose = { raw: det.pose };
                target.poseLandmarks = this._mirror(target.id, det.pose);
            }
            if (this.enableFace) {
                target.face = { raw: det.face, mouthOpen: det.mouthOpen, nose: { x: target.x, y: target.y } };
            }
            if (this.enableHands) {
                target.hand = { raw: det.hand, x: pos.x, y: pos.y };
                target.indexTip = { x: target.x, y: target.y };
                target.handCenter = { x: target.x, y: target.y + display.virtH * 0.07 };
                target.raw = { size: display.virtH * 0.1 };
            }
        });
    }

    // ---------- MODE VISION ----------

    _updateFromVision(timestamp, display, dt, p1, p2) {
        const feedbackVisible = this.feedbackCanvas.style.display !== 'none';
        if (feedbackVisible) this._drawCameraFeedback();

        this._runDetectors(timestamp);

        if (this.enablePose) this._applyPose(display, dt, p1, p2, feedbackVisible);
        if (this.enableHands) this._applyHands(display, dt, p1, p2, feedbackVisible);
        if (this.enableFace) this._applyFace(display, dt, p1, p2, feedbackVisible);
    }

    _drawCameraFeedback() {
        this.resizeFeedbackCanvas();
        const ctx = this.feedbackCtx;
        const w = this.feedbackCanvas.width;
        const h = this.feedbackCanvas.height;

        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1); // effet miroir : plus naturel pour le joueur
        ctx.drawImage(this.video, 0, 0, w, h);
        ctx.restore();

        if (this.useGhost) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
            ctx.font = '20px Orbitron, sans-serif';
            ctx.fillText('👻 GHOST ON', 10, 30);
        }
    }

    /**
     * Lance les détecteurs actifs.
     *
     * Trois garde-fous, dans cet ordre :
     *   1. la webcam tourne à ~30 fps, l'écran à 60 : inutile d'analyser
     *      deux fois la même image (`_videoFrameSeen`) ;
     *   2. plafond `CONFIG.vision.maxFps` ;
     *   3. si une analyse a duré trop longtemps, on lève le pied
     *      automatiquement (`_detectionBudget`) au lieu de saccader.
     */
    _runDetectors(timestamp) {
        if (this.video.readyState < 2) return;
        if (this._hasFrameCallback && !this._videoFrameSeen) return;

        const minInterval = Math.max(1000 / CONFIG.vision.maxFps, this._detectionBudget);
        if (timestamp - this._lastDetectionTime < minInterval) return;

        this._lastDetectionTime = timestamp;
        this._videoFrameSeen = false;

        // MediaPipe exige des timestamps strictement croissants
        const ts = Math.max(Math.round(timestamp), this._lastTimestamp + 1);
        this._lastTimestamp = ts;

        const started = performance.now();

        this.analysisCtx.drawImage(
            this.video, 0, 0,
            this.analysisCanvas.width, this.analysisCanvas.height
        );

        try {
            this._results.pose = this.enablePose
                ? this.poseLandmarker.detectForVideo(this.analysisCanvas, ts)
                : null;
            this._results.hand = this.enableHands
                ? this.handLandmarker.detectForVideo(this.analysisCanvas, ts)
                : null;
            this._results.face = this.enableFace
                ? this.faceLandmarker.detectForVideo(this.analysisCanvas, ts)
                : null;
        } catch (error) {
            // Une frame ratée ne doit jamais tuer la boucle de jeu
            console.warn('⚠️ Détection ignorée pour cette frame :', error);
        }

        // Moyenne glissante du coût d'une analyse. Sur une machine lente,
        // on espace les inférences pour garder un rendu fluide.
        const elapsed = performance.now() - started;
        this.lastInferenceMs = elapsed;
        this._detectionBudget = this._detectionBudget * 0.9 + elapsed * 1.2 * 0.1;
    }

    /** Prévient dès qu'une nouvelle image webcam est disponible. */
    _watchVideoFrames() {
        this._hasFrameCallback = typeof this.video.requestVideoFrameCallback === 'function';
        if (!this._hasFrameCallback) return;

        const onFrame = () => {
            this._videoFrameSeen = true;
            this.video.requestVideoFrameCallback(onFrame);
        };
        this.video.requestVideoFrameCallback(onFrame);
    }

    /** Choisit le joueur 1 ou 2 selon la moitié d'écran occupée. */
    _pickTarget(screenX, p1, p2) {
        return screenX < 0.5 ? p1 : p2;
    }

    _applyPose(display, dt, p1, p2, draw) {
        const result = this._results.pose;
        if (!result || !result.landmarks) return;

        for (const lm of result.landmarks) {
            if (draw) this.drawPose(lm, display);

            const nose = lm[0];
            if (!nose) continue;

            const screenXNormalized = 1 - nose.x;
            const pos = display.toVirtual(screenXNormalized, nose.y);
            const target = this._pickTarget(screenXNormalized, p1, p2);

            target.detected = true;
            target.type = 'pose';
            target.x = this._smoothValue(target.id, 'x', pos.x, dt);
            target.y = this._smoothValue(target.id, 'y', pos.y, dt);

            target.pose = { raw: lm };
            target.poseLandmarks = this._mirror(target.id, lm);
        }
    }

    /** Version miroir des landmarks, écrite dans un tampon réutilisé. */
    _mirror(playerId, landmarks) {
        const buffer = this._mirrorBuffers[playerId];
        for (let i = 0; i < landmarks.length; i++) {
            const source = landmarks[i];
            const point = buffer[i] || (buffer[i] = { x: 0, y: 0, z: 0, visibility: 1 });
            point.x = 1 - source.x;
            point.y = source.y;
            point.z = source.z;
            point.visibility = source.visibility;
        }
        buffer.length = landmarks.length;
        return buffer;
    }

    _applyHands(display, dt, p1, p2, draw) {
        const result = this._results.hand;
        if (!result || !result.landmarks) return;

        for (const lm of result.landmarks) {
            if (draw) this.drawHand(lm, display);

            const tip = lm[8];    // bout de l'index
            const wrist = lm[0];  // poignet
            const middle = lm[9]; // base du majeur
            const thumb = lm[4];  // pouce
            if (!tip || !wrist || !middle || !thumb) continue;

            const screenXNormalized = 1 - tip.x;
            const pos = display.toVirtual(screenXNormalized, tip.y);

            const palmPos = display.toVirtual(1 - (wrist.x + middle.x) / 2, (wrist.y + middle.y) / 2);
            const rawSize = Math.hypot(palmPos.x - pos.x, palmPos.y - pos.y);
            const pinchDist = Math.hypot(thumb.x - tip.x, thumb.y - tip.y);

            const target = this._pickTarget(screenXNormalized, p1, p2);

            // La pose (corps entier) reste prioritaire pour la position principale
            const poseOwnsPosition = target.type === 'pose';
            if (!target.detected) {
                target.detected = true;
                target.type = 'hand';
            }

            if (!poseOwnsPosition) {
                target.x = this._smoothValue(target.id, 'x', pos.x, dt);
                target.y = this._smoothValue(target.id, 'y', pos.y, dt);
            }

            target.z = this._smoothValue(target.id, 'z', this.getCalibratedZ(rawSize), dt);
            target.isClicking = pinchDist < CONFIG.input.pinchThreshold;

            target.hand = { raw: lm, x: pos.x, y: pos.y };
            target.indexTip = poseOwnsPosition ? { x: pos.x, y: pos.y } : { x: target.x, y: target.y };
            target.handCenter = palmPos;
            target.raw = { size: rawSize };
        }
    }

    _applyFace(display, dt, p1, p2, draw) {
        const result = this._results.face;
        if (!result || !result.faceLandmarks) return;

        for (const lm of result.faceLandmarks) {
            if (draw) this.drawFace(lm, display);

            const nose = lm[1];
            const upperLip = lm[13];
            const lowerLip = lm[14];
            if (!nose || !upperLip || !lowerLip) continue;

            const screenXNormalized = 1 - nose.x;
            const pos = display.toVirtual(screenXNormalized, nose.y);
            const mouthDist = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
            const mouthOpen = mouthDist > CONFIG.input.mouthOpenThreshold;

            const target = this._pickTarget(screenXNormalized, p1, p2);

            if (!target.detected) {
                target.detected = true;
                target.type = 'face';
                target.x = this._smoothValue(target.id, 'x', pos.x, dt);
                target.y = this._smoothValue(target.id, 'y', pos.y, dt);
            }

            target.face = { raw: lm, mouthOpen, nose: pos };
            if (target.type === 'face') target.isClicking = mouthOpen;
        }
    }

    // ---------- POST-TRAITEMENTS ----------

    _applyGhost(display, p1, p2) {
        if (!this.useGhost || !p1.detected || p2.detected) return;

        const offset = display.virtW * 0.5;
        p2.detected = true;
        p2.type = p1.type;
        p2.isClicking = p1.isClicking;
        p2.x = p1.x + offset;
        p2.y = p1.y;
        p2.z = p1.z;
        p2.indexTip = { x: p1.indexTip.x + offset, y: p1.indexTip.y };
        p2.handCenter = { x: p1.handCenter.x + offset, y: p1.handCenter.y };
        p2.raw = p1.raw;
        p2.poseLandmarks = p1.poseLandmarks;
        p2.hand = p1.hand;
        p2.face = p1.face;
        p2.pose = p1.pose;
    }

    /**
     * L'IA rate régulièrement une frame ou deux. Sans mémoire, le curseur
     * clignote et les jeux croient que le joueur est parti.
     */
    _applyDetectionMemory(players) {
        players.forEach((player, i) => {
            if (player.detected) {
                this._lostFrames[i] = 0;
                this._lastGoodPlayers[i] = player;
                return;
            }

            const memory = this._lastGoodPlayers[i];
            if (memory && this._lostFrames[i] < CONFIG.input.lostFramesTolerance) {
                this._lostFrames[i]++;
                Object.assign(player, memory, { id: player.id, isClicking: false });
            } else {
                this._lastGoodPlayers[i] = null;
                delete this.previousStates[i];
            }
        });
    }

    // ==========================================================
    //  D. DESSIN DU RETOUR VISUEL
    // ==========================================================

    drawHand(landmarks, display) {
        const ctx = this.feedbackCtx;
        const canvas = this.feedbackCanvas;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffff';

        const chains = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 13, 17], [0, 17, 18, 19, 20], [9, 10, 11, 12], [13, 14, 15, 16]];
        for (const chain of chains) {
            ctx.beginPath();
            for (let i = 0; i < chain.length; i++) {
                const lm = landmarks[chain[i]];
                if (!lm) continue;
                const p = display.toFeedback(1 - lm.x, lm.y, canvas);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    drawPose(landmarks, display) {
        const ctx = this.feedbackCtx;
        const canvas = this.feedbackCanvas;
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 0;

        const bones = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16]];
        ctx.beginPath();
        for (const [i, j] of bones) {
            if (!landmarks[i] || !landmarks[j]) continue;
            const a = display.toFeedback(1 - landmarks[i].x, landmarks[i].y, canvas);
            const b = display.toFeedback(1 - landmarks[j].x, landmarks[j].y, canvas);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
    }

    drawFace(landmarks, display) {
        const ctx = this.feedbackCtx;
        const canvas = this.feedbackCanvas;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;

        for (const zone of FACE_ZONES) {
            ctx.strokeStyle = zone.color;
            ctx.shadowColor = zone.shadow;
            ctx.beginPath();
            for (const chain of zone.paths) {
                for (let i = 0; i < chain.length; i++) {
                    const lm = landmarks[chain[i]];
                    if (!lm) continue;
                    const p = display.toFeedback(1 - lm.x, lm.y, canvas);
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
    }

    // ==========================================================
    //  E. INITIALISATION
    // ==========================================================

    /**
     * @param {(msg: string, progress: number) => void} [onStatus] - retour visuel pendant le boot
     * @returns {Promise<'vision'|'fallback'>} le mode réellement actif
     */
    async initialize(onStatus = () => {}) {
        try {
            onStatus('CHARGEMENT DES MODÈLES IA...', 35);
            await this._loadVisionModels();

            onStatus('OUVERTURE DE LA CAMÉRA...', 65);
            await this._setupCamera();

            this._watchVideoFrames();
            this.mode = 'vision';
            this.isReady = true;
            console.log('✅ InputSystem : mode VISION (2 joueurs, fantôme via G)');
        } catch (error) {
            this.mode = 'fallback';
            this.isReady = true;
            this.fallbackReason = this._describeFailure(error);
            this.fallback.enable();
            this.feedbackCanvas.style.display = 'none';
            console.warn(`⚠️ InputSystem : mode SOURIS/CLAVIER — ${this.fallbackReason}`, error);
        }

        return this.mode;
    }

    /** Force le mode souris/clavier (bouton "continuer sans caméra"). */
    useFallback(reason = 'Mode sans caméra activé manuellement.') {
        this.releaseCamera();
        this.mode = 'fallback';
        this.isReady = true;
        this.fallbackReason = reason;
        this.fallback.enable();
        this.feedbackCanvas.style.display = 'none';
    }

    async _loadVisionModels() {
        const { wasmPath, models, delegate, numHands, numPoses, numFaces } = CONFIG.vision;
        const vision = await FilesetResolver.forVisionTasks(wasmPath);

        const [hand, pose, face] = await Promise.all([
            HandLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: models.hand, delegate },
                runningMode: 'VIDEO',
                numHands,
                minHandDetectionConfidence: 0.5
            }),
            PoseLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: models.pose, delegate },
                runningMode: 'VIDEO',
                numPoses,
                minPoseDetectionConfidence: 0.5
            }),
            FaceLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: models.face, delegate },
                runningMode: 'VIDEO',
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
                numFaces
            })
        ]);

        this.handLandmarker = hand;
        this.poseLandmarker = pose;
        this.faceLandmarker = face;
    }

    async _setupCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('CAMERA_UNSUPPORTED');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });

        this.stream = stream;
        this.video.srcObject = stream;

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('CAMERA_TIMEOUT')), 10000);
            this.video.onloadedmetadata = () => {
                this.video.play()
                    .then(() => { clearTimeout(timeout); resolve(); })
                    .catch((err) => { clearTimeout(timeout); reject(err); });
            };
        });
    }

    releaseCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
    }

    _describeFailure(error) {
        const message = String(error?.message || error);

        if (error?.name === 'NotAllowedError') return "Accès à la caméra refusé.";
        if (error?.name === 'NotFoundError') return "Aucune caméra détectée.";
        if (message.includes('CAMERA_UNSUPPORTED')) return "Caméra indisponible (le HTTPS ou localhost est requis).";
        if (message.includes('CAMERA_TIMEOUT')) return "La caméra n'a pas démarré à temps.";
        if (/fetch|404|Failed to load|network/i.test(message)) {
            return "Modèles IA introuvables — lancez `npm run setup` pour les télécharger.";
        }
        return `Vision indisponible (${message}).`;
    }
}

/** Tracé du maillage facial pour la vignette de debug. */
const FACE_ZONES = [
    {
        color: 'rgba(0, 255, 255, 0.5)', shadow: '#00ffff',
        paths: [[10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10]]
    },
    {
        color: 'rgba(255, 200, 0, 0.7)', shadow: '#ffcc00',
        paths: [[70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [336, 296, 334, 293, 300, 276, 283, 282, 295, 285]]
    },
    {
        color: 'rgba(100, 200, 255, 0.8)', shadow: '#64c8ff',
        paths: [[33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33], [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249, 263]]
    },
    {
        color: 'rgba(255, 100, 255, 0.6)', shadow: '#ff64ff',
        paths: [[168, 6, 197, 195, 5], [64, 98, 97, 2, 326, 327, 294]]
    },
    {
        color: 'rgba(255, 50, 80, 0.7)', shadow: '#ff3250',
        paths: [[61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 61], [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78]]
    }
];
