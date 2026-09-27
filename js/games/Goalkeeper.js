import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';

const LIVES = 5;
const CONTACT_FROM = 0.68;   // part du vol à partir de laquelle la balle peut être touchée
const STREAK_PHOTO = 5;      // arrêts d'affilée avant la photo souvenir

/** Segments du corps qui arrêtent une balle, en points de la pose. */
const BODY = [
    [11, 12], [11, 23], [12, 24], [23, 24],   // buste
    [11, 13], [13, 15], [12, 14], [14, 16],   // bras
    [23, 25], [25, 27], [24, 26], [26, 28]    // jambes
];

/**
 * GARDIEN
 *
 * Des balles arrivent droit sur vous : il faut les arrêter avec le corps,
 * n'importe où — main, bras, tête, genou. Tout le squelette compte, c'est
 * ce qui change des jeux au curseur : on joue avec sa silhouette entière.
 *
 * Les arrêts les plus spectaculaires (cinq d'affilée) sont photographiés.
 * À deux, chacun garde sa moitié d'écran et ses cages.
 */
export class Goalkeeper extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(360);
    }

    enter() {
        this.gameConfig = { cameraMode: 'fullscreen', hands: false, pose: true, face: false, smoothing: 0.4 };
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
        this.elapsed = 0;
        this.spawnTimer = 1.6;
        this.balls = [];
        this.shake = 0;

        this.keepers = [0, 1].map((id) => ({
            id, lives: LIVES, saves: 0, streak: 0, best: 0,
            present: false, flash: 0, segments: [], head: null, thickness: 18
        }));

        this.snapCooldown = 0;
        this.particles.clear();
        this.modal.hide();
    }

    // ==========================================================
    //  BOUCLE
    // ==========================================================

    update(dt) {
        if (this.modal.isVisible) return;

        const display = this.game.display;
        this._readBodies(display);

        if (this.state === 'WAITING') {
            if (this.keepers.some((keeper) => keeper.present)) this.state = 'PLAYING';
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.elapsed += dt;
        this.shake = Math.max(0, this.shake - dt * 40);
        this.snapCooldown = Math.max(0, this.snapCooldown - dt);
        for (const keeper of this.keepers) keeper.flash = Math.max(0, keeper.flash - dt * 3);

        this._spawn(dt, display);
        this._updateBalls(dt);
        this.particles.update(dt);

        const engaged = this.keepers.filter((keeper) => keeper.present || keeper.lives < LIVES);
        if (engaged.length > 0 && engaged.every((keeper) => keeper.lives <= 0)) this._finish();
    }

    /**
     * Squelette de chaque joueur, converti une fois par frame en segments
     * écran. Les jeux qui refont ce calcul dans la boucle de collision le
     * paient autant de fois qu'il y a de balles.
     */
    _readBodies(display) {
        const players = this.game.inputs.players;

        for (const keeper of this.keepers) {
            const landmarks = players[keeper.id]?.poseLandmarks;
            keeper.present = Boolean(landmarks);
            keeper.segments = [];
            keeper.head = null;
            if (!landmarks) continue;

            const point = (i) => {
                const lm = landmarks[i];
                if (!lm) return null;
                if (lm.visibility !== undefined && lm.visibility < 0.4) return null;
                return { x: lm.x * display.virtW, y: lm.y * display.virtH };
            };

            const left = point(11);
            const right = point(12);
            // La carrure sert d'échelle : un joueur loin de la caméra ne
            // doit pas avoir une silhouette plus fine à toucher.
            const span = left && right ? Math.hypot(left.x - right.x, left.y - right.y) : 0;
            keeper.thickness = Math.max(14, span * 0.16);

            for (const [a, b] of BODY) {
                const from = point(a);
                const to = point(b);
                if (from && to) keeper.segments.push({ from, to });
            }

            const nose = point(0);
            if (nose) keeper.head = { x: nose.x, y: nose.y, radius: Math.max(22, span * 0.34) };
        }
    }

    _spawn(dt, display) {
        this.spawnTimer -= dt;
        if (this.spawnTimer > 0) return;

        const difficulty = Math.min(1, this.elapsed / 80);
        this.spawnTimer = 1.5 - difficulty * 0.9;

        const shooters = this.keepers.filter((keeper) => keeper.present && keeper.lives > 0);
        if (shooters.length === 0) {
            this.spawnTimer = 0.4;
            return;
        }
        const target = shooters[Math.floor(Math.random() * shooters.length)];
        const zone = this._zoneOf(target.id, display);

        this.balls.push({
            keeper: target.id,
            t: 0,
            speed: 1 / (1.5 - difficulty * 0.75),   // vol de 1,5 s à 0,75 s
            // Point d'arrivée : quelque part dans les cages du joueur visé
            x: zone.x + zone.width * (0.12 + Math.random() * 0.76),
            y: display.virtH * (0.25 + Math.random() * 0.55),
            // Point de départ, au loin : donne la diagonale du tir
            fromX: zone.x + zone.width * (0.3 + Math.random() * 0.4),
            fromY: display.virtH * 0.34,
            resolved: false
        });
    }

    /** Cages d'un joueur : tout l'écran en solo, une moitié à deux. */
    _zoneOf(id, display) {
        const duo = this.keepers.every((keeper) => keeper.present || keeper.lives < LIVES);
        if (!duo) return { x: 0, width: display.virtW };
        return { x: id === 0 ? 0 : display.virtW / 2, width: display.virtW / 2 };
    }

    _updateBalls(dt) {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            ball.t += ball.speed * dt;

            if (ball.resolved) {
                // Balle repoussée : elle finit sa course en s'effaçant
                ball.x += ball.vx * dt;
                ball.y += ball.vy * dt;
                ball.fade -= dt * 2;
                if (ball.fade <= 0) this.balls.splice(i, 1);
                continue;
            }

            const keeper = this.keepers[ball.keeper];

            if (ball.t >= CONTACT_FROM && this._touches(keeper, ball)) {
                this._save(keeper, ball);
                continue;
            }
            if (ball.t >= 1) {
                this._concede(keeper, ball);
                this.balls.splice(i, 1);
            }
        }
    }

    _touches(keeper, ball) {
        if (!keeper.present) return false;

        const position = ballPosition(ball);
        const radius = ballRadius(ball) + keeper.thickness;

        if (keeper.head) {
            const reach = ballRadius(ball) + keeper.head.radius;
            if (Math.hypot(keeper.head.x - position.x, keeper.head.y - position.y) < reach) return true;
        }

        for (const segment of keeper.segments) {
            if (distanceToSegment(position, segment.from, segment.to) < radius) return true;
        }
        return false;
    }

    _save(keeper, ball) {
        keeper.saves++;
        keeper.streak++;
        keeper.best = Math.max(keeper.best, keeper.streak);
        keeper.flash = 1;
        this.shake = 6;

        // La balle repart d'où elle vient, un peu au hasard
        const position = ballPosition(ball);
        const angle = Math.atan2(position.y - ball.fromY, position.x - ball.fromX) + (Math.random() - 0.5);
        ball.resolved = true;
        ball.fade = 1;
        // Le rebond part du point de contact, pas du point visé
        ball.x = position.x;
        ball.y = position.y;
        ball.vx = Math.cos(angle) * 520;
        ball.vy = Math.sin(angle) * 520;

        this.particles.spawn(position.x, position.y, playerColor(keeper.id),
            { count: 14, speed: 300, size: 4, life: 0.5 });
        this.game.playSound('select');

        if (keeper.streak > 0 && keeper.streak % STREAK_PHOTO === 0 && this.snapCooldown <= 0) {
            this.snapCooldown = 2;
            this.game.capture.snap(`${keeper.streak} arrêts d'affilée — joueur ${keeper.id + 1}`);
        }
    }

    _concede(keeper, ball) {
        keeper.lives = Math.max(0, keeper.lives - 1);
        keeper.streak = 0;
        keeper.flash = 1;
        this.shake = 12;

        this.particles.spawn(ball.x, ball.y, THEME.danger,
            { count: 22, speed: 340, size: 5, life: 0.7 });
        this.game.playSound('hover');
    }

    _finish() {
        this.state = 'GAMEOVER';
        const [a, b] = this.keepers;
        const duo = b.present || b.lives < LIVES;

        this.after(700, () => {
            const result = duo
                ? { p1: a.saves, p2: b.saves }
                : `${a.saves} arrêts · série de ${a.best}`;
            this.modal.show(result, this.gameConfig, () => this.reset());
            if (a.best >= STREAK_PHOTO || b.best >= STREAK_PHOTO) {
                this.after(900, () => this.game.capture.openGallery());
            }
        });
    }

    // ==========================================================
    //  RENDU
    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.save();
        if (this.shake > 0) {
            ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
        }

        ctx.fillStyle = 'rgba(16, 18, 20, 0.44)';
        ctx.fillRect(-20, -20, w + 40, h + 40);

        for (const keeper of this.keepers) this._drawBody(ctx, keeper);
        for (const ball of this.balls) this._drawBall(ctx, ball);
        this.particles.draw(ctx);

        ctx.restore();

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'GARDIEN',
                'Reculez pour être vu en entier · arrêtez les balles avec tout le corps');
            return;
        }

        this._drawHud(ctx, w, h);
    }

    /** La silhouette active : le joueur voit exactement ce qui arrête. */
    _drawBody(ctx, keeper) {
        if (!keeper.present) return;
        const color = keeper.flash > 0.01
            ? THEME.textStrong
            : playerColor(keeper.id);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = alpha(color, 0.3 + keeper.flash * 0.5);
        ctx.lineWidth = keeper.thickness * 1.6;

        for (const segment of keeper.segments) {
            ctx.beginPath();
            ctx.moveTo(segment.from.x, segment.from.y);
            ctx.lineTo(segment.to.x, segment.to.y);
            ctx.stroke();
        }

        if (keeper.head) {
            ctx.beginPath();
            ctx.arc(keeper.head.x, keeper.head.y, keeper.head.radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawBall(ctx, ball) {
        const position = ballPosition(ball);
        const radius = ballRadius(ball);
        const color = ball.resolved ? THEME.success : THEME.accentWarm;

        ctx.save();
        ctx.globalAlpha = ball.resolved ? Math.max(0, ball.fade) : 1;

        // Cercle de visée : il dit où la balle va tomber, et quand
        if (!ball.resolved) {
            ctx.strokeStyle = alpha(THEME.danger, 0.25 + ball.t * 0.45);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, 26 + (1 - ball.t) * 90, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = alpha(color, 0.9);
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = alpha(THEME.textStrong, 0.7);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    _drawHud(ctx, w, h) {
        const duo = this.keepers[1].present || this.keepers[1].lives < LIVES;
        const entries = [
            { label: duo ? 'Joueur 1' : 'Arrêts', value: this.keepers[0].saves, color: playerColor(0) },
            { label: 'Vies', value: '♥'.repeat(this.keepers[0].lives) || '—', color: this.keepers[0].lives <= 1 ? THEME.danger : THEME.textStrong }
        ];
        if (duo) entries.push({ label: 'Joueur 2', value: this.keepers[1].saves, color: playerColor(1) });
        drawScoreBar(ctx, w, entries);

        if (duo) {
            // Séparation des cages : sans elle, on ne sait pas à qui est la balle
            ctx.save();
            ctx.strokeStyle = alpha(THEME.textMuted, 0.25);
            ctx.setLineDash([8, 10]);
            ctx.beginPath();
            ctx.moveTo(w / 2, 110);
            ctx.lineTo(w / 2, h - 60);
            ctx.stroke();
            ctx.restore();

            drawGauge(ctx, w * 0.94 - 120, h - 48, 120, 5, this.keepers[1].lives / LIVES,
                this.keepers[1].lives <= 1 ? THEME.danger : playerColor(1));
        }

        drawGauge(ctx, w * 0.06, h - 48, 120, 5, this.keepers[0].lives / LIVES,
            this.keepers[0].lives <= 1 ? THEME.danger : playerColor(0));

        for (const keeper of this.keepers) {
            if (keeper.streak < 2) continue;
            ctx.save();
            ctx.fillStyle = playerColor(keeper.id);
            ctx.font = `600 16px ${THEME.fontDisplay}`;
            ctx.textAlign = 'center';
            ctx.fillText(`série ${keeper.streak}`, keeper.id === 0 ? w * 0.06 + 60 : w * 0.94 - 60, h - 62);
            ctx.restore();
        }
    }
}

/* ------------------------------------------------------------------ */

/** Position courante d'une balle sur sa trajectoire. */
function ballPosition(ball) {
    if (ball.resolved) return { x: ball.x, y: ball.y };
    const t = Math.min(1, ball.t);
    return {
        x: ball.fromX + (ball.x - ball.fromX) * t,
        y: ball.fromY + (ball.y - ball.fromY) * t
    };
}

/** Rayon apparent : la balle grossit en se rapprochant. */
function ballRadius(ball) {
    if (ball.resolved) return 22;
    return 7 + Math.min(1, ball.t) * 19;
}

/** Distance d'un point à un segment. */
function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);

    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

registerGame({
    id: 'goalkeeper',
    name: 'GARDIEN',
    icon: '🧤',
    color: '#c2a882',
    players: 2,
    description: 'Arrêtez les balles avec tout le corps : bras, tête, genoux.',
    class: Goalkeeper
});
