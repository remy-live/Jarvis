import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';

const ROUND_TIME = 90;
const GREEN_MIN = 1.8;
const GREEN_MAX = 3.8;
const RED_MIN = 1.6;
const RED_MAX = 3.2;
const WARNING = 0.7;        // préavis avant le rouge : on doit pouvoir s'arrêter
const MOVE_THRESHOLD = 0.028; // agitation tolérée au rouge (fraction de la carrure)
// Réglé pour qu'il faille une vingtaine de secondes d'agitation franche,
// donc traverser plusieurs feux rouges : c'est là qu'est le jeu.
const ADVANCE_RATE = 0.055;
const PENALTY = 0.07;        // recul quand on est pris en flagrant délit

// Points suivis pour mesurer l'agitation : tête, épaules, mains, hanches
const TRACKED = [0, 11, 12, 15, 16, 23, 24];

/**
 * 1-2-3 SOLEIL
 *
 * Au vert, on avance en s'agitant : plus vous bougez, plus vous avancez.
 * Au rouge, on se fige — et le moindre mouvement vous fait reculer,
 * pendant que la borne **prend une photo de vous en train de bouger**.
 *
 * À la fin de la manche, la pellicule s'ouvre sur tous les flagrants
 * délits. C'est là que le jeu devient drôle.
 */
