import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';
import { drawMask, faceFrame } from './faceMask.js';

const ROUND_TIME = 60;
const GRAVITY = 260;
const GOLD_CHANCE = 0.16;
const MOUTH_OPEN = 0.045;   // écartement des lèvres (normalisé) = bouche ouverte
const PHOTO_COOLDOWN = 6;

/**
 * NOISETTES
 *
 * Un masque d'écureuil suit votre visage, des noisettes tombent : il faut
 * ouvrir la bouche au bon moment pour les gober. Les dorées valent cinq
 * fois plus et déclenchent la photo souvenir.
 *
 * Tout est dessiné sur le canvas, dans le repère local du visage (centre =
 * nez, axe = menton→front). C'est ce qui fait que le masque suit la tête
 * quand elle tourne ou s'éloigne — une version DOM positionnée en pixels
 * d'écran décrochait dès que le visage ne regardait plus droit devant.
 */
export class NutsGame extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(280);
    }

    enter() {
        this.gameConfig = { cameraMode: 'fullscreen', hands: false, pose: false, face: true, smoothing: 0.7 };
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
        this.spawnTimer = 1;
        this.nuts = [];
        this.score = 0;
        this.eaten = 0;
        this.missed = 0;
        this.gold = 0;
        this.photoCooldown = 0;
        this.chew = 0;

        this.mouth = null;      // position écran de la bouche
        this.mouthOpen = 0;     // 0 à 1, pour animer le masque
        this.isOpen = false;
        this.reach = 60;        // rayon d'action, proportionnel au visage

        this.particles.clear();
        this.modal.hide();
    }

    // ==========================================================
    //  BOUCLE
    // ==========================================================

    update(dt) {
        if (this.modal.isVisible) return;

        const display = this.game.display;
        this._readFace(display);

        if (this.state === 'WAITING') {
            if (this.mouth) this.state = 'PLAYING';
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.timeLeft -= dt;
        this.chew = Math.max(0, this.chew - dt * 3);
        this.photoCooldown = Math.max(0, this.photoCooldown - dt);

        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._finish();
            return;
        }

        this._spawn(dt, display);
        this._updateNuts(dt, display);
        this.particles.update(dt, 200);
    }

    /** Bouche du joueur : position écran et ouverture. */
    _readFace(display) {
        const raw = this.game.inputs.players[0]?.face?.raw;
        const upper = raw?.[13];
        const lower = raw?.[14];
        const top = raw?.[10];
        const chin = raw?.[152];

        if (!upper || !lower || !top || !chin) {
            this.mouth = null;
            this.mouthOpen = 0;
            this.isOpen = false;
            return;
        }

        const height = Math.hypot(top.x - chin.x, top.y - chin.y) || 0.2;

        // Le miroir est appliqué ici, comme partout ailleurs : les points
        // bruts sont dans le repère caméra, l'écran est renvoyé à l'envers.
        this.mouth = display.toVirtual(1 - (upper.x + lower.x) / 2, (upper.y + lower.y) / 2);

        // Rapporté à la hauteur du visage : s'éloigner ne doit rien changer
        const gap = Math.hypot(upper.x - lower.x, upper.y - lower.y) / height;
        this.mouthOpen = Math.max(0, Math.min(1, (gap - 0.04) / 0.22));
        this.isOpen = gap > MOUTH_OPEN;

        // Rayon d'action proportionnel au visage : un joueur au fond de la
        // pièce ne doit pas avoir une bouche minuscule à viser.
        const frame = faceFrame(raw, display);
        this.reach = frame ? Math.max(46, frame.height * 0.42) : 60;
    }

    _spawn(dt, display) {
        this.spawnTimer -= dt;
        if (this.spawnTimer > 0) return;

        const progress = 1 - this.timeLeft / ROUND_TIME;
        this.spawnTimer = 1.15 - progress * 0.6;

        const gold = Math.random() < GOLD_CHANCE;
        this.nuts.push({
            x: display.virtW * (0.12 + Math.random() * 0.76),
            y: -40,
            vx: (Math.random() - 0.5) * 60,
            vy: 40 + progress * 90,
            spin: (Math.random() - 0.5) * 3,
            angle: Math.random() * Math.PI,
            radius: gold ? 20 : 17,
            gold
        });
    }

    _updateNuts(dt, display) {
        for (let i = this.nuts.length - 1; i >= 0; i--) {
            const nut = this.nuts[i];

            // Bouche ouverte : la noisette est aspirée. Bouche fermée, elle
            // rebondit sur le museau — le joueur voit qu'il a raté de peu.
            if (this.mouth) {
                const dx = this.mouth.x - nut.x;
                const dy = this.mouth.y - nut.y;
                const distance = Math.hypot(dx, dy);

                if (distance < this.reach) {
                    if (this.isOpen) {
                        if (distance < this.reach * 0.55) {
                            this._eat(nut);
                            this.nuts.splice(i, 1);
                            continue;
                        }
                        nut.vx += (dx / distance) * 700 * dt;
                        nut.vy += (dy / distance) * 700 * dt;
                    } else if (distance < this.reach * 0.7) {
                        nut.vx -= (dx / distance) * 420 * dt;
                        nut.vy -= (dy / distance) * 260 * dt;
                    }
                }
            }

            nut.vy += GRAVITY * dt;
            nut.x += nut.vx * dt;
            nut.y += nut.vy * dt;
            nut.angle += nut.spin * dt;

            if (nut.y > display.virtH + 60) {
                this.nuts.splice(i, 1);
                this.missed++;
            }
        }
    }

    _eat(nut) {
        this.eaten++;
        this.chew = 1;
        this.score += nut.gold ? 50 : 10;
        this.game.playSound('select');

        this.particles.spawn(nut.x, nut.y, nut.gold ? THEME.highlight : THEME.accentWarm,
            { count: nut.gold ? 20 : 10, speed: 240, size: 4, life: 0.5 });

        if (!nut.gold || this.photoCooldown > 0) return;

        // La dorée, c'est le moment de gloire : on le photographie
        this.gold++;
        this.photoCooldown = PHOTO_COOLDOWN;
        this.game.capture.snap(`Noisette dorée — ${this.score} points`);
    }

    _finish() {
        this.state = 'GAMEOVER';
        this.after(700, () => {
            this.modal.show(`${this.score} points · ${this.eaten} noisettes`,
                this.gameConfig, () => this.reset());
            if (this.gold > 0) this.after(900, () => this.game.capture.openGallery());
        });
    }

    // ==========================================================
    //  RENDU
    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.fillStyle = 'rgba(16, 18, 20, 0.4)';
        ctx.fillRect(0, 0, w, h);

        for (const nut of this.nuts) drawNut(ctx, nut);
        this.particles.draw(ctx);
        this._drawMask(display);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'NOISETTES',
                'Montrez votre visage · ouvrez la bouche pour gober les noisettes');
            return;
        }

        this._drawHud(ctx, w, h);
    }

    _drawMask(display) {
        const raw = this.game.inputs.players[0]?.face?.raw;
        if (!raw) return;

        // Un coup de mâchoire à chaque noisette avalée
        const open = Math.max(this.mouthOpen, this.chew * 0.8);
        drawMask(display.ctx, raw, display, 'ecureuil', { mouthOpen: open });
    }

    _drawHud(ctx, w, h) {
        drawScoreBar(ctx, w, [
            { label: 'Points', value: this.score, color: playerColor(0) },
            { label: 'Temps', value: Math.ceil(this.timeLeft), color: this.timeLeft < 10 ? THEME.danger : THEME.textStrong },
            { label: 'Dorées', value: this.gold, color: THEME.highlight }
        ]);

        drawGauge(ctx, w / 2 - 110, 132, 220, 3, this.timeLeft / ROUND_TIME,
            this.timeLeft < 10 ? THEME.danger : THEME.accent);

        // Témoin d'ouverture : on comprend tout de suite ce que la borne voit
        if (this.mouth) {
            ctx.save();
            ctx.strokeStyle = alpha(this.isOpen ? THEME.success : THEME.textMuted, 0.5);
            ctx.lineWidth = this.isOpen ? 2.5 : 1;
            ctx.beginPath();
            ctx.arc(this.mouth.x, this.mouth.y, this.reach * 0.55, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.textMuted;
        ctx.font = `400 13px ${THEME.fontUi}`;
        ctx.fillText(this.missed > 0 ? `${this.missed} noisettes perdues` : 'Aucune noisette perdue',
            w / 2, h - 40);
        ctx.restore();
    }
}

/* ------------------------------------------------------------------ */

/** Un gland : une coque ronde et son chapeau. */
function drawNut(ctx, nut) {
    const body = nut.gold ? THEME.highlight : '#a9764b';
    const cap = nut.gold ? '#b9a06a' : '#6b4a30';

    ctx.save();
    ctx.translate(nut.x, nut.y);
    ctx.rotate(nut.angle);

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, nut.radius * 0.18, nut.radius * 0.8, nut.radius * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.ellipse(0, -nut.radius * 0.45, nut.radius * 0.85, nut.radius * 0.45, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-nut.radius * 0.85, -nut.radius * 0.5, nut.radius * 1.7, nut.radius * 0.22);

    // Petite tige
    ctx.strokeStyle = cap;
    ctx.lineWidth = Math.max(2, nut.radius * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -nut.radius * 0.8);
    ctx.lineTo(0, -nut.radius * 1.15);
    ctx.stroke();

    if (nut.gold) {
        ctx.strokeStyle = alpha(THEME.textStrong, 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-nut.radius * 0.3, nut.radius * 0.1, nut.radius * 0.22, Math.PI * 0.8, Math.PI * 1.6);
        ctx.stroke();
    }
    ctx.restore();
}

registerGame({
    id: 'game_nuts',
    name: 'NOISETTES',
    icon: '🐿️',
    color: '#c2a882',
    players: 1,
    description: 'Le masque d\'écureuil suit votre visage : ouvrez la bouche au bon moment.',
    class: NutsGame
});
