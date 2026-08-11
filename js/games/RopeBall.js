import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { palmOf, drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';

const ROUND_TIME = 90;
const GRAVITY = 1800;      // px/s²
const DAMPING = 0.7;       // frottement de la bille sur la corde
const SLIP_OFF = 26;       // à cette distance d'une main, la bille sort du fil
const HAND_SPEED = 2600;   // px/s : une main ne se téléporte pas
const MAX_BALL_SPEED = 2400; // px/s : garde-fou contre l'emballement numérique
const BALL_RADIUS = 17;
const GATES_PER_LAP = 5;

/**
 * CORDE & BILLE
 *
 * Chacun tient un bout de la corde — à deux, une main chacun ; seul, les
 * deux mains, une de chaque côté de l'image. Une bille repose dessus et
 * roule vers le côté le plus bas : tout le jeu est de la garder en
 * équilibre en promenant la corde d'anneau en anneau.
 *
 * Quand un seul joueur est là, le bout resté libre est accroché à un
 * piton fixe : on joue alors en faisant pivoter la corde autour.
 */
export class RopeBall extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(280);
    }

    enter() {
        // La paume est plus stable que l'index pour tenir une corde
        this.gameConfig = { cameraMode: 'fullscreen', hands: true, pose: false, face: false, smoothing: 0.8 };
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
        this.timeLeft = ROUND_TIME;
        this.lap = 1;
        this.gatesPassed = 0;
        this.gateIndex = 0;
        this.drops = 0;
        this.dropFlash = 0;

        this.ends = [
            { x: w * 0.28, y: h * 0.55, held: false },
            { x: w * 0.72, y: h * 0.55, held: false }
        ];

        this.ropeLength = clamp(Math.min(w, h) * 0.46, 260, 520);
        this.ball = { x: w / 2, y: h * 0.55 + this.ropeLength * 0.25, vx: 0, vy: 0, falling: 0 };
        this.courseKey = '';
        this.gates = this._buildCourse(1, w, h);

        this.particles.clear();
        this.modal.hide();
    }

    /**
     * Un parcours d'anneaux, tiré au sort mais reproductible par tour.
     * Sa largeur dépend de ce que la ficelle peut réellement atteindre :
     * avec un bout accroché au piton, inutile de poser un anneau à l'autre
     * bout de l'écran, on ne pourrait jamais y amener la bille.
     */
    _buildCourse(lap, w, h) {
        const random = seededRandom(lap * 104729);
        const zone = this._reachableZone(w, h);
        const gates = [];

        for (let i = 0; i < GATES_PER_LAP; i++) {
            const t = (i + 0.5) / GATES_PER_LAP;
            gates.push({
                x: zone.x + t * zone.width,
                y: zone.y + random() * zone.height,
                radius: 44 - Math.min(14, lap * 2),
                passed: false
            });
        }
        return gates;
    }

    _reachableZone(w, h) {
        const anchor = this.ends?.find((end) => !end.held);

        // Les deux bouts tenus : le duo peut promener la bille partout
        if (!anchor) {
            return { x: w * 0.14, y: h * 0.26, width: w * 0.72, height: h * 0.46 };
        }

        const reach = this.ropeLength * 0.62;
        const x = clamp(anchor.x - reach, 60, w - 120);
        const right = clamp(anchor.x + reach, x + 200, w - 60);
        return {
            x,
            y: clamp(anchor.y + reach * 0.2, h * 0.24, h * 0.6),
            width: right - x,
            height: Math.min(h * 0.34, reach * 0.9)
        };
    }

    // ==========================================================
    //  BOUCLE
    // ==========================================================

    update(dt) {
        if (this.modal.isVisible) return;

        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        this._updateEnds(dt, w, h);

        if (this.state === 'WAITING') {
            if (this.ends.some((end) => end.held)) this.state = 'PLAYING';
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._finish();
            return;
        }

        this._refreshCourse(w, h);
        this.dropFlash = Math.max(0, this.dropFlash - dt * 3);
        this._updateBall(dt, w, h);
        this._checkGates(w, h);
        this.particles.update(dt, 900);
    }

    _updateEnds(dt, w, h) {
        const inputs = this.game.inputs.players;
        const maxStep = HAND_SPEED * dt;

        this.ends.forEach((end, i) => {
            const hand = palmOf(inputs[i]);
            end.held = hand !== null;

            if (hand) {
                // Le suivi perd parfois une main et la retrouve ailleurs :
                // sans plafond, ce saut catapulterait la bille.
                const dx = hand.x - end.x;
                const dy = hand.y - end.y;
                const distance = Math.hypot(dx, dy);

                if (distance > maxStep && distance > 0) {
                    end.x += (dx / distance) * maxStep;
                    end.y += (dy / distance) * maxStep;
                } else {
                    end.x = hand.x;
                    end.y = hand.y;
                }
            } else {
                // Bout libre : accroché à un piton au centre. Toute la
                // zone de jeu reste ainsi à portée d'une seule main.
                end.x = w * 0.5;
                end.y = h * 0.4;
            }
        });
    }

    /**
     * La bille est enfilée sur une ficelle de longueur fixe dont les mains
     * sont les deux extrémités. Sa contrainte est donc
     *     |bille−A| + |bille−B| ≤ longueur
     * c'est-à-dire une ellipse dont les mains sont les foyers.
     *
     * On laisse tomber la bille librement, puis on la ramène sur l'ellipse.
     * Tout le comportement en découle : le V de la ficelle, l'équilibre
     * stable au point bas, le roulement quand une main monte, l'élan quand
     * on tire d'un coup — et la ficelle qui devient molle si on rapproche
     * les mains.
     */
    _updateBall(dt, w, h) {
        const ball = this.ball;

        if (ball.falling > 0) {
            ball.falling -= dt;
            ball.y += 900 * dt;
            if (ball.falling <= 0) this._respawn(w, h);
            return;
        }

        const [a, b] = this.ends;
        this.ropeLength = clamp(Math.min(w, h) * 0.46, 260, 520);

        // 1. Chute libre
        ball.vy += GRAVITY * dt;
        const decay = Math.max(0, 1 - DAMPING * dt);
        ball.vx *= decay;
        ball.vy *= decay;

        const fromX = ball.x;
        const fromY = ball.y;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // 2. Retour sur l'ellipse (deux passes de Newton suffisent)
        let r1 = 0;
        let r2 = 0;
        for (let pass = 0; pass < 2; pass++) {
            const d1x = ball.x - a.x;
            const d1y = ball.y - a.y;
            const d2x = ball.x - b.x;
            const d2y = ball.y - b.y;
            r1 = Math.hypot(d1x, d1y) || 1e-6;
            r2 = Math.hypot(d2x, d2y) || 1e-6;

            const excess = r1 + r2 - this.ropeLength;
            if (excess <= 0) break; // ficelle molle : rien ne retient la bille

            const gx = d1x / r1 + d2x / r2;
            const gy = d1y / r1 + d2y / r2;
            const norm = gx * gx + gy * gy || 1e-6;
            ball.x -= (excess * gx) / norm;
            ball.y -= (excess * gy) / norm;
        }

        // 3. La vitesse se déduit du déplacement réellement effectué :
        //    la contrainte annule d'elle-même ce qui tirerait sur la ficelle,
        //    et une main qui bouge vite communique son élan à la bille.
        if (dt > 0) {
            ball.vx = (ball.x - fromX) / dt;
            ball.vy = (ball.y - fromY) / dt;

            // Une correction brutale (main perdue, ficelle qui se tend d'un
            // coup) produirait une vitesse absurde : on la borne.
            const speed = Math.hypot(ball.vx, ball.vy);
            if (speed > MAX_BALL_SPEED) {
                ball.vx = (ball.vx / speed) * MAX_BALL_SPEED;
                ball.vy = (ball.vy / speed) * MAX_BALL_SPEED;
            }
        }

        // 4. Arrivée au bout : la bille sort du fil
        const escaped = ball.y < -160 || ball.y > h + 240 || ball.x < -240 || ball.x > w + 240;
        if (r1 < SLIP_OFF || r2 < SLIP_OFF || escaped) this._drop(ball.x, ball.y);
    }

    /**
     * Un joueur qui arrive ou qui part change la zone atteignable :
     * on redessine alors le parcours plutôt que de laisser des anneaux
     * inaccessibles.
     */
    _refreshCourse(w, h) {
        const anchor = this.ends.findIndex((end) => !end.held);
        const key = `${this.lap}:${anchor}:${Math.round(w)}x${Math.round(h)}`;
        if (key === this.courseKey) return;

        this.courseKey = key;
        this.gates = this._buildCourse(this.lap, w, h);
        this.gateIndex = Math.min(this.gateIndex, this.gates.length - 1);
        for (let i = 0; i < this.gateIndex; i++) this.gates[i].passed = true;
    }

    /** Tension de la ficelle, de 0 (molle) à 1 (tendue à bloc). */
    get tension() {
        const [a, b] = this.ends;
        const chord = Math.hypot(b.x - a.x, b.y - a.y);
        return clamp(chord / (this.ropeLength || 1), 0, 1);
    }

    _drop(x, y) {
        this.ball.falling = 0.5;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.x = clamp(x, 0, this.game.display.virtW);
        this.ball.y = y;

        this.drops++;
        this.dropFlash = 1;
        this.timeLeft = Math.max(0, this.timeLeft - 3); // la chute coûte 3 secondes

        this.particles.spawn(this.ball.x, this.ball.y, THEME.danger,
            { count: 18, speed: 240, size: 4, life: 0.6 });
        this.game.playSound('hover');
    }

    /** La bille revient au creux de la ficelle. */
    _respawn(w, h) {
        const [a, b] = this.ends;
        this.ball.x = (a.x + b.x) / 2;
        this.ball.y = (a.y + b.y) / 2 + this.ropeLength * 0.25;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.falling = 0;
    }

    _checkGates(w, h) {
        const gate = this.gates[this.gateIndex];
        if (!gate || this.ball.falling > 0) return;

        const distance = Math.hypot(gate.x - this.ball.x, gate.y - this.ball.y);
        if (distance > gate.radius) return;

        gate.passed = true;
        this.gatesPassed++;
        this.gateIndex++;

        this.particles.spawn(gate.x, gate.y, THEME.accent,
            { count: 16, speed: 260, size: 3.5, life: 0.5 });
        this.game.playSound('select');

        // Tour bouclé : un nouveau parcours, un peu plus serré
        if (this.gateIndex >= this.gates.length) {
            this.lap++;
            this.gateIndex = 0;
            this.courseKey = '';
            this._refreshCourse(w, h);
            this.timeLeft = Math.min(ROUND_TIME, this.timeLeft + 10); // récompense
        }
    }

    _finish() {
        this.state = 'GAMEOVER';
        this.after(700, () => {
            this.modal.show(
                `${this.gatesPassed} anneaux · ${this.drops} chute(s)`,
                this.gameConfig,
                () => this.reset()
            );
        });
    }

    // ==========================================================
    //  RENDU
    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.fillStyle = `rgba(16, 18, 20, ${0.55 + this.dropFlash * 0.2})`;
        ctx.fillRect(0, 0, w, h);

        this._drawGates(ctx);
        this._drawRope(ctx);
        this.particles.draw(ctx);
        this._drawBall(ctx);

        this._drawHud(ctx, w, h);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'CORDE & BILLE',
                'Un bout dans chaque main · gardez du mou, sinon la bille file au bout');
        }
    }

    _drawRope(ctx) {
        const [a, b] = this.ends;
        const ball = this.ball;
        const taut = this.tension > 0.94;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // La ficelle passe par la bille : c'est ce V qui se lit d'un coup d'œil
        ctx.strokeStyle = taut ? alpha(THEME.danger, 0.85) : alpha(THEME.textStrong, 0.7);
        ctx.lineWidth = taut ? 2 : 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        if (ball.falling > 0) {
            ctx.lineTo(b.x, b.y);
        } else {
            ctx.lineTo(ball.x, ball.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();

        // Les deux prises, à la couleur de leur joueur
        this.ends.forEach((end, i) => {
            const color = playerColor(i);

            if (!end.held) {
                // Piton : le bout n'est tenu par personne
                ctx.strokeStyle = alpha(THEME.textMuted, 0.7);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(end.x, end.y, 11, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(end.x, end.y - 11);
                ctx.lineTo(end.x, end.y - 26);
                ctx.stroke();
                return;
            }

            ctx.fillStyle = alpha(color, 0.28);
            ctx.beginPath();
            ctx.arc(end.x, end.y, 20, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        });

        if (taut) {
            ctx.fillStyle = THEME.danger;
            ctx.font = `500 12px ${THEME.fontUi}`;
            ctx.textAlign = 'center';
            ctx.fillText('FICELLE TENDUE', (a.x + b.x) / 2, (a.y + b.y) / 2 - 18);
        }
        ctx.restore();
    }

    _drawBall(ctx) {
        const ball = this.ball;
        const falling = ball.falling > 0;

        ctx.save();
        ctx.globalAlpha = falling ? Math.max(0, ball.falling / 0.5) : 1;

        ctx.fillStyle = falling ? THEME.danger : THEME.textStrong;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Reflet : donne le volume sans le moindre halo
        ctx.fillStyle = alpha('#101214', 0.35);
        ctx.beginPath();
        ctx.arc(ball.x + BALL_RADIUS * 0.3, ball.y + BALL_RADIUS * 0.25, BALL_RADIUS * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawGates(ctx) {
        ctx.save();
        this.gates.forEach((gate, i) => {
            const isNext = i === this.gateIndex;
            const color = gate.passed ? THEME.textMuted : (isNext ? THEME.accent : THEME.text);

            ctx.strokeStyle = alpha(color, gate.passed ? 0.2 : (isNext ? 0.95 : 0.35));
            ctx.lineWidth = isNext ? 3 : 1.5;
            ctx.setLineDash(gate.passed ? [4, 6] : []);
            ctx.beginPath();
            ctx.arc(gate.x, gate.y, gate.radius, 0, Math.PI * 2);
            ctx.stroke();

            if (isNext) {
                ctx.setLineDash([]);
                ctx.fillStyle = alpha(THEME.accent, 0.1);
                ctx.fill();

                ctx.fillStyle = THEME.accent;
                ctx.font = `600 13px ${THEME.fontDisplay}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(i + 1), gate.x, gate.y);
            }
        });
        ctx.restore();
    }

    _drawHud(ctx, w, h) {
        drawScoreBar(ctx, w, [
            { label: 'Anneaux', value: this.gatesPassed, color: THEME.accent },
            { label: 'Temps', value: Math.ceil(this.timeLeft), color: this.timeLeft < 10 ? THEME.danger : THEME.textStrong },
            { label: 'Tour', value: this.lap, color: THEME.player2 }
        ]);

        drawGauge(ctx, w / 2 - 110, 132, 220, 3, this.timeLeft / ROUND_TIME,
            this.timeLeft < 10 ? THEME.danger : THEME.accent);

        if (this.state === 'PLAYING' && this.drops > 0) {
            ctx.save();
            ctx.font = `500 12px ${THEME.fontUi}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = THEME.textMuted;
            ctx.fillText(`${this.drops} chute(s) · −3 s chacune`, w / 2, h - 34);
            ctx.restore();
        }
    }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Générateur pseudo-aléatoire déterministe (même tour = même parcours). */
function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

registerGame({
    id: 'rope_ball',
    name: 'CORDE & BILLE',
    icon: '🪢',
    color: '#c2a882',
    players: 2,
    description: 'Une bille en équilibre sur une corde tendue entre vos mains.',
    class: RopeBall
});
