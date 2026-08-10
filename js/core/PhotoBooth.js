import { CONFIG } from './Config.js';

/**
 * PHOTOMATON
 *
 * Capture une photo de la partie en cours : le flux webcam ET tout ce que
 * le jeu dessine par-dessus (3D + HUD) sont fusionnés dans une seule image.
 *
 * Déclenchement :
 *   - bouton 📷 du bandeau
 *   - touche C
 *   - engine.photoBooth.capture() depuis un jeu
 *
 * Note technique : la composition est faite à la FIN d'une frame, juste
 * après le rendu, sinon le canvas WebGL est déjà vidé et ressort noir.
 */
export class PhotoBooth {
    /** @param {import('./Engine.js').Engine} engine */
    constructor(engine) {
        this.engine = engine;
        this.display = engine.display;

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.pending = false;       // une capture est demandée pour cette frame
        this.countdown = 0;         // secondes restantes avant déclenchement
        this.photos = [];           // historique de la session (data URLs)

        this.overlay = this._createOverlay();
        this.flash = this._createFlash();
    }

    // ==========================================================
    //  DÉCLENCHEMENT
    // ==========================================================

    /**
     * Lance le compte à rebours puis la capture.
     * @param {number} [delaySeconds=3] - 0 pour capturer immédiatement
     */
    start(delaySeconds = CONFIG.photo.countdown) {
        if (this.countdown > 0 || this.pending) return;

        if (delaySeconds <= 0) {
            this.capture();
            return;
        }
        this.countdown = delaySeconds;
    }

    /** Capture sans compte à rebours (à la prochaine fin de frame). */
    capture() {
        this.pending = true;
    }

    /** Appelé par le moteur à chaque frame, avant le rendu. */
    update(dt) {
        if (this.countdown <= 0) return;

        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        const after = Math.ceil(this.countdown);

        if (after !== before && after > 0) this.engine.playSound('hover');

        if (this.countdown <= 0) {
            this.countdown = 0;
            this.pending = true;
        }
    }

    /** Compte à rebours dessiné par-dessus le jeu. */
    render(ctx, width, height) {
        if (this.countdown <= 0) return;

        const remaining = Math.ceil(this.countdown);
        const phase = 1 - (this.countdown % 1); // 0 → 1 sur chaque seconde

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.25 + 0.75 * (1 - phase);
        ctx.fillStyle = '#f8fafc';
        ctx.font = `600 ${Math.round(height * 0.28)}px 'Orbitron', sans-serif`;
        ctx.fillText(String(remaining), width / 2, height / 2);

        ctx.globalAlpha = 0.8;
        ctx.font = "500 20px 'Orbitron', sans-serif";
        ctx.fillText('SOURIEZ', width / 2, height / 2 + height * 0.19);
        ctx.restore();
    }

    // ==========================================================
    //  COMPOSITION
    // ==========================================================

    /**
     * Fusionne les couches visibles dans une image.
     * À appeler juste après le rendu de la frame.
     */
    flushPending() {
        if (!this.pending) return;
        this.pending = false;

        try {
            const dataUrl = this._compose();
            this.photos.push(dataUrl);
            if (this.photos.length > CONFIG.photo.historySize) this.photos.shift();

            this._playFlash();
            this.engine.playSound('select');
            this._showPreview(dataUrl);
        } catch (error) {
            console.error('📷 Capture impossible :', error);
        }
    }

