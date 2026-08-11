import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { pointerOf, drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';

const ROUND_TIME = 75;
const BUZZ_FREEZE = 0.7;      // secondes d'immobilisation après une touche
const CHECKPOINTS = [0.34, 0.67];
const SAMPLES = 240;          // finesse du tracé, pour la collision comme pour le rendu

/**
 * FIL ÉLECTRIQUE
 *
 * Le jeu de l'anneau et du fil tordu, au doigt : suivez le couloir du
 * départ à l'arrivée sans jamais toucher les bords. Au contact, ça sonne
 * et vous repartez du dernier point de passage.
 *
 * Chaque parcours réussi en génère un plus étroit et plus tortueux.
 * À deux, chacun sa moitié d'écran et le même tracé : c'est une course.
 */
export class WireMaze extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(240);
    }

    enter() {
        // Le doigt doit être précis : peu de lissage, pas d'IA superflue
        this.gameConfig = { cameraMode: 'fullscreen', hands: true, pose: false, face: false, smoothing: 0.7 };
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
        this.duo = false;
        this.layoutKey = '';

        this.racers = [0, 1].map((id) => ({
            id,
            level: 1,
            progress: 0,
            checkpoint: 0,
            faults: 0,
            armed: false,
            buzzTimer: 0,
            finger: null,
            path: null,          // tracé en pixels, propre à sa moitié d'écran
            corridor: 0
        }));

        this.particles.clear();
        this.modal.hide();
    }

    // ==========================================================
    //  TRACÉ
    // ==========================================================

    /**
     * Génère un chemin sinueux normalisé (0..1).
     * Le tirage est déterministe : à deux, les adversaires ont exactement
     * le même parcours, sinon la course n'aurait aucun sens.
     */
    _buildPath(level) {
        const random = seededRandom(level * 7919);
        const turns = 4 + Math.min(5, level);
        const anchors = [];

        for (let i = 0; i <= turns; i++) {
            const t = i / turns;
            anchors.push({
                x: 0.09 + t * 0.82,
                // Départ et arrivée à mi-hauteur, virages francs entre les deux
                y: (i === 0 || i === turns) ? 0.5 : 0.16 + random() * 0.68
            });
        }

        return smoothPath(anchors, SAMPLES);
    }

    /** Projette le tracé normalisé dans la zone d'écran d'un joueur. */
    _layoutRacer(racer, w, h) {
        const area = this._areaFor(racer.id, w, h);
        const normalized = this._buildPath(racer.level);

        racer.path = normalized.map((point) => ({
            x: area.x + point.x * area.width,
            y: area.y + point.y * area.height
        }));

        // Le couloir se resserre à chaque niveau réussi
        const base = Math.min(area.width, area.height) * 0.075;
        racer.corridor = Math.max(16, base - (racer.level - 1) * 4);
    }

    _areaFor(id, w, h) {
        const top = h * 0.16;
        const height = h * 0.7;

        if (!this.duo) return { x: w * 0.05, y: top, width: w * 0.9, height };

        const half = w / 2;
        return { x: id * half + half * 0.08, y: top, width: half * 0.84, height };
    }

    _refreshLayout(w, h) {
        // On ne reconstruit les tracés que si quelque chose a bougé
        const key = `${w}x${h}:${this.duo}:${this.racers.map((r) => r.level).join('-')}`;
        if (key === this.layoutKey) return;

        this.layoutKey = key;
        for (const racer of this.racers) this._layoutRacer(racer, w, h);
    }

    // ==========================================================
    //  BOUCLE
    // ==========================================================

    update(dt) {
        if (this.modal.isVisible) return;

        const w = this.game.display.virtW;
        const h = this.game.display.virtH;
        const inputs = this.game.inputs.players;

        const duo = inputs[1]?.detected === true;
        if (duo !== this.duo && this.state !== 'PLAYING') this.duo = duo;
        this._refreshLayout(w, h);

        for (const racer of this.racers) {
            racer.finger = pointerOf(inputs[racer.id]);
        }

        if (this.state === 'WAITING') {
            if (this.racers.some((racer) => racer.finger)) this.state = 'PLAYING';
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._finish();
            return;
        }

        for (const racer of this.racers) this._updateRacer(racer, dt, w, h);
        this.particles.update(dt);
    }

    _updateRacer(racer, dt, w, h) {
        if (racer.buzzTimer > 0) {
            racer.buzzTimer -= dt;
            return;
        }
        if (!racer.finger) return;

        const { index, distance } = nearestOnPath(racer.path, racer.finger);
        const halfWidth = racer.corridor / 2;
        const inside = distance <= halfWidth;

        // Tant qu'on n'est pas entré dans le couloir, rien ne compte
        if (!racer.armed) {
            const startIndex = Math.round(racer.checkpoint * (racer.path.length - 1));
            const nearStart = Math.abs(index - startIndex) < racer.path.length * 0.06;
            if (inside && nearStart) racer.armed = true;
            return;
        }

        if (!inside) {
            this._buzz(racer);
            return;
        }

        // On n'avance que vers l'avant : impossible de couper par un virage
        const progress = index / (racer.path.length - 1);
        if (progress > racer.progress) racer.progress = progress;

        // Points de passage franchis : on ne les repasse plus
        for (const checkpoint of CHECKPOINTS) {
            if (racer.progress >= checkpoint && racer.checkpoint < checkpoint) {
                racer.checkpoint = checkpoint;
                this.game.playSound('hover');
            }
        }

        if (racer.progress >= 0.985) this._completeLevel(racer, w, h);
    }

    _buzz(racer) {
        racer.faults++;
        racer.armed = false;
        racer.buzzTimer = BUZZ_FREEZE;
        racer.progress = racer.checkpoint;

        if (racer.finger) {
            this.particles.spawn(racer.finger.x, racer.finger.y, THEME.danger,
                { count: 16, speed: 260, size: 3.5, life: 0.5 });
        }
        this.game.playSound('select');
    }

    _completeLevel(racer, w, h) {
        racer.level++;
        racer.progress = 0;
        racer.checkpoint = 0;
        racer.armed = false;

        const end = racer.path[racer.path.length - 1];
        this.particles.spawn(end.x, end.y, playerColor(racer.id),
            { count: 30, speed: 380, size: 4.5, life: 0.8 });
        this.game.playSound('select');

        this.layoutKey = '';          // force la régénération du tracé
        this._refreshLayout(w, h);
    }

    _finish() {
        this.state = 'GAMEOVER';
        const [a, b] = this.racers;

        this.after(700, () => {
            const score = (racer) => `${racer.level - 1} parcours`;
            const result = this.duo
                ? { p1: score(a), p2: score(b) }
                : `${a.level - 1} parcours · ${a.faults} touche(s)`;
            this.modal.show(result, this.gameConfig, () => this.reset());
        });
    }

    // ==========================================================
    //  RENDU
    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.fillStyle = 'rgba(16, 18, 20, 0.62)';
        ctx.fillRect(0, 0, w, h);

        const racers = this.duo ? this.racers : [this.racers[0]];
        for (const racer of racers) this._drawTrack(ctx, racer);

        this.particles.draw(ctx);
        for (const racer of racers) this._drawFinger(ctx, racer);

        this._drawHud(ctx, w, h);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'FIL ÉLECTRIQUE',
                'Entrez dans le couloir par le rond vert, et suivez-le sans toucher les bords');
        }
    }

    _drawTrack(ctx, racer) {
        if (!racer.path) return;

        const color = playerColor(racer.id);
        const buzzing = racer.buzzTimer > 0;

        const path = new Path2D();
        racer.path.forEach((point, i) => {
            if (i === 0) path.moveTo(point.x, point.y);
            else path.lineTo(point.x, point.y);
        });

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Les bords : c'est eux qu'il ne faut pas toucher
        ctx.strokeStyle = buzzing ? THEME.danger : alpha(color, 0.5);
        ctx.lineWidth = racer.corridor + 4;
        ctx.stroke(path);

        // L'intérieur du couloir
        ctx.strokeStyle = buzzing ? alpha(THEME.danger, 0.25) : 'rgba(16, 18, 20, 0.92)';
        ctx.lineWidth = racer.corridor;
        ctx.stroke(path);

        // Portion déjà parcourue
        if (racer.progress > 0) {
            const done = new Path2D();
            const last = Math.round(racer.progress * (racer.path.length - 1));
            racer.path.slice(0, last + 1).forEach((point, i) => {
                if (i === 0) done.moveTo(point.x, point.y);
                else done.lineTo(point.x, point.y);
            });
            ctx.strokeStyle = alpha(color, 0.22);
            ctx.lineWidth = racer.corridor - 4;
            ctx.stroke(done);
        }

        ctx.restore();

        this._drawPads(ctx, racer, color);
    }

    _drawPads(ctx, racer, color) {
        const start = racer.path[0];
        const end = racer.path[racer.path.length - 1];
        const resume = racer.path[Math.round(racer.checkpoint * (racer.path.length - 1))];

        ctx.save();

        // Point de reprise : vert tant qu'il faut y revenir
        ctx.fillStyle = racer.armed ? alpha(THEME.success, 0.25) : alpha(THEME.success, 0.7);
        ctx.beginPath();
        ctx.arc(resume.x, resume.y, racer.corridor * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Arrivée
        ctx.strokeStyle = alpha(color, 0.9);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(end.x, end.y, racer.corridor * 0.55, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = THEME.textMuted;
        ctx.font = `500 11px ${THEME.fontUi}`;
        ctx.textAlign = 'center';
        ctx.fillText('DÉPART', start.x, start.y - racer.corridor);
        ctx.fillText('ARRIVÉE', end.x, end.y - racer.corridor);
        ctx.restore();
    }

    _drawFinger(ctx, racer) {
        if (!racer.finger) return;
        const color = racer.buzzTimer > 0 ? THEME.danger : playerColor(racer.id);

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(racer.finger.x, racer.finger.y, 13, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(racer.finger.x, racer.finger.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawHud(ctx, w, h) {
        const entries = [{ label: 'Temps', value: Math.ceil(this.timeLeft), color: THEME.textStrong }];

        const label = (racer) => (this.duo ? `Joueur ${racer.id + 1}` : 'Parcours');
        entries.unshift({
            label: label(this.racers[0]),
            value: this.racers[0].level - 1,
            color: playerColor(0)
        });
        if (this.duo) {
            entries.push({
                label: label(this.racers[1]),
                value: this.racers[1].level - 1,
                color: playerColor(1)
            });
        }
        drawScoreBar(ctx, w, entries);

        drawGauge(ctx, w / 2 - 110, 132, 220, 3, this.timeLeft / ROUND_TIME,
            this.timeLeft < 10 ? THEME.danger : THEME.accent);

        if (this.state !== 'PLAYING') return;

        // Compteur de touches, discret mais lisible
        ctx.save();
        ctx.font = `500 12px ${THEME.fontUi}`;
        ctx.textAlign = 'center';
        for (const racer of this.duo ? this.racers : [this.racers[0]]) {
            const area = this._areaFor(racer.id, w, h);
            ctx.fillStyle = racer.faults > 0 ? THEME.danger : THEME.textMuted;
            ctx.fillText(`${racer.faults} touche${racer.faults > 1 ? 's' : ''}`,
                area.x + area.width / 2, area.y + area.height + 34);
        }
        ctx.restore();
    }
}

// ==========================================================
//  OUTILS GÉOMÉTRIQUES
// ==========================================================

/** Générateur pseudo-aléatoire déterministe (même niveau = même tracé). */
function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** Catmull-Rom : passe par tous les points d'ancrage, sans angles vifs. */
function smoothPath(anchors, samples) {
    const points = [];
    const count = anchors.length - 1;

    for (let i = 0; i < samples; i++) {
        const t = (i / (samples - 1)) * count;
        const index = Math.min(count - 1, Math.floor(t));
        const local = t - index;

        const p0 = anchors[Math.max(0, index - 1)];
        const p1 = anchors[index];
        const p2 = anchors[index + 1];
        const p3 = anchors[Math.min(anchors.length - 1, index + 2)];

        points.push({
            x: catmullRom(p0.x, p1.x, p2.x, p3.x, local),
            y: catmullRom(p0.y, p1.y, p2.y, p3.y, local)
        });
    }
    return points;
}

function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * ((2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Point du tracé le plus proche du doigt : distance et avancement. */
function nearestOnPath(path, point) {
    let bestIndex = 0;
    let bestDistance = Infinity;

    for (let i = 0; i < path.length; i++) {
        const dx = path[i].x - point.x;
        const dy = path[i].y - point.y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
        }
    }
    return { index: bestIndex, distance: Math.sqrt(bestDistance) };
}

registerGame({
    id: 'wire_maze',
    name: 'FIL ÉLECTRIQUE',
    icon: '⚡',
    color: '#8faa8b',
    players: 2,
    description: 'Suivez le couloir du doigt sans toucher les bords.',
    class: WireMaze
});
