import { CONFIG } from './Config.js';

/**
 * PALIERS DE QUALITÉ
 *
 * Une borne d'arcade tourne aussi bien sur un portable récent que sur un
 * mini PC sans pilote graphique. Le même réglage ne peut pas convenir aux
 * deux : ici, la machine est mesurée, pas devinée.
 *
 * Chaque palier baisse ce qui coûte sans toucher aux règles des jeux :
 * la définition de la caméra, celle de l'image analysée, la fréquence des
 * analyses et la finesse du retour vidéo.
 *
 * Ce qu'on ne baisse pas : le nombre d'images par seconde des jeux. Un jeu
 * saccadé est injouable, alors qu'un suivi rafraîchi vingt fois par seconde
 * au lieu de trente reste parfaitement confortable.
 */
export const QUALITY_LEVELS = [
    {
        // Le palier haut n'invente rien : c'est la configuration du projet.
        // Les suivants en sont des dégradations explicites.
        name: 'élevée',
        camera: CONFIG.vision.camera,
        analysis: { width: CONFIG.vision.analysisWidth, height: CONFIG.vision.analysisHeight },
        feedbackMaxWidth: CONFIG.vision.feedbackMaxWidth,
        maxFps: CONFIG.vision.maxFps,
        overlays: true
    },
    {
        name: 'allégée',
        camera: { width: 800, height: 450 },
        analysis: { width: 320, height: 240 },
        feedbackMaxWidth: 800,
        maxFps: 26,
        overlays: true
    },
    {
        name: 'économe',
        camera: { width: 640, height: 360 },
        analysis: { width: 288, height: 216 },
        feedbackMaxWidth: 640,
        maxFps: 22,
        overlays: false
    },
    {
        name: 'minimale',
        camera: { width: 480, height: 270 },
        analysis: { width: 224, height: 168 },
        feedbackMaxWidth: 480,
        maxFps: 16,
        overlays: false
    }
];

// Seuils de bascule. L'écart entre « mauvais » et « bon » est volontaire :
// sans lui, une machine pile à la limite oscillerait entre deux paliers.
const BAD_FPS = 45;
const BAD_INFERENCE_MS = 130;
const GOOD_FPS = 55;
const GOOD_INFERENCE_MS = 60;

const WARMUP = 8;        // secondes ignorées : chargement et compilation
const DROP_AFTER = 3;    // secondes de gêne avant de descendre d'un cran
const RAISE_AFTER = 20;  // remonter demande une accalmie bien plus longue
const COOLDOWN = 5;      // délai avant de juger l'effet d'un changement

export class Quality {
    /** @param {import('../input/InputSystem.js').InputSystem} inputs */
    constructor(inputs) {
        this.inputs = inputs;
        this.level = 0;
        this.auto = CONFIG.vision.autoQuality !== false;

        this._badTime = 0;
        this._goodTime = 0;
        this._since = 0;
        this._cooldown = 0;
        this._check = null;       // palier à juger une fois le délai passé
        this._giveUp = new Set(); // gênes que baisser la qualité ne soigne pas
        this.lastChange = null;   // message à afficher une fois
    }

    get current() {
        return QUALITY_LEVELS[this.level];
    }

    get label() {
        return `${this.current.name}${this.auto ? ' (auto)' : ''}`;
    }

    /** Applique un palier et le verrouille : plus d'ajustement automatique. */
    force(level) {
        this.auto = false;
        this._check = null;
        this._applyLevel(Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level)));
    }

    /** Rend la main à la mesure. */
    setAuto() {
        this.auto = true;
        this._badTime = 0;
        this._goodTime = 0;
        this._giveUp.clear();
        this._cooldown = COOLDOWN;
    }

    /** Automatique, puis chaque palier, en boucle : sert au bouton du bandeau. */
    cycle() {
        if (this.auto) this.force(0);
        else if (this.level >= QUALITY_LEVELS.length - 1) this.setAuto();
        else this.force(this.level + 1);
        return this.label;
    }

    /**
     * @param {number} dt - secondes depuis la frame précédente
     * @param {number} fps - images par seconde mesurées
     * @param {number} inferenceMs - coût de la dernière analyse
     */
    update(dt, fps, inferenceMs) {
        // Hors vision, les leviers de ce module n'ont aucune prise
        if (!this.auto || this.inputs.mode !== 'vision') return;

        this._since += dt;
        if (this._since < WARMUP) return;

        if (this._cooldown > 0) {
            this._cooldown -= dt;
            return;
        }

        if (this._check && this._judge(fps, inferenceMs)) return;

        // Deux gênes distinctes : un rendu qui saccade, et un suivi qui
        // traîne. La première se voit, la seconde se sent.
        const reason = this._complaint(fps, inferenceMs);
        const comfortable = fps >= GOOD_FPS && inferenceMs > 0 && inferenceMs < GOOD_INFERENCE_MS;

        this._badTime = reason ? this._badTime + dt : 0;
        this._goodTime = comfortable ? this._goodTime + dt : 0;

        if (this._badTime >= DROP_AFTER && this.level < QUALITY_LEVELS.length - 1) {
            this._check = {
                reason,
                from: this.level,
                before: reason === 'fps' ? fps : inferenceMs
            };
            this._applyLevel(this.level + 1);
            this.lastChange = `Qualité ${this.current.name} : la machine peinait.`;
            console.log(`⚙️ QUALITÉ: palier « ${this.current.name} » (${fps} fps, analyse ${Math.round(inferenceMs)} ms)`);
        } else if (this._goodTime >= RAISE_AFTER && this.level > 0) {
            this._applyLevel(this.level - 1);
            this.lastChange = `Qualité ${this.current.name} : la machine suit.`;
            console.log(`⚙️ QUALITÉ: retour au palier « ${this.current.name} »`);
        }
    }

    /** Quelle gêne justifie de baisser la qualité, s'il y en a une ? */
    _complaint(fps, inferenceMs) {
        if (fps < BAD_FPS && !this._giveUp.has('fps')) return 'fps';
        if (inferenceMs > BAD_INFERENCE_MS && !this._giveUp.has('analyse')) return 'analyse';
        return null;
    }

    /**
     * Le dernier palier a-t-il servi à quelque chose ?
     *
     * Baisser la qualité n'aide que si le goulot est bien là où on croit.
     * Une machine qui plafonne à 30 images par seconde pour une autre
     * raison (compositeur logiciel, écran bridé) n'y gagnerait rien : on
     * lui rend sa qualité et on arrête d'insister.
     *
     * @returns {boolean} true si l'on a fait marche arrière
     */
    _judge(fps, inferenceMs) {
        const { reason, from, before } = this._check;
        this._check = null;

        const now = reason === 'fps' ? fps : inferenceMs;
        const better = reason === 'fps' ? now > before + 3 : now < before * 0.88;
        if (better) return false;

        this._giveUp.add(reason);
        this._applyLevel(from);
        this.lastChange = null;
        console.log(`⚙️ QUALITÉ: baisser n'y change rien (${reason}), retour au palier « ${this.current.name} »`);
        return true;
    }

    _applyLevel(level) {
        this.level = level;
        this._badTime = 0;
        this._goodTime = 0;
        this._cooldown = COOLDOWN;
        this.inputs.applyQuality(this.current);
    }

    /** Message à afficher une seule fois, puis oublié. */
    takeNotice() {
        const notice = this.lastChange;
        this.lastChange = null;
        return notice;
    }
}
