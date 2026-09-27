/**
 * FILTRES DE SIGNAL
 *
 * Le suivi par caméra tremble à l'arrêt et traîne en mouvement. Un lissage
 * à coefficient fixe ne peut pas régler les deux : plus on lisse, plus on
 * ajoute de retard.
 *
 * Le filtre « 1 € » (Casiez, Roussel & Vogel, 2012) adapte sa coupure à la
 * vitesse : très filtrant quand la main est posée, presque transparent
 * quand elle part vite. C'est la référence pour le pointage gestuel.
 */

/** Passe-bas du premier ordre, réutilisable. */
class LowPass {
    constructor() {
        this.value = null;
    }

    filter(x, alpha) {
        this.value = this.value === null ? x : alpha * x + (1 - alpha) * this.value;
        return this.value;
    }

    reset() {
        this.value = null;
    }
}

/** Coefficient d'un passe-bas pour une fréquence de coupure donnée. */
function alphaFor(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / Math.max(dt, 1e-4));
}

export class OneEuroFilter {
    /**
     * @param {object} [options]
     * @param {number} [options.minCutoff=1.2] - coupure au repos (Hz).
     *        Plus bas = plus stable, mais plus mou.
     * @param {number} [options.beta=0.02] - réactivité à la vitesse.
     *        Plus haut = moins de retard quand ça bouge vite.
     * @param {number} [options.derivativeCutoff=1] - lissage de la vitesse
     */
    constructor({ minCutoff = 1.2, beta = 0.02, derivativeCutoff = 1 } = {}) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.derivativeCutoff = derivativeCutoff;

        this._value = new LowPass();
        this._derivative = new LowPass();
        this._previous = null;

        /** Vitesse filtrée, en unités par seconde. Utile aux jeux. */
        this.speed = 0;
    }

    filter(x, dt) {
        if (!Number.isFinite(x)) return this._value.value ?? 0;

        const rate = this._previous === null ? 0 : (x - this._previous) / Math.max(dt, 1e-4);
        this._previous = x;

        const derivative = this._derivative.filter(rate, alphaFor(this.derivativeCutoff, dt));
        this.speed = derivative;

        // Le cœur du filtre : la coupure monte avec la vitesse observée
        const cutoff = this.minCutoff + this.beta * Math.abs(derivative);
        return this._value.filter(x, alphaFor(cutoff, dt));
    }

    reset() {
        this._value.reset();
        this._derivative.reset();
        this._previous = null;
        this.speed = 0;
    }
}

/** Paire de filtres pour une position 2D, avec sa vitesse. */
export class Vec2Filter {
    constructor(options) {
        this.x = new OneEuroFilter(options);
        this.y = new OneEuroFilter(options);
    }

    filter(x, y, dt) {
        return { x: this.x.filter(x, dt), y: this.y.filter(y, dt) };
    }

    get speed() {
        return Math.hypot(this.x.speed, this.y.speed);
    }

    reset() {
        this.x.reset();
        this.y.reset();
    }
}

/**
 * Seuil à hystérésis (déclencheur de Schmitt).
 *
 * Un seuil unique fait clignoter l'état quand la mesure oscille autour :
 * un pincement « presque fermé » s'allumait et s'éteignait dix fois par
 * seconde. Avec deux seuils, il faut franchir nettement pour changer.
 */
export class Hysteresis {
    /**
     * @param {number} onBelow - on s'active en passant SOUS cette valeur
     * @param {number} offAbove - on se désactive en repassant AU-DESSUS
     */
    constructor(onBelow, offAbove) {
        this.onBelow = onBelow;
        this.offAbove = offAbove;
        this.state = false;
    }

    update(value) {
        if (this.state) {
            if (value > this.offAbove) this.state = false;
        } else if (value < this.onBelow) {
            this.state = true;
        }
        return this.state;
    }

    reset() {
        this.state = false;
    }
}
