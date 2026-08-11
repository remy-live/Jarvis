/**
 * CLASSE DE BASE DES JEUX
 *
 * Cycle de vie appelé par le moteur :
 *   new Game(engine) -> enter() -> update(dt)/render(display) ... -> exit()
 */
export class Game {
    /** @param {import('./Engine.js').Engine} engine */
    constructor(engine) {
        this.engine = engine;
        // Alias historique : la plupart des jeux écrivent `this.game`
        this.game = engine;

        this.isMenu = false;
        this._timers = [];
    }

    /**
     * Configure caméra et IA pour ce jeu.
     * @param {object} options
     * @param {'vignette'|'fullscreen'|'hidden'} [options.cameraMode='vignette']
     * @param {boolean} [options.hands=true] - suivi des mains (curseur)
     * @param {boolean} [options.face=false] - suivi du visage
     * @param {boolean} [options.pose=false] - suivi du corps
     * @param {number}  [options.smoothing] - réactivité (0 = mou, 1 = brut)
     */
    setup(options = {}) {
        const inputs = this.engine.inputs;

        inputs.setCameraMode(options.cameraMode || 'vignette');
        inputs.setActiveTrackers({
            hands: options.hands !== false,
            face: options.face === true,
            pose: options.pose === true
        });

        if (typeof options.smoothing === 'number') inputs.setSmoothing(options.smoothing);
    }

    /**
     * setTimeout automatiquement annulé à la sortie du jeu.
     * Évite qu'une fin de partie ressuscite un jeu déjà quitté.
     */
    after(delayMs, callback) {
        const id = setTimeout(() => {
            this._timers = this._timers.filter((t) => t !== id);
            callback();
        }, delayMs);
        this._timers.push(id);
        return id;
    }

    /** À appeler depuis exit() si le jeu surcharge la méthode. */
    clearTimers() {
        this._timers.forEach(clearTimeout);
        this._timers = [];
    }

    // Surchargées par les jeux
    enter() {}
    update(dt) {}
    render(display) {}
    exit() { this.clearTimers(); }
}
