import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';

const ROUND_TIME = 60;
const HIT_SPEED = 900;       // px/s : en dessous, on effleure, on ne frappe pas
const TARGET_LIFE = 2.4;
const COMBO_WINDOW = 2.0;

/**
 * FRAPPE
 *
 * Des cibles apparaissent, il faut les toucher d'un geste SEC. Effleurer
 * ne compte pas : c'est la vitesse du poing qui valide, et la puissance
 * du coup rapporte des points.
 *
 * Le jeu repose entièrement sur la vitesse filtrée fournie par les
 * entrées — une dérivée brute, prise entre deux analyses de l'IA, serait
 * bien trop bruitée pour distinguer une frappe d'un tremblement.
 */
export class PunchRush extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(320);
    }

    enter() {
        // Les poings, ce sont les mains : peu de lissage pour garder le geste
        this.gameConfig = { cameraMode: 'fullscreen', hands: true, pose: false, face: false, smoothing: 0.9 };
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
        this.spawnTimer = 0.8;
        this.targets = [];
        this.nextId = 1;
        this.shake = 0;

        this.fighters = [0, 1].map((id) => ({
            id, score: 0, best: 0, combo: 0, comboTimer: 0, active: false, trail: []
        }));

        this.particles.clear();
        this.modal.hide();
    }

    update(dt) {
        if (this.modal.isVisible) return;

        const w = this.game.display.virtW;
        const h = this.game.display.virtH;
        const inputs = this.game.inputs.players;

        this.fighters.forEach((f, i) => { f.active = inputs[i]?.detected === true; });

        if (this.state === 'WAITING') {
            if (this.fighters.some((f) => f.active)) this.state = 'PLAYING';
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.timeLeft -= dt;
        this.shake = Math.max(0, this.shake - dt * 40);
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._finish();
            return;
        }

        this._spawn(dt, w, h);
        this._ageTargets(dt);
        this._punch(dt, inputs);
        this.particles.update(dt, 700);
    }

    _spawn(dt, w, h) {
        this.spawnTimer -= dt;
        if (this.spawnTimer > 0) return;

        const progress = 1 - this.timeLeft / ROUND_TIME;
        this.spawnTimer = 1.15 - progress * 0.7;

        // Les cibles fuient les bords et la zone du HUD
        this.targets.push({
            id: this.nextId++,
            x: w * (0.14 + Math.random() * 0.72),
            y: h * (0.28 + Math.random() * 0.5),
            radius: 52 - Math.min(16, progress * 22),
            life: TARGET_LIFE,
            born: 0,
            hit: 0
        });
    }

    _ageTargets(dt) {
        for (let i = this.targets.length - 1; i >= 0; i--) {
            const target = this.targets[i];
            target.born += dt;

            if (target.hit > 0) {
                target.hit -= dt;
                if (target.hit <= 0) this.targets.splice(i, 1);
                continue;
            }

            target.life -= dt;
            if (target.life <= 0) this.targets.splice(i, 1);
        }
    }

    _punch(dt, inputs) {
        this.fighters.forEach((fighter, i) => {
            if (fighter.comboTimer > 0) {
                fighter.comboTimer -= dt;
                if (fighter.comboTimer <= 0) fighter.combo = 0;
            }

            const input = inputs[i];
            if (!input?.detected) {
                fighter.trail.length = 0;
                return;
            }

            const fist = input.handCenter || { x: input.x, y: input.y };
            const speed = input.velocity?.speed || 0;

            // Traînée : c'est elle qui donne la lecture du geste
            fighter.trail.unshift({ x: fist.x, y: fist.y, speed });
            if (fighter.trail.length > 10) fighter.trail.pop();

            if (speed < HIT_SPEED) return;

            for (const target of this.targets) {
                if (target.hit > 0) continue;
                if (Math.hypot(target.x - fist.x, target.y - fist.y) > target.radius) continue;
                this._land(fighter, target, speed);
                break; // un poing ne touche qu'une cible à la fois
            }
        });
    }

    _land(fighter, target, speed) {
        target.hit = 0.25;

        // La puissance compte : un coup sec vaut plus qu'un coup mou
        const power = Math.min(3, speed / HIT_SPEED);
        fighter.combo++;
        fighter.comboTimer = COMBO_WINDOW;

        const multiplier = 1 + Math.floor(fighter.combo / 3);
        const points = Math.round(10 * power * multiplier);
        fighter.score += points;
        fighter.best = Math.max(fighter.best, Math.round(speed));

        this.shake = 8 + power * 4;
        this.particles.spawn(target.x, target.y, playerColor(fighter.id), {
            count: 14 + Math.round(power * 6),
            speed: 260 + power * 120,
            size: 4,
            life: 0.5
        });
        this.game.playSound('select');
    }

    _finish() {
        this.state = 'GAMEOVER';
        const [a, b] = this.fighters;
        const duo = b.active || b.score > 0;

        this.after(600, () => {
            const result = duo ? { p1: a.score, p2: b.score } : `${a.score} points · ${a.best} px/s`;
            this.modal.show(result, this.gameConfig, () => this.reset());
        });
    }

    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.save();
        if (this.shake > 0) {
            ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
        }

        ctx.fillStyle = 'rgba(16, 18, 20, 0.45)';
        ctx.fillRect(-20, -20, w + 40, h + 40);

        for (const target of this.targets) this._drawTarget(ctx, target);
        this.particles.draw(ctx);
        for (const fighter of this.fighters) this._drawFist(ctx, fighter);

        ctx.restore();
        this._drawHud(ctx, w, h);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'FRAPPE',
                'Touchez les cibles d\'un geste sec · effleurer ne compte pas');
        }
    }

    _drawTarget(ctx, target) {
        const hit = target.hit > 0;
        const fading = target.life < 0.7;
        const scale = hit ? 1 + (0.25 - target.hit) * 3 : Math.min(1, target.born * 6);
        const radius = target.radius * scale;

        ctx.save();
        ctx.globalAlpha = hit ? target.hit / 0.25 : (fading ? target.life / 0.7 : 1);

        const color = hit ? THEME.textStrong : (fading ? THEME.danger : THEME.accent);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = alpha(color, 0.12);
        ctx.fill();

        // Anneau intérieur : le temps qui reste avant disparition
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius * 0.6, -Math.PI / 2,
            -Math.PI / 2 + (target.life / TARGET_LIFE) * Math.PI * 2);
        ctx.strokeStyle = alpha(color, 0.5);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    _drawFist(ctx, fighter) {
        if (fighter.trail.length === 0) return;
        const color = playerColor(fighter.id);

        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < fighter.trail.length - 1; i++) {
            const a = fighter.trail[i];
            const b = fighter.trail[i + 1];
            const ratio = 1 - i / fighter.trail.length;

            ctx.globalAlpha = ratio * 0.5;
            ctx.strokeStyle = a.speed > HIT_SPEED ? THEME.textStrong : color;
            ctx.lineWidth = 10 * ratio;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }

        const head = fighter.trail[0];
        ctx.globalAlpha = 1;
        ctx.strokeStyle = head.speed > HIT_SPEED ? THEME.textStrong : color;
        ctx.lineWidth = head.speed > HIT_SPEED ? 3 : 2;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    _drawHud(ctx, w, h) {
        const duo = this.fighters[1].active || this.fighters[1].score > 0;
        const entries = [
            { label: duo ? 'Joueur 1' : 'Points', value: this.fighters[0].score, color: playerColor(0) },
            { label: 'Temps', value: Math.ceil(this.timeLeft), color: this.timeLeft < 10 ? THEME.danger : THEME.textStrong }
        ];
        if (duo) entries.push({ label: 'Joueur 2', value: this.fighters[1].score, color: playerColor(1) });
        drawScoreBar(ctx, w, entries);

        drawGauge(ctx, w / 2 - 110, 132, 220, 3, this.timeLeft / ROUND_TIME,
            this.timeLeft < 10 ? THEME.danger : THEME.accent);

        if (this.state !== 'PLAYING') return;

        // Jauge de puissance : rend visible le seuil de validation
        this.fighters.forEach((fighter) => {
            if (!fighter.active) return;
            const speed = this.game.inputs.players[fighter.id]?.velocity?.speed || 0;
            const x = fighter.id === 0 ? w * 0.08 : w * 0.92 - 120;

            drawGauge(ctx, x, h - 48, 120, 5, Math.min(1, speed / (HIT_SPEED * 1.6)),
                speed > HIT_SPEED ? THEME.textStrong : playerColor(fighter.id));

            if (fighter.combo >= 3) {
                ctx.save();
                ctx.fillStyle = playerColor(fighter.id);
                ctx.font = `600 18px ${THEME.fontDisplay}`;
                ctx.textAlign = 'left';
                ctx.fillText(`× ${1 + Math.floor(fighter.combo / 3)}`, x, h - 60);
                ctx.restore();
            }
        });
    }
}

registerGame({
    id: 'punch_rush',
    name: 'FRAPPE',
    icon: '🥊',
    color: '#c08a86',
    players: 2,
    description: 'Touchez les cibles d\'un geste sec : la vitesse fait le score.',
    class: PunchRush
});
