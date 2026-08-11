/**
 * CLIENT DU WORKER DE VISION
 *
 * Fine enveloppe autour de `vision.worker.js` : démarrage, envoi des
 * images, réception des résultats. Une seule image en vol à la fois —
 * si le worker est occupé, la frame est simplement sautée (un suivi en
 * retard d'une image vaut mieux qu'une file qui s'allonge).
 */
export class VisionWorkerClient {
    constructor() {
        this.worker = null;
        this.busy = false;
        this.onResult = null;
    }

    static get isSupported() {
        return typeof Worker !== 'undefined'
            && typeof OffscreenCanvas !== 'undefined'
            && typeof createImageBitmap === 'function';
    }

    /**
     * Démarre le worker et charge les modèles.
     * @param {{wasm:string, models:object, delegate:string, players:number,
     *          analysisWidth:number, analysisHeight:number}} options
     */
    init(options) {
        this.dispose();

        return new Promise((resolve, reject) => {
            let settled = false;
            const fail = (message) => {
                if (settled) return;
                settled = true;
                this.dispose();
                reject(new Error(message));
            };

            // Le chargement des modèles depuis le CDN peut être long
            const timeout = setTimeout(() => fail('WORKER_TIMEOUT'), 60000);

            try {
                // Worker classique : voir l'en-tête de vision.worker.js
                this.worker = new Worker(new URL('./vision.worker.js', import.meta.url));
            } catch (error) {
                clearTimeout(timeout);
                fail(String(error?.message || error));
                return;
            }

            this.worker.onerror = (event) => {
                clearTimeout(timeout);
                fail(event.message || 'WORKER_ERROR');
            };

            this.worker.onmessage = (event) => {
                const msg = event.data;

                if (msg.type === 'ready') {
                    clearTimeout(timeout);
                    settled = true;
                    resolve();
                    return;
                }
                if (msg.type === 'init-error') {
                    clearTimeout(timeout);
                    fail(msg.message);
                    return;
                }

                // Régime de croisière : chaque réponse libère le vol suivant
                this.busy = false;
                if (msg.type === 'results' && msg.kind && this.onResult) {
                    this.onResult(msg);
                }
            };

            this.worker.postMessage({ type: 'init', ...options });
        });
    }

    setConfig(enabled) {
        this.worker?.postMessage({ type: 'config', enabled });
    }

    setPlayers(count) {
        this.worker?.postMessage({ type: 'players', count });
    }

    /** @param {ImageBitmap} bitmap - transféré, donc zéro copie */
    sendFrame(bitmap, ts) {
        if (!this.worker || this.busy) {
            bitmap.close();
            return;
        }
        this.busy = true;
        this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
    }

    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.busy = false;
    }
}
