import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';
import { drawMask, MASKS } from './faceMask.js';

const ROUND_TIME = 70;
const HOLD_TIME = 0.55;     // durée de maintien d'une grimace pour la valider
const CALIBRATION = 1.6;    // secondes de visage neutre au démarrage

/**
 * Les défis. Chacun lit le maillage facial et dit si la grimace est faite.
 * Les seuils comparent des rapports à la taille du visage, ou à la mesure
 * neutre relevée au départ : sans ça, rien ne marcherait pareil d'un
 * visage à l'autre.
 */
const CHALLENGES = [
    {
        id: 'bouche',
        label: 'Ouvrez grand la bouche',
        test: (m) => m.mouthOpen > 0.24
    },
    {
        id: 'yeux',
        label: 'Fermez les deux yeux',
        test: (m) => m.eyeLeft < 0.035 && m.eyeRight < 0.035
    },
    {
        id: 'clin',
        label: 'Un clin d\'œil',
        test: (m) => (m.eyeLeft < 0.032 && m.eyeRight > 0.05) || (m.eyeRight < 0.032 && m.eyeLeft > 0.05)
    },
    {
        id: 'penche-gauche',
        label: 'Penchez la tête à gauche',
        test: (m) => m.roll < -16
    },
    {
        id: 'penche-droite',
        label: 'Penchez la tête à droite',
        test: (m) => m.roll > 16
    },
    {
        id: 'sourcils',
        label: 'Levez les sourcils',
        test: (m, base) => m.brow > base.brow * 1.14
    },
    {
        id: 'sourire',
        label: 'Grand sourire',
        test: (m, base) => m.smile > base.smile * 1.1 && m.mouthOpen < 0.22
    }
];

/**
 * GRIMACES
 *
 * La borne réclame une tête, la tient une demi-seconde, et **photographie
 * la réussite**. À la fin de la manche, la pellicule s'ouvre sur toutes
 * les grimaces de la partie.
 *
 * Un masque suit le visage (touche N pour en changer) :
 * c'est lui qui rend les photos irrésistibles.
 */
