/**
 * CONFIGURATION CENTRALE
 * Tous les réglages "magiques" du projet sont ici, plus besoin de les
 * chercher au fond d'un fichier.
 */
export const CONFIG = {
    /* --- VISION (MediaPipe) --- */
    vision: {
        // Dossier contenant les .wasm de MediaPipe (voir `npm run setup`)
        wasmPath: 'assets/wasm',

        // Modèles .task (voir `npm run setup`)
        models: {
            hand: 'assets/models/hand_landmarker.task',
            pose: 'assets/models/pose_landmarker_lite.task',
            face: 'assets/models/face_landmarker.task'
        },

        // 'GPU' est beaucoup plus rapide, 'CPU' est le repli si WebGL fait défaut
        delegate: 'GPU',

        // Nombre d'inférences par seconde. Le rendu reste à 60 fps :
        // on réutilise simplement la dernière détection entre deux analyses.
        maxFps: 30,

        numHands: 2,
        numPoses: 2,
        numFaces: 2,

        // Résolution de l'image envoyée à l'IA (plus petit = plus rapide)
        analysisWidth: 480,
        analysisHeight: 360
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