    _compose() {
        const width = this.display.virtW;
        const height = this.display.virtH;
        const ratio = Math.min(window.devicePixelRatio || 1, CONFIG.photo.maxPixelRatio);

        this.canvas.width = Math.round(width * ratio);
        this.canvas.height = Math.round(height * ratio);

        const ctx = this.ctx;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        // 1. Fond
        ctx.fillStyle = CONFIG.photo.background;
        ctx.fillRect(0, 0, width, height);

        // 2. Webcam (en miroir, comme à l'écran) — seulement si plein écran
        const feedback = this.display.feedbackCanvas;
        const isFullscreen = feedback.classList.contains('view-fullscreen');
        if (isFullscreen && feedback.width > 0) {
            // On reprend l'opacité et le filtre appliqués par le CSS pour que
            // la photo ressemble exactement à ce que le joueur voit.
            const style = getComputedStyle(feedback);
            ctx.save();
            ctx.globalAlpha = Number(style.opacity) || 1;
            if (style.filter && style.filter !== 'none') ctx.filter = style.filter;
            this._drawCover(ctx, feedback, width, height);
            ctx.restore();
        }

        // 3. Scène 3D
        const three = this.display.threeCanvas;
        if (three.width > 0) ctx.drawImage(three, 0, 0, width, height);

        // 4. HUD / jeu 2D
        const ui = this.display.uiCanvas;
        if (ui.width > 0) ctx.drawImage(ui, 0, 0, width, height);

        // 5. Vignette webcam (coin bas droite) si elle est affichée
        if (!isFullscreen && feedback.style.display !== 'none' && feedback.width > 0) {
            const rect = feedback.getBoundingClientRect();
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(rect.left, rect.top, rect.width, rect.height, 12);
            ctx.clip();
            ctx.drawImage(feedback, rect.left, rect.top, rect.width, rect.height);
            ctx.restore();
        }

        // 6. Signature discrète
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#f8fafc';
        ctx.font = "500 14px 'Orbitron', sans-serif";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('JARVIS ARCADE', width - 24, height - 20);
        ctx.restore();

        return this.canvas.toDataURL('image/png');
    }

    /** Dessine une image en « cover » (comme object-fit: cover). */
    _drawCover(ctx, source, width, height) {
        const scale = Math.max(width / source.width, height / source.height);
        const w = source.width * scale;
        const h = source.height * scale;
        ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
    }

    // ==========================================================
    //  INTERFACE
    // ==========================================================

    _createFlash() {
        const el = document.createElement('div');
        el.className = 'photo-flash';
        document.body.appendChild(el);
        return el;
    }

    _playFlash() {
        this.flash.classList.remove('is-firing');
        // reflow forcé : sinon l'animation ne se rejoue pas
        void this.flash.offsetWidth;
        this.flash.classList.add('is-firing');
    }

    _createOverlay() {
        const el = document.createElement('div');
        el.className = 'photo-preview';
        el.hidden = true;
        el.innerHTML = `
            <div class="photo-preview__box">
                <img class="photo-preview__img" alt="Photo de la partie">
                <div class="photo-preview__actions">
                    <button class="btn-ghost interactive" data-action="save" type="button">Enregistrer</button>
                    <button class="btn-ghost interactive" data-action="again" type="button">Reprendre</button>
                    <button class="btn-ghost interactive" data-action="close" type="button">Fermer</button>
                </div>
            </div>
        `;
        document.body.appendChild(el);

        el.addEventListener('click', (event) => {
            const action = event.target.dataset?.action;
            if (!action && event.target !== el) return;

            if (action === 'save') this.download();
            else if (action === 'again') { this.hidePreview(); this.start(); }
            else this.hidePreview();
        });

        return el;
    }

    _showPreview(dataUrl) {
        this.overlay.querySelector('.photo-preview__img').src = dataUrl;
        this.overlay.hidden = false;
        requestAnimationFrame(() => this.overlay.classList.add('is-visible'));
        this.engine.invalidateInteractives();
    }

    hidePreview() {
        this.overlay.classList.remove('is-visible');
        setTimeout(() => { this.overlay.hidden = true; }, 250);
        this.engine.invalidateInteractives();
    }

    /** Télécharge la dernière photo prise. */
    download() {
        const dataUrl = this.photos[this.photos.length - 1];
        if (!dataUrl) return;

        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `jarvis-arcade-${stamp}.png`;
        link.click();
    }
}
