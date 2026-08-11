import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha } from '../core/Theme.js';
import { palmOf, drawMessage, drawScoreBar, Particles, damp } from './shared.js';

const WIN_SCORE = 7;
const MALLET_RADIUS = 46;
const PUCK_RADIUS = 20;
const PUCK_SPEED_MIN = 420;
const PUCK_SPEED_MAX = 1150;
const GOAL_RATIO = 0.34;   // hauteur du but, en fraction de l'écran

/**
 * AIR HOCKEY
 *
 * Chaque main est un maillet, cantonné à sa moitié de table. Premier à
 * sept buts. Sans deuxième joueur détecté, l'ordinateur prend la raquette
 * de droite : le jeu se joue donc aussi bien seul qu'à deux.
 */
export class AirHockey extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(300);
    }

    enter() {
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
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        this.state = 'WAITING';
        this.scores = [0, 0];
        this.aiActive = false;
        this.lastTouch = null;

        this.mallets = [
            { x: w * 0.15, y: h / 2, prevX: w * 0.15, prevY: h / 2, vx: 0, vy: 0 },
            { x: w * 0.85, y: h / 2, prevX: w * 0.85, prevY: h / 2, vx: 0, vy: 0 }
        ];

        this.particles.clear();
        this.modal.hide();
        this.serve(Math.random() < 0.5 ? -1 : 1);
    }

    /** Remet le palet au centre et le lance vers `direction` après un temps mort. */
    serve(direction) {
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        this.puck = { x: w / 2, y: h / 2, vx: 0, vy: 0, trail: [] };
        this.serveDelay = 1.1;
        this.serveDirection = direction;
    }

    update(dt) {
        if (this.modal.isVisible) return;

        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        this._updateMallets(dt, w, h);

        if (this.state === 'WAITING') {
            if (this.game.inputs.players[0]?.detected) this.state = 'PLAYING';
            return;
        }

        if (this.serveDelay > 0) {
            this.serveDelay -= dt;
            if (this.serveDelay <= 0) {
                const angle = (Math.random() - 0.5) * 0.8;
                this.puck.vx = Math.cos(angle) * PUCK_SPEED_MIN * this.serveDirection;
                this.puck.vy = Math.sin(angle) * PUCK_SPEED_MIN;
            }
        } else {
            this._updatePuck(dt, w, h);
        }

        this.particles.update(dt);
    }

    _updateMallets(dt, w, h) {
        const players = this.game.inputs.players;

        // Le joueur 2 absent ? L'ordinateur prend la relève.
        this.aiActive = !players[1]?.detected;

        this.mallets.forEach((mallet, i) => {
            mallet.prevX = mallet.x;
            mallet.prevY = mallet.y;

            const target = (i === 1 && this.aiActive)
                ? this._aiTarget(w, h)
                : palmOf(players[i]);

            if (target) {
                // Chaque maillet reste dans sa moitié, avec un chevauchement nul
                const minX = i === 0 ? MALLET_RADIUS : w / 2 + MALLET_RADIUS;
                const maxX = i === 0 ? w / 2 - MALLET_RADIUS : w - MALLET_RADIUS;

                mallet.x = damp(mallet.x, clamp(target.x, minX, maxX), 0.55, dt);
                mallet.y = damp(mallet.y, clamp(target.y, MALLET_RADIUS, h - MALLET_RADIUS), 0.55, dt);
            }

            // Vitesse réelle du maillet : c'est elle qui donne de la frappe
            mallet.vx = (mallet.x - mallet.prevX) / Math.max(dt, 0.0001);
            mallet.vy = (mallet.y - mallet.prevY) / Math.max(dt, 0.0001);
        });
    }

    /** IA volontairement imparfaite : elle défend bien, attaque mollement. */
    _aiTarget(w, h) {
        const puck = this.puck;
        const comingAtMe = puck.vx > 0;

        if (comingAtMe && puck.x > w * 0.45) {
            return { x: Math.max(puck.x + 60, w * 0.6), y: puck.y };
        }
        // Sinon on revient couvrir le but, en suivant mollement le palet
        return { x: w * 0.86, y: h / 2 + (puck.y - h / 2) * 0.45 };
    }

    _updatePuck(dt, w, h) {
        const puck = this.puck;

        puck.trail.unshift({ x: puck.x, y: puck.y });
        if (puck.trail.length > 12) puck.trail.pop();

        puck.x += puck.vx * dt;
        puck.y += puck.vy * dt;

        // Rebonds haut/bas
        if (puck.y < PUCK_RADIUS) {
            puck.y = PUCK_RADIUS;
            puck.vy = Math.abs(puck.vy);
            this._impact(puck.x, puck.y, THEME.textMuted, 6);
        } else if (puck.y > h - PUCK_RADIUS) {
            puck.y = h - PUCK_RADIUS;
            puck.vy = -Math.abs(puck.vy);
            this._impact(puck.x, puck.y, THEME.textMuted, 6);
        }

        // Buts et murs latéraux
        const goalTop = h / 2 - (h * GOAL_RATIO) / 2;
        const goalBottom = h / 2 + (h * GOAL_RATIO) / 2;
        const inGoalMouth = puck.y > goalTop && puck.y < goalBottom;

        if (puck.x < PUCK_RADIUS) {
            if (inGoalMouth) return this._score(1);
            puck.x = PUCK_RADIUS;
            puck.vx = Math.abs(puck.vx);
        } else if (puck.x > w - PUCK_RADIUS) {
            if (inGoalMouth) return this._score(0);
            puck.x = w - PUCK_RADIUS;
            puck.vx = -Math.abs(puck.vx);
        }

        this.mallets.forEach((mallet, i) => this._collide(mallet, i));

        // Frottement léger, puis bornes de vitesse
        const speed = Math.hypot(puck.vx, puck.vy);
        if (speed > 0) {
            const damped = Math.max(PUCK_SPEED_MIN * 0.7, speed - 40 * dt);
            const capped = Math.min(damped, PUCK_SPEED_MAX);
            puck.vx = (puck.vx / speed) * capped;
            puck.vy = (puck.vy / speed) * capped;
        }
    }

    _collide(mallet, index) {
        const puck = this.puck;
        const dx = puck.x - mallet.x;
        const dy = puck.y - mallet.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = MALLET_RADIUS + PUCK_RADIUS;

        if (distance > minDistance || distance === 0) return;

        // On repousse le palet hors du maillet...
        const nx = dx / distance;
        const ny = dy / distance;
        puck.x = mallet.x + nx * minDistance;
        puck.y = mallet.y + ny * minDistance;

        // ...puis on le renvoie, avec l'élan du maillet en prime
        const incoming = puck.vx * nx + puck.vy * ny;
        const malletPush = (mallet.vx * nx + mallet.vy * ny) * 0.55;
        const impulse = Math.max(PUCK_SPEED_MIN, Math.abs(incoming) + Math.abs(malletPush) + 120);

        puck.vx = nx * impulse;
        puck.vy = ny * impulse;

        this.lastTouch = index;
        this._impact(puck.x, puck.y, index === 0 ? THEME.player1 : THEME.player2, 10);
        this.game.playSound('hover');
    }

    _impact(x, y, color, count) {
        this.particles.spawn(x, y, color, { count, speed: 220, size: 3.5, life: 0.45 });
    }

    _score(playerIndex) {
        this.scores[playerIndex]++;
        this.game.playSound('select');

        const w = this.game.display.virtW;
        this.particles.spawn(playerIndex === 0 ? w : 0, this.puck.y,
            playerIndex === 0 ? THEME.player1 : THEME.player2,
            { count: 26, speed: 420, size: 5, life: 0.9 });

        if (this.scores[playerIndex] >= WIN_SCORE) {
            this.state = 'GAMEOVER';
            const winner = playerIndex === 0 ? 'JOUEUR 1' : (this.aiActive ? "L'ORDINATEUR" : 'JOUEUR 2');
            this.after(700, () => {
                this.modal.show(`${winner} GAGNE`, this.gameConfig, () => this.reset());
            });
            return;
        }

        this.serve(playerIndex === 0 ? -1 : 1);
    }

    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        this._drawTable(ctx, w, h);
        this.particles.draw(ctx);

        if (this.state !== 'WAITING') this._drawPuck(ctx);
        this.mallets.forEach((mallet, i) => this._drawMallet(ctx, mallet, i));

        drawScoreBar(ctx, w, [
            { label: 'Joueur 1', value: this.scores[0], color: THEME.player1 },
            { label: this.aiActive ? 'Ordinateur' : 'Joueur 2', value: this.scores[1], color: THEME.player2 }
        ]);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'AIR HOCKEY',
                `Votre main est le maillet · premier à ${WIN_SCORE} buts`);
        }
    }

    _drawTable(ctx, w, h) {
        const goalHeight = h * GOAL_RATIO;
        const goalTop = h / 2 - goalHeight / 2;

        ctx.save();
        ctx.fillStyle = 'rgba(16, 18, 20, 0.55)';
        ctx.fillRect(0, 0, w, h);

        // Ligne médiane et cercle central
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 14]);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.12, 0, Math.PI * 2);
        ctx.stroke();

        // Buts
        [[0, THEME.player2], [w - 10, THEME.player1]].forEach(([x, color]) => {
            ctx.fillStyle = alpha(color, 0.22);
            ctx.fillRect(x, goalTop, 10, goalHeight);
            ctx.fillStyle = color;
            ctx.fillRect(x, goalTop, 3, goalHeight);
        });
        ctx.restore();
    }

    _drawMallet(ctx, mallet, index) {
        const color = index === 0 ? THEME.player1 : THEME.player2;
        const isRobot = index === 1 && this.aiActive;

        ctx.save();
        ctx.beginPath();
        ctx.arc(mallet.x, mallet.y, MALLET_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = alpha(color, isRobot ? 0.14 : 0.24);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(mallet.x, mallet.y, MALLET_RADIUS * 0.42, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(color, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    _drawPuck(ctx) {
        const puck = this.puck;

        ctx.save();
        // Traînée : donne la vitesse d'un coup d'œil
        puck.trail.forEach((point, i) => {
            const ratio = 1 - i / puck.trail.length;
            ctx.globalAlpha = ratio * 0.22;
            ctx.fillStyle = THEME.textStrong;
            ctx.beginPath();
            ctx.arc(point.x, point.y, PUCK_RADIUS * ratio, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalAlpha = this.serveDelay > 0 ? 0.45 : 1;
        ctx.fillStyle = THEME.textStrong;
        ctx.beginPath();
        ctx.arc(puck.x, puck.y, PUCK_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

registerGame({
    id: 'air_hockey',
    name: 'AIR HOCKEY',
    icon: '🏒',
    color: '#8fa6b8',
    players: 2,
    description: 'Votre main est le maillet. Seul contre la machine ou en duel.',
    class: AirHockey
});
