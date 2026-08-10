import { CONFIG } from '../core/Config.js';

/**
 * ENREGISTREMENT VIDÉO
 *
 * Filme le canvas de composition via MediaRecorder. Aucun envoi réseau :
 * le clip vit dans la page jusqu'à ce qu'on le télécharge.
 *
 * Le navigateur choisit lui-même le meilleur conteneur disponible
 * (WebM/VP9, WebM/VP8, puis MP4 sur Safari).
 */
const CANDIDATE_TYPES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
];

export class VideoRecorder {
    /** @param {HTMLCanvasElement} canvas - canvas de composition à filmer */
    constructor(canvas) {
        this.canvas = canvas;
        this.recorder = null;
        this.chunks = [];
        this.startedAt = 0;
        this.duration = 0;
    }

    static get isSupported() {
        return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
    }

    get isRecording() {
        return this.recorder?.state === 'recording';
    }

    /** Durée écoulée en secondes (0 si à l'arrêt). */
    get elapsed() {
        return this.isRecording ? (performance.now() - this.startedAt) / 1000 : 0;
    }

    /** @returns {boolean} true si l'enregistrement a bien démarré */
    start() {
        if (this.isRecording) return false;
        if (!VideoRecorder.isSupported) {
            console.warn('🎥 Enregistrement vidéo non supporté par ce navigateur.');
            return false;
        }

        const mimeType = CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
        if (!mimeType) {
            console.warn('🎥 Aucun format vidéo supporté.');
            return false;
        }

        this.stream = this.canvas.captureStream(CONFIG.capture.videoFps);
        this.chunks = [];
        this.mimeType = mimeType;

        this.recorder = new MediaRecorder(this.stream, {
            mimeType,
            videoBitsPerSecond: CONFIG.capture.videoBitrate
        });
        this.recorder.ondataavailable = (event) => {
            if (event.data.size > 0) this.chunks.push(event.data);
        };

        this.recorder.start(1000); // un morceau par seconde : rien n'est perdu si ça coupe
        this.startedAt = performance.now();
        return true;
    }

    /** @returns {Promise<{blob: Blob, url: string, duration: number, extension: string}|null>} */
    stop() {
        if (!this.isRecording) return Promise.resolve(null);

        const duration = this.elapsed;
        return new Promise((resolve) => {
            this.recorder.onstop = () => {
                this.stream.getTracks().forEach((track) => track.stop());

                const blob = new Blob(this.chunks, { type: this.mimeType });
                this.chunks = [];
                this.recorder = null;

                resolve({
                    blob,
                    url: URL.createObjectURL(blob),
                    duration,
                    extension: this.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
                });
            };
            this.recorder.stop();
        });
    }
}