export class RedLight extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(260);
    }

    enter() {
        this.gameConfig = { cameraMode: 'fullscreen', hands: false, pose: true, face: false, smoothing: 0.9 };
        this.setup(this.gameConfig);
        this.game.display.setBackground(THEME.bg);
        this.reset();
    }

    exit() {
        this.clearTimers();
        this.modal.hide();
        this.particles.clear();
    }

    reset() {
        this.state = 'WAITING';
        this.timeLeft = ROUND_TIME;
        this.phase = 'green';       // green → warning → red
        this.phaseTimer = 0;
        this.winner = null;
        this.flash = 0;
        this.snapCooldown = 0;

        this.walkers = [0, 1].map((id) => ({
            id,
            progress: 0,
            motion: 0,
            caught: 0,
            busted: 0,
            present: false,
            lastVersion: -1,   // version d'analyse déjà prise en compte
            lastPoints: null
        }));

        this.particles.clear();
        this.modal.hide();
    }

    // ==========================================================
    //  BOUCLE
    // ==========================================================

    update(dt) {
        if (this.modal.isVisible) return;

        this._measureMotion();

        if (this.state === 'WAITING') {
            if (this.walkers.some((walker) => walker.present)) {
                this.state = 'PLAYING';
                this._setPhase('green');
            }
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.timeLeft -= dt;
        this.flash = Math.max(0, this.flash - dt * 2.5);
        this.snapCooldown = Math.max(0, this.snapCooldown - dt);

        this._updatePhase(dt);
        this._updateWalkers(dt);
        this.particles.update(dt);

        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._finish();
        }
    }

    /**
     * Agitation de chaque joueur, mesurée entre deux analyses de l'IA.
     *
     * L'IA tourne moins vite que l'affichage : comparer à chaque frame
     * donnerait des zéros la plupart du temps. On ne mesure donc que
     * lorsqu'un nouveau résultat arrive — reconnaissable au fait que le
     * tableau de landmarks change d'identité.
     */
    _measureMotion() {
        const inputs = this.game.inputs;
        const players = inputs.players;
        const version = inputs.versions.pose;

        for (const walker of this.walkers) {
            const raw = players[walker.id]?.pose?.raw;
            walker.present = Boolean(raw);

            if (!raw) {
                walker.motion = 0;
                walker.lastVersion = -1;
                walker.lastPoints = null;
                continue;
            }
            if (version === walker.lastVersion) continue; // pas de nouvelle analyse
            walker.lastVersion = version;

            // Carrure : sert d'unité, pour que s'éloigner ne change rien
            const shoulders = Math.hypot(raw[11].x - raw[12].x, raw[11].y - raw[12].y) || 0.1;
            const points = TRACKED.map((i) => ({ x: raw[i].x, y: raw[i].y }));

            if (walker.lastPoints) {
                let sum = 0;
                for (let i = 0; i < points.length; i++) {
                    sum += Math.hypot(points[i].x - walker.lastPoints[i].x,
                        points[i].y - walker.lastPoints[i].y);
                }
                const amount = sum / points.length / shoulders;
                // Moyenne glissante : un raté de détection ne doit pas
                // passer pour un mouvement.
                walker.motion = walker.motion * 0.45 + amount * 0.55;
            }
            walker.lastPoints = points;
        }
    }

    _setPhase(phase) {
        this.phase = phase;

        if (phase === 'green') {
            this.phaseTimer = GREEN_MIN + Math.random() * (GREEN_MAX - GREEN_MIN);
        } else if (phase === 'warning') {
            this.phaseTimer = WARNING;
            this.game.playSound('hover');
        } else {
            this.phaseTimer = RED_MIN + Math.random() * (RED_MAX - RED_MIN);
            this.flash = 1;
            this.game.playSound('select');
        }
    }

    _updatePhase(dt) {
        this.phaseTimer -= dt;
        if (this.phaseTimer > 0) return;

        if (this.phase === 'green') this._setPhase('warning');
        else if (this.phase === 'warning') this._setPhase('red');
        else this._setPhase('green');
    }

    _updateWalkers(dt) {
        for (const walker of this.walkers) {
            if (walker.caught > 0) walker.caught -= dt;
            if (!walker.present) continue;

            if (this.phase === 'red') {
                this._checkStillness(walker, dt);
                continue;
            }

            // Au vert (et pendant le préavis), on avance en s'agitant
            const effort = Math.min(1, walker.motion / 0.09);
            walker.progress = Math.min(1, walker.progress + effort * ADVANCE_RATE * dt);

            if (walker.progress >= 1) this._win(walker);
        }
    }

    _checkStillness(walker, dt) {
        if (walker.motion <= MOVE_THRESHOLD || walker.caught > 0) return;

        walker.busted++;
        walker.caught = 1.2;
        walker.progress = Math.max(0, walker.progress - PENALTY);

        // Une seule photo à la fois, sinon une secousse en déclenche dix
        if (this.snapCooldown <= 0) {
            this.snapCooldown = 1.5;
            this.game.capture.snap(`Pris en flagrant délit — joueur ${walker.id + 1}`);
        }

        const display = this.game.display;
        this.particles.spawn(display.virtW * (walker.id === 0 ? 0.3 : 0.7), display.virtH * 0.5,
            THEME.danger, { count: 20, speed: 320, size: 4, life: 0.6 });
    }

    _win(walker) {
        this.winner = walker.id;
        this.state = 'GAMEOVER';
        this.game.capture.snap(`Vainqueur — joueur ${walker.id + 1}`);
        this.after(900, () => this._showResult());
    }

    _finish() {
        this.state = 'GAMEOVER';
        this.after(600, () => this._showResult());
    }

    _showResult() {
        const [a, b] = this.walkers;
        const duo = b.present || b.progress > 0;

        const label = (walker) => `${Math.round(walker.progress * 100)} %`;
        const result = this.winner !== null
            ? `JOUEUR ${this.winner + 1} GAGNE`
            : duo ? { p1: label(a), p2: label(b) } : `${label(a)} du chemin`;

        this.modal.show(result, this.gameConfig, () => this.reset());
        this.after(900, () => this.game.capture.openGallery());
    }

    // ==========================================================
    //  RENDU
    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        const tint = this.phase === 'red'
            ? alpha(THEME.danger, 0.1 + this.flash * 0.18)
            : this.phase === 'warning'
                ? alpha(THEME.accentWarm, 0.1)
                : alpha(THEME.success, 0.06);

        ctx.fillStyle = 'rgba(16, 18, 20, 0.42)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, w, h);

        this.particles.draw(ctx);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, '1 · 2 · 3 SOLEIL',
                'Reculez pour être vu en entier · bougez au vert, figez-vous au rouge');
            return;
        }

        this._drawLight(ctx, w, h);
        this._drawTracks(ctx, w, h);
        this._drawHud(ctx, w, h);
    }

    /** Le feu, gros et sans ambiguïté : c'est toute l'information du jeu. */
    _drawLight(ctx, w, h) {
        const green = this.phase === 'green';
        const warning = this.phase === 'warning';
        const color = green ? THEME.success : warning ? THEME.accentWarm : THEME.danger;
        const label = green ? 'BOUGEZ' : warning ? 'ATTENTION…' : 'NE BOUGEZ PLUS';

        const cx = w / 2;
        const cy = h * 0.3;
        const radius = Math.min(w, h) * 0.085;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = alpha(color, 0.22);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Sablier de la phase en cours : on sait combien de temps il reste
        const total = green ? GREEN_MAX : warning ? WARNING : RED_MAX;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 10, -Math.PI / 2,
            -Math.PI / 2 + Math.min(1, this.phaseTimer / total) * Math.PI * 2);
        ctx.strokeStyle = alpha(color, 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = `600 ${Math.round(radius * 0.42)}px ${THEME.fontDisplay}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy + radius + 34);
        ctx.restore();
    }

    _drawTracks(ctx, w, h) {
        const walkers = this.walkers.filter((walker) => walker.present || walker.progress > 0);
        if (walkers.length === 0) return;

        const trackWidth = Math.min(w * 0.7, 720);
        const x = w / 2 - trackWidth / 2;
        let y = h * 0.62;

        ctx.save();
        for (const walker of walkers) {
            const color = playerColor(walker.id);
            const caught = walker.caught > 0;

            ctx.fillStyle = caught ? THEME.danger : THEME.textMuted;
            ctx.font = `500 12px ${THEME.fontUi}`;
            ctx.textAlign = 'left';
            ctx.fillText(caught ? `JOUEUR ${walker.id + 1} — BOUGÉ !` : `Joueur ${walker.id + 1}`, x, y - 12);

            drawGauge(ctx, x, y, trackWidth, 10, walker.progress, caught ? THEME.danger : color);

            // Le marcheur sur sa piste
            const px = x + walker.progress * trackWidth;
            ctx.fillStyle = caught ? THEME.danger : color;
            ctx.beginPath();
            ctx.arc(px, y + 5, 9, 0, Math.PI * 2);
            ctx.fill();

            // Témoin d'agitation : utile pour comprendre ce que l'IA voit
            const motion = Math.min(1, walker.motion / 0.12);
            ctx.fillStyle = alpha(this.phase === 'red' ? THEME.danger : THEME.textMuted, 0.5);
            ctx.fillRect(x + trackWidth + 14, y + 9 - motion * 18, 5, motion * 18);

            y += 62;
        }
        ctx.restore();
    }

    _drawHud(ctx, w, h) {
        const duo = this.walkers[1].present || this.walkers[1].progress > 0;
        const entries = [
            { label: duo ? 'Joueur 1' : 'Avancée', value: `${Math.round(this.walkers[0].progress * 100)}%`, color: playerColor(0) },
            { label: 'Temps', value: Math.ceil(this.timeLeft), color: this.timeLeft < 10 ? THEME.danger : THEME.textStrong }
        ];
        if (duo) {
            entries.push({
                label: 'Joueur 2',
                value: `${Math.round(this.walkers[1].progress * 100)}%`,
                color: playerColor(1)
            });
        }
        drawScoreBar(ctx, w, entries);

        const busted = this.walkers.reduce((sum, walker) => sum + walker.busted, 0);
        if (busted === 0) return;

        ctx.save();
        ctx.font = `500 12px ${THEME.fontUi}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.textMuted;
        ctx.fillText(`${busted} photo${busted > 1 ? 's' : ''} de flagrant délit`, w / 2, h - 34);
        ctx.restore();
    }
}

registerGame({
    id: 'red_light',
    name: '1·2·3 SOLEIL',
    icon: '🚦',
    color: '#8faa8b',
    players: 2,
    description: 'Avancez au vert, figez-vous au rouge — sinon, photo souvenir.',
    class: RedLight
});