export class GrimaceRush extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(240);
        this._onKeyDown = (event) => this._handleKey(event);
    }

    enter() {
        this.gameConfig = { cameraMode: 'fullscreen', hands: false, pose: false, face: true, smoothing: 0.6 };
        this.setup(this.gameConfig);
        this.game.display.setBackground(THEME.bg);

        this.maskIndex = 0;
        window.addEventListener('keydown', this._onKeyDown);
        this.reset();
    }

    exit() {
        this.clearTimers();
        window.removeEventListener('keydown', this._onKeyDown);
        this.modal.hide();
        this.particles.clear();
    }

    _handleKey(event) {
        // 'n' comme « nouveau masque » : 'm' est déjà le retour au menu,
        // et le moteur écoute avant nous, impossible de le lui reprendre.
        if (event.key.toLowerCase() !== 'n' || event.repeat) return;
        this.maskIndex = (this.maskIndex + 1) % (MASKS.length + 1);
        this.game.playSound('hover');
    }

    get maskKind() {
        return this.maskIndex < MASKS.length ? MASKS[this.maskIndex] : null;
    }

    reset() {
        this.state = 'WAITING';
        this.timeLeft = ROUND_TIME;
        this.deck = [];
        this.challenge = null;
        this.calibrating = 0;

        this.faces = [0, 1].map((id) => ({
            id,
            score: 0,
            hold: 0,
            baseline: null,
            samples: [],
            metrics: null
        }));

        this.particles.clear();
        this.modal.hide();
    }

    // ==========================================================
    //  MESURES DU VISAGE
    // ==========================================================

    /** Rapports invariants à la distance et à la taille du visage. */
    _measure(landmarks) {
        const height = distance(landmarks[10], landmarks[152]);
        if (!height) return null;

        // L'image est renvoyée en miroir au joueur : on inverse le signe
        // pour que « à gauche » soit bien sa gauche à l'écran.
        const roll = -(Math.atan2(
            landmarks[152].y - landmarks[10].y,
            landmarks[152].x - landmarks[10].x
        ) * 180 / Math.PI - 90);

        return {
            mouthOpen: distance(landmarks[13], landmarks[14]) / height,
            eyeLeft: distance(landmarks[386], landmarks[374]) / height,
            eyeRight: distance(landmarks[159], landmarks[145]) / height,
            brow: (distance(landmarks[105], landmarks[159]) + distance(landmarks[334], landmarks[386])) / (2 * height),
            smile: distance(landmarks[61], landmarks[291]) / height,
            // Normalisé dans [-180, 180] : la tête penche à gauche ou à droite
            roll: ((roll + 540) % 360) - 180
        };
    }

    // ==========================================================
    //  BOUCLE
    // ==========================================================

    update(dt) {
        if (this.modal.isVisible) return;

        const inputs = this.game.inputs.players;
        let anyFace = false;

        for (const face of this.faces) {
            const raw = inputs[face.id]?.face?.raw;
            face.metrics = raw ? this._measure(raw) : null;
            if (face.metrics) anyFace = true;
        }

        if (this.state === 'WAITING') {
            if (anyFace) {
                this.state = 'CALIBRATION';
                this.calibrating = CALIBRATION;
            }
            return;
        }

        if (this.state === 'CALIBRATION') {
            this._calibrate(dt);
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._finish();
            return;
        }

        this._updateChallenge(dt);
        this.particles.update(dt);
    }

    /** Visage neutre : sourcils et sourire varient trop d'une personne à l'autre. */
    _calibrate(dt) {
        this.calibrating -= dt;

        for (const face of this.faces) {
            if (face.metrics) face.samples.push(face.metrics);
        }

        if (this.calibrating > 0) return;

        for (const face of this.faces) {
            const samples = face.samples;
            face.baseline = samples.length
                ? {
                    brow: average(samples.map((m) => m.brow)),
                    smile: average(samples.map((m) => m.smile))
                }
                : { brow: 0.12, smile: 0.42 };
            face.samples = [];
        }

        this.state = 'PLAYING';
        this._nextChallenge();
    }

    _nextChallenge() {
        // On brasse le paquet pour ne pas redemander deux fois la même tête
        if (this.deck.length === 0) {
            this.deck = shuffle([...CHALLENGES]);
        }
        this.challenge = this.deck.pop();
        for (const face of this.faces) face.hold = 0;
    }

    _updateChallenge(dt) {
        if (!this.challenge) return;

        for (const face of this.faces) {
            if (!face.metrics || !face.baseline) {
                face.hold = 0;
                continue;
            }

            const ok = this.challenge.test(face.metrics, face.baseline);
            face.hold = ok ? face.hold + dt : Math.max(0, face.hold - dt * 2);

            if (face.hold >= HOLD_TIME) {
                this._succeed(face);
                return;
            }
        }
    }

    _succeed(face) {
        face.score++;

        // Le moment de gloire : la borne photographie la grimace
        this.game.capture.snap(`${this.challenge.label} — joueur ${face.id + 1}`);

        const display = this.game.display;
        this.particles.spawn(display.virtW / 2, display.virtH * 0.3, playerColor(face.id),
            { count: 18, speed: 300, size: 4, life: 0.6 });

        this._nextChallenge();
    }

    _finish() {
        this.state = 'GAMEOVER';
        const [a, b] = this.faces;
        const duo = b.score > 0 || this.game.inputs.players[1]?.detected;

        this.after(700, () => {
            const result = duo ? { p1: a.score, p2: b.score } : `${a.score} grimaces`;
            this.modal.show(result, this.gameConfig, () => this.reset());
            // La récompense : revoir toutes les têtes de la partie
            this.after(900, () => this.game.capture.openGallery());
        });
    }

    // ==========================================================
    //  RENDU
    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.fillStyle = 'rgba(16, 18, 20, 0.35)';
        ctx.fillRect(0, 0, w, h);

        this._drawMasks(ctx, display);
        this.particles.draw(ctx);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'GRIMACES',
                'Montrez votre visage · chaque grimace réussie est photographiée');
            return;
        }

        if (this.state === 'CALIBRATION') {
            drawMessage(ctx, w, h, 'VISAGE NEUTRE',
                'Ne bougez pas, on prend vos mesures…', { dim: 0.5 });
            const width = Math.min(w * 0.3, 260);
            drawGauge(ctx, w / 2 - width / 2, h * 0.62, width, 4,
                1 - this.calibrating / CALIBRATION, THEME.accent);
            return;
        }

        this._drawHud(ctx, w, h);
    }

    _drawMasks(ctx, display) {
        const kind = this.maskKind;
        if (!kind) return;

        for (const face of this.faces) {
            const raw = this.game.inputs.players[face.id]?.face?.raw;
            if (raw) drawMask(ctx, raw, display, kind);
        }
    }

    _drawHud(ctx, w, h) {
        const duo = this.game.inputs.players[1]?.detected;
        const entries = [
            { label: duo ? 'Joueur 1' : 'Grimaces', value: this.faces[0].score, color: playerColor(0) },
            { label: 'Temps', value: Math.ceil(this.timeLeft), color: this.timeLeft < 10 ? THEME.danger : THEME.textStrong }
        ];
        if (duo) entries.push({ label: 'Joueur 2', value: this.faces[1].score, color: playerColor(1) });
        drawScoreBar(ctx, w, entries);

        drawGauge(ctx, w / 2 - 110, 132, 220, 3, this.timeLeft / ROUND_TIME,
            this.timeLeft < 10 ? THEME.danger : THEME.accent);

        if (!this.challenge) return;

        // La consigne, bien lisible, avec l'anneau de maintien
        const best = Math.max(...this.faces.map((face) => face.hold));
        const ratio = Math.min(1, best / HOLD_TIME);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const boxWidth = Math.min(w * 0.7, 640);
        const boxY = h * 0.78;
        ctx.fillStyle = 'rgba(16, 18, 20, 0.8)';
        ctx.beginPath();
        ctx.roundRect(w / 2 - boxWidth / 2, boxY, boxWidth, 66, 14);
        ctx.fill();
        ctx.strokeStyle = alpha(ratio > 0 ? THEME.accent : THEME.textMuted, 0.35);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = THEME.textStrong;
        ctx.font = `600 22px ${THEME.fontDisplay}`;
        ctx.fillText(this.challenge.label, w / 2, boxY + 26);

        drawGauge(ctx, w / 2 - boxWidth / 2 + 24, boxY + 46, boxWidth - 48, 4, ratio, THEME.accent);

        ctx.fillStyle = THEME.textMuted;
        ctx.font = `500 11px ${THEME.fontUi}`;
        const mask = this.maskKind ? `Masque : ${this.maskKind} · N pour changer` : 'Sans masque · N pour en mettre un';
        ctx.fillText(mask, w / 2, boxY + 82);

        // Sans caméra, les grimaces se font au clavier
        if (this.game.inputs.mode !== 'vision') {
            ctx.fillText('E bouche · A yeux · Z clin · S sourcils · X sourire · Q/D pencher',
                w / 2, boxY + 100);
        }
        ctx.restore();
    }
}

/* ------------------------------------------------------------------ */

const distance = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);
const average = (values) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);

function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

registerGame({
    id: 'grimace_rush',
    name: 'GRIMACES',
    icon: '😜',
    color: '#c08a86',
    players: 2,
    description: 'Enchaînez les têtes demandées : chaque réussite est photographiée.',
    class: GrimaceRush
});
