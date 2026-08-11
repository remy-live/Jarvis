/**
 * CONFIGURATION CENTRALE
 * Tous les réglages "magiques" du projet sont ici, plus besoin de les
 * chercher au fond d'un fichier.
 */
export const CONFIG = {
    /* --- VISION (MediaPipe) --- */
    vision: {
        // Version des modules MediaPipe : doit rester alignée sur
        // js/vendor/vision_bundle.js et sur scripts/fetch-assets.mjs
        version: '0.10.22-rc.20250304',

        // Fichiers locaux, récupérés par `npm run setup`
        wasmPath: 'assets/wasm',
        models: {
            hand: 'assets/models/hand_landmarker.task',
            pose: 'assets/models/pose_landmarker_lite.task',
            face: 'assets/models/face_landmarker.task'
        },

        // Repli automatique si les fichiers locaux sont absents — le cas
        // d'un déploiement statique (GitHub Pages) où ils ne sont pas
        // versionnés. Passez à false pour un fonctionnement 100 % hors ligne.
        useCdnFallback: true,
        cdn: {
            wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@VERSION/wasm',
            models: {
                hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
            }
        },

        // 'GPU' est beaucoup plus rapide, 'CPU' est le repli si WebGL fait défaut
        delegate: 'GPU',

        // Nombre d'inférences par seconde. Le rendu vise 60 fps :
        // on réutilise simplement la dernière détection entre deux analyses.
        maxFps: 30,

        // Part maximale du temps que l'IA a le droit de consommer.
        // `detectForVideo` est SYNCHRONE : pendant qu'il tourne, plus rien
        // ne s'affiche. Au-delà de cette part, on espace les analyses —
        // mieux vaut un suivi un peu moins fréquent qu'un jeu qui saccade.
        maxLoadRatio: 0.45,

        // Un seul détecteur par cycle quand plusieurs sont actifs : ils
        // s'alternent au lieu de bloquer la frame l'un après l'autre.
        roundRobin: true,

        // Nombre de personnes suivies. Déduit du jeu chargé (1 ou 2) :
        // suivre deux mains coûte deux fois plus cher qu'une seule.
        defaultPlayers: 1,

        // Résolution de l'image envoyée à l'IA (plus petit = plus rapide)
        analysisWidth: 384,
        analysisHeight: 288,

        // Largeur maximale du retour caméra dessiné à l'écran. Au-delà,
        // on dessine plus petit et le CSS étire : invisible sur un décor
        // atténué, mais bien moins de pixels à recopier chaque frame.
        feedbackMaxWidth: 960
    },

    /* --- ENTRÉES --- */
    input: {
        // 0 = très lissé (mou), 1 = brut (nerveux). Indépendant du framerate.
        smoothing: 0.75,
        menuSmoothing: 0.35,

        // Distance pouce/index (normalisée) en dessous de laquelle on "pince"
        pinchThreshold: 0.05,

        // Ouverture de bouche (normalisée) considérée comme "ouverte"
        mouthOpenThreshold: 0.05,

        // Nombre de frames sans détection avant de déclarer le joueur absent.
        // Évite que le curseur disparaisse au moindre raté de l'IA.
        lostFramesTolerance: 6
    },

    /* --- MOTEUR --- */
    engine: {
        // Temps de survol (ms) pour valider un "clic" sans souris
        dwellTime: 1200,

        // Delta time maximum (s). Sans ça, un retour d'onglet fait exploser
        // la physique de tous les jeux d'un coup.
        maxDelta: 1 / 20
    },

    /* --- CAPTURE (photo + vidéo) --- */
    capture: {
        countdown: 3,            // secondes avant le déclenchement d'une photo
        historySize: 12,         // captures gardées en mémoire pour la session
        photoPixelRatio: 2,      // finesse de la photo exportée
        videoPixelRatio: 1,      // la vidéo privilégie la fluidité
        videoFps: 30,
        videoBitrate: 6_000_000, // ~6 Mb/s : net sans fichier démesuré
        background: '#101214'
    },

    /* --- AUDIO --- */
    audio: {
        musicVolume: 0.5,
        sfxVolume: 1.0,
        fadeTime: 1000
    }
};
