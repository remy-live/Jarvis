/**
 * CLIENT DU WORKER DE VISION
 *
 * Fine enveloppe autour de `vision.worker.js` : démarrage, envoi des
 * images, réception des résultats. Une seule image en vol à la fois —
 * si le worker est occupé, la frame est simplement sautée (un suivi en
 * retard d'une image vaut mieux qu'une file qui s'allonge).
 */
// Une inférence lente (GPU logiciel, machine modeste) peut légitimement
// durer plusieurs secondes. Le chien de garde ne doit se déclencher que
// bien au-delà, sinon il renvoie une image pendant que le worker calcule
// encore et empile le travail au lieu de le débloquer.
const STUCK_TIMEOUT = 9000;
const WARMUP_TIMEOUT = 45000; // première inférence : compilation des shaders

export class VisionWorkerClient {
    constructor() {
        this.worker = null;
        this.busy = false;
        this._sentAt = 0;
        this._hadResult = false;
        this.onResult = null;
    }

    /**
     * Une analyse est-elle en cours ?
     *
     * Chien de garde intégré : une image restée sans réponse finit par
     * libérer le verrou. Sans lui, un worker coincé gèlerait le suivi
     * pour toute la session.
     */
    get isBusy() {
        // La toute première analyse compile les shaders et peut prendre
        // bien plus longtemps que les suivantes : on ne la surveille pas.
        const limit = this._hadResult ? STUCK_TIMEOUT : WARMUP_TIMEOUT;
        if (this.busy && performance.now() - this._sentAt > limit) {
            console.warn('⚠️ Analyse sans réponse, worker débloqué.');
            this.busy = false;
        }
        return this.busy;
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
                this._hadResult = true;
                // On transmet aussi les analyses sautées (kind null) :
                // InputSystem les compte pour le diagnostic.
                if (msg.type === 'frame-error' && !this._warned) {
                    this._warned = true;
                    console.warn('⚠️ Analyse en échec dans le worker :', msg.message);
                }
                if (msg.type === 'results' && this.onResult) this.onResult(msg);
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

    /** Nouvelle définition de l'image analysée (palier de qualité). */
    resize(width, height) {
        this.worker?.postMessage({ type: 'resize', width, height });
    }

    /** @param {ImageBitmap} bitmap - transféré, donc zéro copie */
    sendFrame(bitmap, ts) {
        if (!this.worker || this.isBusy) {
            bitmap.close();
            return;
        }

        this.busy = true;
        this._sentAt = performance.now();
        this.worker.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
    }

    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.busy = false;
    }
}
