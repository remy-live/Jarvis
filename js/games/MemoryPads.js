import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { pointerOf, drawMessage, drawScoreBar, drawGauge, Particles } from './_shared.js';

const HOLD_TIME = 0.45;    // temps de maintien sur une dalle pour la valider
const FLASH_ON = 0.42;     // durée d'allumage pendant la démonstration
const FLASH_OFF = 0.18;

const PADS = [
    { label: 'A', tone: 330 },
    { label: 'B', tone: 392 },
    { label: 'C', tone: 494 },
    { label: 'D', tone: 587 }
];

/**
 * SÉQUENCE
 *
 * Quatre dalles s'allument dans un ordre à retenir, puis à reproduire en
 * posant la main dessus. Un pas de plus à chaque tour. À deux, on joue
 * chacun son tour sur la même séquence : le premier qui se trompe perd.
 */
export class MemoryPads extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(200);
    }

    enter() {
        this.gameConfig = { cameraMode: 'fullscreen', hands: true, pose: false, face: false, smoothing: 0.55 };
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
        this.state = 'WAITING';   // WAITING → SHOWING → INPUT → GAMEOVER
        this.sequence = [];
        this.round = 0;
        this.scores = [0, 0];
        this.currentPlayer = 0;
        this.twoPlayers = false;

        this.showIndex = 0;
        this.showTimer = 0;
        this.litPad = -1;

        this.inputIndex = 0;
        this.hover = { pad: -1, time: 0 };
        this.feedback = null;     // { pad, ok, life }

        this.particles.clear();
        this.modal.hide();
    }

    /** Géométrie des dalles : une grille 2 × 2 centrée. */
    _layout(w, h) {
        const size = Math.min(w, h) * 0.62;
        const cell = size / 2 - 10;
        const left = w / 2 - size / 2;
        const top = h / 2 - size / 2 + 20;

        return PADS.map((pad, i) => ({
            ...pad,
            index: i,
            x: left + (i % 2) * (cell + 20),
            y: top + Math.floor(i / 2) * (cell + 20),
            size: cell
        }));
    }

    update(dt) {
        if (this.modal.isVisible) return;

        const w = this.game.display.virtW;
        const h = this.game.display.virtH;
        this.pads = this._layout(w, h);

        this.particles.update(dt);
        if (this.feedback) {
            this.feedback.life -= dt;
            if (this.feedback.life <= 0) this.feedback = null;
        }

        switch (this.state) {
            case 'WAITING': this._updateWaiting(); break;
            case 'SHOWING': this._updateShowing(dt); break;
            case 'INPUT': this._updateInput(dt); break;
            default: break;
        }
    }

    _updateWaiting() {
        if (!this.game.inputs.players[0]?.detected) return;
        this.twoPlayers = this.game.inputs.players[1]?.detected === true;
        this._nextRound();
    }

    _nextRound() {
        this.round++;
        this.sequence.push(Math.floor(Math.random() * PADS.length));
        this.state = 'SHOWING';
        this.showIndex = 0;
        this.showTimer = 0.6;   // petit temps mort avant la démonstration
        this.litPad = -1;
    }

    _updateShowing(dt) {
        this.showTimer -= dt;
        if (this.showTimer > 0) return;

        if (this.litPad === -1) {
            // On allume la dalle suivante
            if (this.showIndex >= this.sequence.length) {
                this.state = 'INPUT';
                this.inputIndex = 0;
                this.hover = { pad: -1, time: 0 };
                return;
            }
            this.litPad = this.sequence[this.showIndex];
            this.showTimer = FLASH_ON;
            this._playTone(PADS[this.litPad].tone);
        } else {
            this.litPad = -1;
            this.showIndex++;
            this.showTimer = FLASH_OFF;
        }
    }

    _updateInput(dt) {
        const pointer = pointerOf(this.game.inputs.players[this.currentPlayer]);
        if (!pointer) {
            this.hover = { pad: -1, time: 0 };
            return;
        }

        const pad = this.pads.find((p) =>
            pointer.x >= p.x && pointer.x <= p.x + p.size &&
            pointer.y >= p.y && pointer.y <= p.y + p.size);

        if (!pad) {
            this.hover = { pad: -1, time: 0 };
            return;
        }

        if (this.hover.pad !== pad.index) {
            this.hover = { pad: pad.index, time: 0 };
            return;
        }

        this.hover.time += dt;

        // Le pincement raccourcit l'attente pour ceux qui vont vite
        const pinching = this.game.inputs.players[this.currentPlayer]?.isClicking;
        if (this.hover.time >= HOLD_TIME || pinching) this._validate(pad);
    }

    _validate(pad) {
        this.hover = { pad: -1, time: 0 };
        const expected = this.sequence[this.inputIndex];

        if (pad.index !== expected) {
            this.feedback = { pad: pad.index, ok: false, life: 0.6 };
            this._playTone(120);
            this._endTurn(false);
            return;
        }

        this.feedback = { pad: pad.index, ok: true, life: 0.4 };
        this._playTone(pad.tone);
        this.particles.spawn(pad.x + pad.size / 2, pad.y + pad.size / 2,
            playerColor(this.currentPlayer), { count: 12, speed: 220, size: 3.5, life: 0.5 });

        this.inputIndex++;
        if (this.inputIndex >= this.sequence.length) {
            this.scores[this.currentPlayer] = this.round;
            this._endTurn(true);
        }
    }

    _endTurn(success) {
        if (!success) {
            this.state = 'GAMEOVER';
            const loser = this.currentPlayer;
            this.after(900, () => {
                const message = this.twoPlayers
                    ? `JOUEUR ${loser === 0 ? 2 : 1} GAGNE`
                    : `${this.round - 1} pas de mémoire`;
                this.modal.show(message, this.gameConfig, () => this.reset());
            });
            return;
        }

        // À deux, la main passe à l'autre joueur avant le tour suivant
        if (this.twoPlayers) this.currentPlayer = this.currentPlayer === 0 ? 1 : 0;

        // État tampon : rien ne bouge le temps de la transition
        this.state = 'PAUSE';
        this.after(750, () => {
            if (this.state === 'PAUSE') this._nextRound();
        });
    }

    _playTone(frequency) {
        // On réutilise le générateur de bips du moteur pour rester léger
        this.game.playSound(frequency > 200 ? 'select' : 'hover');
    }

    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;
        if (!this.pads) this.pads = this._layout(w, h);

        ctx.fillStyle = 'rgba(16, 18, 20, 0.62)';
        ctx.fillRect(0, 0, w, h);

        for (const pad of this.pads) this._drawPad(ctx, pad);
        this.particles.draw(ctx);

        const entries = [{ label: 'Tour', value: this.round, color: THEME.textStrong }];
        if (this.twoPlayers) {
            entries.unshift({ label: 'Joueur 1', value: this.scores[0], color: THEME.player1 });
            entries.push({ label: 'Joueur 2', value: this.scores[1], color: THEME.player2 });
        }
        drawScoreBar(ctx, w, entries);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'SÉQUENCE',
                'Regardez l\'ordre, puis reproduisez-le en posant la main sur les dalles');
            return;
        }

        this._drawStatus(ctx, w, h);
    }

    _drawPad(ctx, pad) {
        const lit = this.litPad === pad.index;
        const feedback = this.feedback?.pad === pad.index ? this.feedback : null;

        let color = THEME.textMuted;
        let fill = 0.05;

        if (lit) {
            color = THEME.accent;
            fill = 0.3;
        } else if (feedback) {
            color = feedback.ok ? THEME.success : THEME.danger;
            fill = 0.28;
        } else if (this.hover.pad === pad.index) {
            color = playerColor(this.currentPlayer);
            fill = 0.14;
        }

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(pad.x, pad.y, pad.size, pad.size, 18);
        ctx.fillStyle = alpha(color, fill);
        ctx.fill();
        ctx.strokeStyle = alpha(color, lit || feedback ? 0.9 : 0.35);
        ctx.lineWidth = lit ? 3 : 1.5;
        ctx.stroke();

        // Anneau de maintien pendant la saisie
        if (this.hover.pad === pad.index && this.state === 'INPUT') {
            const ratio = Math.min(1, this.hover.time / HOLD_TIME);
            ctx.beginPath();
            ctx.arc(pad.x + pad.size / 2, pad.y + pad.size / 2, pad.size * 0.3,
                -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
            ctx.strokeStyle = playerColor(this.currentPlayer);
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        ctx.fillStyle = alpha(color, lit ? 0.9 : 0.35);
        ctx.font = `600 ${Math.round(pad.size * 0.22)}px ${THEME.fontDisplay}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pad.label, pad.x + pad.size / 2, pad.y + pad.size / 2);
        ctx.restore();
    }

    _drawStatus(ctx, w, h) {
        const showing = this.state === 'SHOWING';
        const label = showing
            ? 'Mémorisez…'
            : this.twoPlayers ? `À vous, joueur ${this.currentPlayer + 1}` : 'À vous';

        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = showing ? THEME.accent : playerColor(this.currentPlayer);
        ctx.font = `500 15px ${THEME.fontUi}`;
        ctx.fillText(label, w / 2, h * 0.16);
        ctx.restore();

        if (this.state === 'INPUT') {
            const width = Math.min(w * 0.4, 320);
            drawGauge(ctx, w / 2 - width / 2, h * 0.19, width, 4,
                this.inputIndex / this.sequence.length, playerColor(this.currentPlayer));
        }
    }
}

registerGame({
    id: 'memory_pads',
    name: 'SÉQUENCE',
    icon: '🧠',
    color: '#c2a882',
    players: 2,
    description: 'Retenez l\'ordre des dalles et refaites-le de la main.',
    class: MemoryPads
});
