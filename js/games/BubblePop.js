import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { pointerOf, drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';

const ROUND_TIME = 45;
const COMBO_WINDOW = 1.6;   // secondes pour enchaîner sans perdre le combo

const KINDS = [
    { id: 'normal', weight: 68, points: 10, radius: 44, speed: 70, color: '#8fa6b8' },
    { id: 'petite', weight: 18, points: 25, radius: 26, speed: 110, color: '#a8bcc9' },
    { id: 'or', weight: 8, points: 50, radius: 38, speed: 90, color: '#c2a882' },
    { id: 'piege', weight: 6, points: -30, radius: 50, speed: 55, color: '#c08a86' }
];

/**
 * BULLES
 *
 * Des bulles montent, on les crève en pinçant (pouce + index) — ou au clic
 * en mode souris. Les petites rapportent plus, les rouges font perdre des
 * points. Enchaîner sans rater fait grimper un multiplicateur.
 */
export class BubblePop extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(360);
    }

    enter() {
        this.gameConfig = { cameraMode: 'fullscreen', hands: true, pose: false, face: false, smoothing: 0.85 };
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
        this.spawnTimer = 0;
        this.bubbles = [];
        this.nextId = 1;

        this.players = [0, 1].map((id) => ({
            id,
            score: 0,
            combo: 0,
            comboTimer: 0,
            wasPinching: false,
            active: false
        }));

        this.particles.clear();
        this.modal.hide();
    }

    update(dt) {
        if (this.modal.isVisible) return;

        const w = this.game.display.virtW;
        const h = this.game.display.virtH;
        const inputs = this.game.inputs.players;

        this.players.forEach((p, i) => { p.active = inputs[i]?.detected === true; });

        if (this.state === 'WAITING') {
            if (this.players.some((p) => p.active)) this.state = 'PLAYING';
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._finish();
            return;
        }

        this._spawn(dt, w, h);
        this._moveBubbles(dt);
        this._handlePinches(inputs, dt);
        this.particles.update(dt);
    }

    _spawn(dt, w, h) {
        this.spawnTimer -= dt;
        if (this.spawnTimer > 0) return;

        // La cadence s'accélère au fil de la manche
        const progress = 1 - this.timeLeft / ROUND_TIME;
        this.spawnTimer = 0.75 - progress * 0.45;

        const kind = pickKind();
        const radius = kind.radius;

        this.bubbles.push({
            id: this.nextId++,
            kind,
            x: radius + Math.random() * (w - radius * 2),
            y: h + radius,
            radius,
            speed: kind.speed * (0.85 + Math.random() * 0.5),
            drift: (Math.random() - 0.5) * 40,
            phase: Math.random() * Math.PI * 2,
            popped: 0
        });
    }

    _moveBubbles(dt) {
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const bubble = this.bubbles[i];

            if (bubble.popped > 0) {
                bubble.popped -= dt;
                if (bubble.popped <= 0) this.bubbles.splice(i, 1);
                continue;
            }

            bubble.y -= bubble.speed * dt;
            bubble.phase += dt * 2;
            bubble.x += Math.sin(bubble.phase) * bubble.drift * dt;

            if (bubble.y < -bubble.radius) this.bubbles.splice(i, 1);
        }
    }

    _handlePinches(inputs, dt) {
        this.players.forEach((player, i) => {
            if (player.comboTimer > 0) {
                player.comboTimer -= dt;
                if (player.comboTimer <= 0) player.combo = 0;
            }

            const input = inputs[i];
            if (!input?.detected) {
                player.wasPinching = false;
                return;
            }

            const pinching = input.isClicking === true;
            const justPinched = pinching && !player.wasPinching;
            player.wasPinching = pinching;
            if (!justPinched) return;

            const pointer = pointerOf(input);
            if (pointer) this._popAt(player, pointer);
        });
    }

    _popAt(player, pointer) {
        // La bulle la plus proche du doigt, si le pincement tombe dessus
        let target = null;
        let bestDistance = Infinity;

        for (const bubble of this.bubbles) {
            if (bubble.popped > 0) continue;
            const distance = Math.hypot(bubble.x - pointer.x, bubble.y - pointer.y);
            if (distance <= bubble.radius && distance < bestDistance) {
                bestDistance = distance;
                target = bubble;
            }
        }

        if (!target) {
            player.combo = 0;
            player.comboTimer = 0;
            return;
        }

        target.popped = 0.18;

        if (target.kind.id === 'piege') {
            player.score = Math.max(0, player.score + target.kind.points);
            player.combo = 0;
            player.comboTimer = 0;
            this.game.playSound('hover');
        } else {
            player.combo++;
            player.comboTimer = COMBO_WINDOW;
            const multiplier = 1 + Math.floor(player.combo / 4);
            player.score += target.kind.points * multiplier;
            this.game.playSound('select');
        }

        this.particles.spawn(target.x, target.y, target.kind.color,
            { count: 14, speed: 260, size: 4, life: 0.55 });
    }

    _finish() {
        this.state = 'GAMEOVER';
        const [p1, p2] = this.players;

        // Deux scores à afficher seulement si le joueur 2 a réellement joué
        const duo = p2.active || p2.score !== 0;

        this.after(600, () => {
            const result = duo ? { p1: p1.score, p2: p2.score } : p1.score;
            this.modal.show(result, this.gameConfig, () => this.reset());
        });
    }

    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.fillStyle = 'rgba(16, 18, 20, 0.5)';
        ctx.fillRect(0, 0, w, h);

        for (const bubble of this.bubbles) this._drawBubble(ctx, bubble);
        this.particles.draw(ctx);
        this._drawPointers(ctx);

        const entries = [{ label: 'Temps', value: Math.ceil(this.timeLeft), color: THEME.textStrong }];
        this.players.forEach((player) => {
            if (!player.active && player.score === 0 && player.id === 1) return;
            const slot = { label: `Joueur ${player.id + 1}`, value: player.score, color: playerColor(player.id) };
            if (player.id === 0) entries.unshift(slot);
            else entries.push(slot);
        });
        drawScoreBar(ctx, w, entries);

        drawGauge(ctx, w / 2 - 110, 132, 220, 3, this.timeLeft / ROUND_TIME,
            this.timeLeft < 10 ? THEME.danger : THEME.accent);

        this._drawCombos(ctx, w, h);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'BULLES',
                'Pincez le pouce et l\'index sur une bulle · les rouges font perdre des points');
        }
    }

    _drawBubble(ctx, bubble) {
        const popping = bubble.popped > 0;
        const scale = popping ? 1 + (0.18 - bubble.popped) * 4 : 1;
        const fade = popping ? bubble.popped / 0.18 : 1;
        const radius = bubble.radius * scale;

        ctx.save();
        ctx.globalAlpha = fade;

        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = alpha(bubble.kind.color, 0.22);
        ctx.fill();
        ctx.strokeStyle = alpha(bubble.kind.color, 0.85);
        ctx.lineWidth = 2;
        ctx.stroke();

        // Reflet : suffit à donner le volume, sans halo
        ctx.beginPath();
        ctx.arc(bubble.x - radius * 0.3, bubble.y - radius * 0.32, radius * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = alpha('#ffffff', 0.28);
        ctx.fill();

        if (bubble.kind.id === 'piege') {
            ctx.strokeStyle = alpha(bubble.kind.color, 0.9);
            ctx.lineWidth = 2.5;
            const arm = radius * 0.32;
            ctx.beginPath();
            ctx.moveTo(bubble.x - arm, bubble.y - arm);
            ctx.lineTo(bubble.x + arm, bubble.y + arm);
            ctx.moveTo(bubble.x + arm, bubble.y - arm);
            ctx.lineTo(bubble.x - arm, bubble.y + arm);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** Petit repère sous le doigt : sans lui, on pince à l'aveugle. */
    _drawPointers(ctx) {
        const inputs = this.game.inputs.players;

        this.players.forEach((player, i) => {
            const pointer = pointerOf(inputs[i]);
            if (!pointer) return;

            const color = playerColor(player.id);
            const pinching = inputs[i].isClicking;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = pinching ? 3 : 1.5;
            ctx.beginPath();
            ctx.arc(pointer.x, pointer.y, pinching ? 10 : 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        });
    }

    _drawCombos(ctx, w, h) {
        this.players.forEach((player) => {
            if (player.combo < 4) return;

            const multiplier = 1 + Math.floor(player.combo / 4);
            const x = player.id === 0 ? w * 0.16 : w * 0.84;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = playerColor(player.id);
            ctx.font = `600 22px ${THEME.fontDisplay}`;
            ctx.globalAlpha = Math.min(1, player.comboTimer / COMBO_WINDOW + 0.35);
            ctx.fillText(`× ${multiplier}`, x, h * 0.2);
            ctx.restore();
        });
    }
}

/** Tirage pondéré d'un type de bulle. */
function pickKind() {
    const total = KINDS.reduce((sum, kind) => sum + kind.weight, 0);
    let roll = Math.random() * total;
    for (const kind of KINDS) {
        roll -= kind.weight;
        if (roll <= 0) return kind;
    }
    return KINDS[0];
}

registerGame({
    id: 'bubble_pop',
    name: 'BULLES',
    icon: '🫧',
    color: '#a8bcc9',
    players: 2,
    description: 'Pincez pour crever les bulles. Enchaînez pour multiplier.',
    class: BubblePop
});
