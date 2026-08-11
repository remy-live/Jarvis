import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { drawMessage, drawScoreBar, Particles } from './shared.js';

const LIVES = 3;
const TELEGRAPH = 1.1;     // secondes de visée avant le tir
const BEAM_LIFE = 0.32;    // durée du tir
const HIT_COOLDOWN = 1.2;  // invulnérabilité après un coup

/**
 * ESQUIVE LASER
 *
 * Des rayons se chargent puis balaient l'écran : il faut sortir de leur
 * trajectoire en bougeant. La cadence monte avec le temps, le score est le
 * temps tenu. À deux, chacun ses vies mais le chrono est commun.
 */
export class LaserDodge extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(320);
    }

    enter() {
        // La pose donne la position du corps ; les mains servent aux menus.
        this.gameConfig = { cameraMode: 'fullscreen', hands: false, pose: true, face: false, smoothing: 0.5 };
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
        this.spawnTimer = 0;
        this.beams = [];
        this.shake = 0;

        this.runners = [0, 1].map((id) => ({
            id,
            lives: LIVES,
            alive: false,       // devient vrai dès que le joueur est détecté
            invulnerable: 0,
            x: 0,
            y: 0
        }));

        this.particles.clear();
        this.modal.hide();
    }

    update(dt) {
        if (this.modal.isVisible) return;

        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        this._trackRunners(w, h);

        if (this.state === 'WAITING') {
            if (this.runners.some((r) => r.alive)) {
                this.state = 'PLAYING';
                this.spawnTimer = 1.4;
            }
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.elapsed += dt;
        this.shake = Math.max(0, this.shake - dt * 40);

        // Cadence : d'un rayon toutes les 1,6 s au départ à 0,45 s à la fin
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this._spawnBeam(w, h);
            const difficulty = Math.min(1, this.elapsed / 75);
            this.spawnTimer = 1.6 - difficulty * 1.15;
        }

        this._updateBeams(dt, w, h);
        this.particles.update(dt);

        for (const runner of this.runners) {
            if (runner.invulnerable > 0) runner.invulnerable -= dt;
        }

        // Fin de partie : tout le monde à court de vies
        const engaged = this.runners.filter((r) => r.lives < LIVES || r.alive);
        if (engaged.length > 0 && engaged.every((r) => r.lives <= 0)) this._gameOver();
    }

    _trackRunners(w, h) {
        const players = this.game.inputs.players;

        this.runners.forEach((runner, i) => {
            const player = players[i];
            if (!player?.detected || runner.lives <= 0) {
                runner.alive = false;
                return;
            }

            runner.alive = true;

            // Le nez suit la tête ; à défaut on retombe sur la position lissée
            const nose = player.pose?.raw?.[0];
            if (nose) {
                runner.x = (1 - nose.x) * w;
                runner.y = nose.y * h;
            } else {
                runner.x = player.x;
                runner.y = player.y;
            }
        });
    }

    _spawnBeam(w, h) {
        const horizontal = Math.random() < 0.5;
        const thickness = 70 + Math.random() * 90;

        this.beams.push({
            horizontal,
            // Position du centre du rayon, dans l'axe perpendiculaire
            position: horizontal
                ? thickness / 2 + Math.random() * (h - thickness)
                : thickness / 2 + Math.random() * (w - thickness),
            thickness,
            charge: TELEGRAPH,
            firing: 0,
            spent: false
        });
    }

    _updateBeams(dt, w, h) {
        for (let i = this.beams.length - 1; i >= 0; i--) {
            const beam = this.beams[i];

            if (beam.charge > 0) {
                beam.charge -= dt;
                if (beam.charge <= 0) {
                    beam.firing = BEAM_LIFE;
                    this.shake = 12;
                    this.game.playSound('select');
                    this._checkHits(beam, w, h);
                }
                continue;
            }

            beam.firing -= dt;
            if (beam.firing <= 0) this.beams.splice(i, 1);
        }
    }

    _checkHits(beam, w, h) {
        for (const runner of this.runners) {
            if (!runner.alive || runner.invulnerable > 0 || runner.lives <= 0) continue;

            const coordinate = beam.horizontal ? runner.y : runner.x;
            if (Math.abs(coordinate - beam.position) > beam.thickness / 2) continue;

            runner.lives--;
            runner.invulnerable = HIT_COOLDOWN;
            this.particles.spawn(runner.x, runner.y, playerColor(runner.id),
                { count: 22, speed: 340, size: 4, life: 0.7 });
        }
    }

    _gameOver() {
        this.state = 'GAMEOVER';
        const seconds = this.elapsed.toFixed(1);
        this.after(700, () => {
            this.modal.show(`${seconds} s tenues`, this.gameConfig, () => this.reset());
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

        for (const beam of this.beams) this._drawBeam(ctx, beam, w, h);
        this.particles.draw(ctx);
        for (const runner of this.runners) this._drawRunner(ctx, runner);

        ctx.restore();

        this._drawHud(ctx, w, h);
    }

    _drawBeam(ctx, beam, w, h) {
        const charging = beam.charge > 0;
        const progress = charging ? 1 - beam.charge / TELEGRAPH : 1;

        const x = beam.horizontal ? 0 : beam.position - beam.thickness / 2;
        const y = beam.horizontal ? beam.position - beam.thickness / 2 : 0;
        const width = beam.horizontal ? w : beam.thickness;
        const height = beam.horizontal ? beam.thickness : h;

        ctx.save();
        if (charging) {
            // Zone de danger annoncée : elle se remplit avant de tirer
            ctx.fillStyle = alpha(THEME.danger, 0.06 + progress * 0.12);
            ctx.fillRect(x, y, width, height);

            ctx.strokeStyle = alpha(THEME.danger, 0.35 + progress * 0.45);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([12, 10]);
            ctx.strokeRect(x, y, width, height);
        } else {
            const fade = Math.max(0, beam.firing / BEAM_LIFE);
            ctx.fillStyle = alpha(THEME.danger, 0.25 + fade * 0.5);
            ctx.fillRect(x, y, width, height);

            ctx.fillStyle = alpha(THEME.textStrong, fade * 0.85);
            if (beam.horizontal) ctx.fillRect(x, beam.position - 2, width, 4);
            else ctx.fillRect(beam.position - 2, y, 4, height);
        }
        ctx.restore();
    }

    _drawRunner(ctx, runner) {
        if (!runner.alive) return;

        const color = playerColor(runner.id);
        const blinking = runner.invulnerable > 0 && Math.floor(runner.invulnerable * 12) % 2 === 0;

        ctx.save();
        ctx.globalAlpha = blinking ? 0.3 : 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(runner.x, runner.y, 32, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = alpha(color, 0.18);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(runner.x, runner.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawHud(ctx, w, h) {
        const entries = this.runners
            .filter((runner) => runner.alive || runner.lives < LIVES)
            .map((runner) => ({
                label: `Joueur ${runner.id + 1}`,
                value: '●'.repeat(Math.max(0, runner.lives)) + '○'.repeat(LIVES - Math.max(0, runner.lives)),
                color: playerColor(runner.id)
            }));

        entries.splice(entries.length > 1 ? 1 : 0, 0, {
            label: 'Temps',
            value: `${this.elapsed.toFixed(1)} s`,
            color: THEME.textStrong
        });

        drawScoreBar(ctx, w, entries);

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'ESQUIVE LASER',
                'Reculez pour être vu en entier, puis évitez les zones rouges');
        }
    }
}

registerGame({
    id: 'laser_dodge',
    name: 'ESQUIVE LASER',
    icon: '🛰️',
    color: '#c08a86',
    players: 2,
    description: 'Bougez pour éviter les rayons. Tenez le plus longtemps possible.',
    class: LaserDodge
});
