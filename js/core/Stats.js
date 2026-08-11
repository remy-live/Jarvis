/**
 * COMPTEUR DE PERFORMANCE (touche F)
 *
 * Affiche FPS, temps d'une frame et coût de l'analyse IA. Pratique pour
 * savoir si un ralentissement vient du jeu ou de la vision par ordinateur.
 * Désactivé, il ne coûte strictement rien : `render()` sort tout de suite.
 */
export class Stats {
    /** @param {import('./Engine.js').Engine} engine */
    constructor(engine) {
        this.engine = engine;
        this.visible = false;

        this.fps = 0;
        this._frames = 0;
        this._accumulator = 0;
        this._frameMs = 0;
    }

    toggle() {
        this.visible = !this.visible;
    }

    render(ctx, dt) {
        // La moyenne tourne en permanence : elle est juste dès l'affichage
        this._frames++;
        this._accumulator += dt;
        this._frameMs = this._frameMs * 0.9 + dt * 1000 * 0.1;

        if (this._accumulator >= 0.5) {
            this.fps = Math.round(this._frames / this._accumulator);
            this._frames = 0;
            this._accumulator = 0;
        }

        if (!this.visible) return;

        const inputs = this.engine.inputs;
        const lines = [`${this.fps} FPS  ·  ${this._frameMs.toFixed(1)} ms/frame`];

        if (inputs.mode === 'vision') {
            // Une analyse bloque la page pendant sa durée : c'est le premier
            // chiffre à regarder quand ça saccade.
            const cost = inputs.lastInferenceMs;
            const rate = cost > 0 ? Math.min(1000 / Math.max(cost, 1), 1000 / inputs._detectionBudget) : 0;
            lines.push(`analyse ${cost.toFixed(0)} ms  ·  ${rate.toFixed(1)}/s  ·  ${inputs.trackedPlayers} joueur(s)`);
            lines.push(`mains ${inputs.enableHands ? 'on' : 'off'} · pose ${inputs.enablePose ? 'on' : 'off'} · visage ${inputs.enableFace ? 'on' : 'off'}`);
            if (inputs.modelSource === 'cdn') lines.push('modèles : CDN (npm run setup pour les avoir en local)');
        } else {
            lines.push('IA désactivée · entrées souris / clavier');
        }

        ctx.save();
        ctx.font = "500 12px ui-monospace, 'SFMono-Regular', Menlo, monospace";
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 24;
        const height = lines.length * 18 + 20;
        const x = 20;
        const y = window.innerHeight - height - 20;

        ctx.fillStyle = 'rgba(8, 11, 15, 0.82)';
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 10);
        ctx.fill();

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();

        lines.forEach((line, i) => {
            ctx.fillStyle = i === 0 ? '#e2e8f0' : 'rgba(226, 232, 240, 0.6)';
            ctx.fillText(line, x + 12, y + 10 + i * 18);
        });
        ctx.restore();
    }
}
