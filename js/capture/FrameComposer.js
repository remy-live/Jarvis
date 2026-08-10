import { CONFIG } from '../core/Config.js';

/**
 * COMPOSITEUR D'IMAGE
 *
 * Le jeu est réparti sur plusieurs calques (webcam, 3D, HUD) qui ne
 * s'empilent qu'à l'écran. Pour une photo ou une vidéo, il faut les
 * fusionner à la main : c'est le seul rôle de cette classe.
 *
 * Elle est partagée par la photo et l'enregistrement vidéo, ce qui garantit
 * que les deux rendent exactement la même image.
 */
export class FrameComposer {
    /** @param {import('../core/Display.js').Display} display */
    constructor(display) {
        this.display = display;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
    }

    /**
     * Redimensionne le canvas de composition.
     * @param {number} pixelRatio - 1 pour la vidéo (fluidité), 2 pour la photo (finesse)
     */
    resize(pixelRatio) {
        const width = Math.round(this.display.virtW * pixelRatio);
        const height = Math.round(this.display.virtH * pixelRatio);

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        return { width: this.display.virtW, height: this.display.virtH, pixelRatio };
    }

    /**
     * Dessine une frame complète dans le canvas de composition.
     * @param {{signature?: boolean}} [options]
     */
    draw({ signature = true } = {}) {
        const width = this.display.virtW;
        const height = this.display.virtH;
        const ctx = this.ctx;

        ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);

        // 1. Fond
        ctx.fillStyle = CONFIG.capture.background;
        ctx.fillRect(0, 0, width, height);

        // 2. Webcam
        this._drawCamera(ctx, width, height);

        // 3. Scène 3D puis HUD 2D
        const three = this.display.threeCanvas;
        if (three.width > 0) ctx.drawImage(three, 0, 0, width, height);

        const ui = this.display.uiCanvas;
        if (ui.width > 0) ctx.drawImage(ui, 0, 0, width, height);

        if (signature) this._drawSignature(ctx, width, height);

        return this.canvas;
    }

    _drawCamera(ctx, width, height) {
        const feedback = this.display.feedbackCanvas;
        if (!feedback.width || feedback.style.display === 'none') return;

        // On reprend opacité et filtre du CSS : la capture doit ressembler
        // exactement à ce que le joueur a sous les yeux.
        const style = getComputedStyle(feedback);
        ctx.save();
        ctx.globalAlpha = Number(style.opacity) || 1;
        if (style.filter && style.filter !== 'none') ctx.filter = style.filter;

        if (feedback.classList.contains('view-fullscreen')) {
            this._drawCover(ctx, feedback, width, height);
        } else {
            const rect = feedback.getBoundingClientRect();
            ctx.beginPath();
            ctx.roundRect(rect.left, rect.top, rect.width, rect.height, 14);
            ctx.clip();
            ctx.drawImage(feedback, rect.left, rect.top, rect.width, rect.height);
        }
        ctx.restore();
    }

    /** Équivalent canvas de `object-fit: cover`. */
    _drawCover(ctx, source, width, height) {
        const scale = Math.max(width / source.width, height / source.height);
        const w = source.width * scale;
        const h = source.height * scale;
        ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
    }

    _drawSignature(ctx, width, height) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#e7e9ec';
        ctx.font = "500 13px 'Inter', system-ui, sans-serif";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('JARVIS ARCADE', width - 24, height - 20);
        ctx.restore();
    }
}
