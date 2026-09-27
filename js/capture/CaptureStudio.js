import { CONFIG } from '../core/Config.js';
import { THEME } from '../core/Theme.js';
import { FrameComposer } from './FrameComposer.js';
import { VideoRecorder } from './VideoRecorder.js';
import { CaptureGallery } from '../ui/CaptureGallery.js';

/**
 * STUDIO DE CAPTURE
 *
 * Point d'entrée unique pour tout ce qui s'enregistre : photo, clip vidéo,
 * et la pellicule de la session. Le moteur ne connaît que trois méthodes
 * (`update`, `composeFrame`, `renderOverlay`) et trois actions publiques.
 *
 * Déclenchement :
 *   - bandeau : boutons 📷 et ⏺
 *   - clavier : C (photo), R (vidéo), G (pellicule)
 *   - depuis un jeu : engine.capture.photo() / .snap('légende') / .toggleRecording()
 */
export class CaptureStudio {
    /** @param {import('../core/Engine.js').Engine} engine */
    constructor(engine) {
        this.engine = engine;
        this.composer = new FrameComposer(engine.display);
        this.recorder = new VideoRecorder(this.composer.canvas);
        this.gallery = new CaptureGallery({
            onDownload: (item) => this.download(item),
            onDelete: (item) => this.remove(item),
            onChange: () => this.engine.invalidateInteractives()
        });

        /** @type {{id:number,type:'photo'|'video',url:string,poster:string,date:Date,duration:number,extension:string}[]} */
        this.items = [];
        this._nextId = 1;

        this.countdown = 0;
        this._request = null;   // { silent, label } quand une photo est demandée
        this.toast = 0;         // petite confirmation à l'écran
        this.flash = this._createFlash();
    }

    get isRecording() {
        return this.recorder.isRecording;
    }

    // ==========================================================
    //  ACTIONS
    // ==========================================================

    /** Photo avec compte à rebours (0 = immédiat), puis ouverture de la pellicule. */
    photo(delaySeconds = CONFIG.capture.countdown) {
        if (this.countdown > 0 || this._request) return;
        if (delaySeconds > 0) this.countdown = delaySeconds;
        else this._request = { silent: false, label: '' };
    }

    /**
     * Prise de vue instantanée et discrète, pour les jeux qui
     * photographient l'action : ni compte à rebours, ni pellicule qui
     * s'ouvre en pleine partie. Juste un éclair bref et un petit repère.
     *
     * @param {string} [label] - légende affichée dans la pellicule
     */
    snap(label = '') {
        if (this._request) return;
        this._request = { silent: true, label };
    }

    /** Démarre ou arrête l'enregistrement vidéo. */
    async toggleRecording() {
        if (this.recorder.isRecording) return this.stopRecording();
        return this.startRecording();
    }

    startRecording() {
        if (!VideoRecorder.isSupported) {
            this.engine.header.setNotice('VIDÉO NON SUPPORTÉE');
            return false;
        }

        // Une première composition avant le démarrage : sans ça, le flux
        // part d'un canvas vide et la première seconde est noire.
        this.composer.resize(CONFIG.capture.videoPixelRatio);
        this.composer.draw();

        const started = this.recorder.start();
        if (started) {
            this.engine.playSound('select');
            this.engine.header.setRecording(true);
        }
        return started;
    }

    async stopRecording() {
        const result = await this.recorder.stop();
        this.engine.header.setRecording(false);
        if (!result) return null;

        // Une image fixe sert de vignette dans la pellicule
        const poster = this.composer.canvas.toDataURL('image/jpeg', 0.6);
        const item = this._addItem({
            type: 'video',
            url: result.url,
            poster,
            duration: result.duration,
            extension: result.extension
        });

        this.engine.playSound('select');
        this.gallery.open(this.items, item);
        return item;
    }

    // ==========================================================
    //  CYCLE DE VIE (appelé par le moteur)
    // ==========================================================

    update(dt) {
        if (this.toast > 0) this.toast = Math.max(0, this.toast - dt);
        if (this.countdown <= 0) return;

        const before = Math.ceil(this.countdown);
        this.countdown = Math.max(0, this.countdown - dt);
        const after = Math.ceil(this.countdown);

        if (after !== before && after > 0) this.engine.playSound('hover');
        if (this.countdown === 0) this._request = { silent: false, label: '' };
    }

    /**
     * Compose la frame courante si quelqu'un en a besoin (photo demandée ou
     * enregistrement en cours). Appelé juste après le rendu du jeu, avant
     * que le navigateur ne vide le buffer WebGL.
     */
    composeFrame() {
        const request = this._request;
        if (!request && !this.recorder.isRecording) return;

        if (!request) {
            this.composer.resize(CONFIG.capture.videoPixelRatio);
            this.composer.draw();
            return;
        }

        // Photo : on monte en résolution le temps d'une frame
        this._request = null;
        this.composer.resize(CONFIG.capture.photoPixelRatio);
        const canvas = this.composer.draw();
        const url = canvas.toDataURL('image/png');

        const item = this._addItem({
            type: 'photo', url, poster: url, extension: 'png', label: request.label
        });

        this._fireFlash(request.silent);
        this.engine.playSound('select');

        // En pleine partie, ouvrir la pellicule couperait le jeu net
        if (request.silent) this.toast = 1.1;
        else this.gallery.open(this.items, item);

        // On redonne au canvas sa taille vidéo si un clip tourne
        if (this.recorder.isRecording) this.composer.resize(CONFIG.capture.videoPixelRatio);
    }

    /** Surcouches dessinées par-dessus le jeu (jamais capturées). */
    renderOverlay(ctx, width, height) {
        if (this.countdown > 0) this._renderCountdown(ctx, width, height);
        if (this.recorder.isRecording) this._renderRecordingBadge(ctx, width);
        if (this.toast > 0) this._renderToast(ctx, width, height);
    }

    /** « Photo prise » : discret, le jeu continue. */
    _renderToast(ctx, width, height) {
        const fade = Math.min(1, this.toast / 0.3);
        const count = this.items.length;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const label = `PHOTO · ${count}`;
        ctx.font = `500 12px ${THEME.fontUi}`;
        const boxWidth = ctx.measureText(label).width + 34;
        const x = width - boxWidth - 26;
        const y = height - 54;

        ctx.fillStyle = 'rgba(16, 18, 20, 0.82)';
        ctx.beginPath();
        ctx.roundRect(x, y, boxWidth, 28, 14);
        ctx.fill();

        ctx.fillStyle = THEME.accent;
        ctx.beginPath();
        ctx.arc(x + 15, y + 14, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = THEME.text;
        ctx.fillText(label, x + boxWidth / 2 + 7, y + 15);
        ctx.restore();
    }

    // ==========================================================
    //  PELLICULE
    // ==========================================================

    openGallery() {
        this.gallery.open(this.items, this.items[this.items.length - 1] || null);
    }

    download(item) {
        if (!item) return;
        const stamp = formatStamp(item.date);
        const link = document.createElement('a');
        link.href = item.url;
        link.download = `jarvis-arcade-${stamp}.${item.extension}`;
        link.click();
    }

    remove(item) {
        const index = this.items.indexOf(item);
        if (index === -1) return;

        this.items.splice(index, 1);
        if (item.type === 'video') URL.revokeObjectURL(item.url);
        this.gallery.refresh(this.items);
    }

    _addItem(data) {
        const item = { id: this._nextId++, date: new Date(), duration: 0, ...data };
        this.items.push(item);

        // On borne la mémoire : les clips vidéo pèsent lourd
        while (this.items.length > CONFIG.capture.historySize) {
            const dropped = this.items.shift();
            if (dropped.type === 'video') URL.revokeObjectURL(dropped.url);
        }
        return item;
    }

    // ==========================================================
    //  RENDU DES SURCOUCHES
    // ==========================================================

    _renderCountdown(ctx, width, height) {
        const remaining = Math.ceil(this.countdown);
        const progress = 1 - (this.countdown % 1); // 0 → 1 à chaque seconde

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.globalAlpha = 0.2 + 0.8 * (1 - progress);
        ctx.fillStyle = THEME.textStrong;
        ctx.font = `300 ${Math.round(height * 0.24)}px ${THEME.fontDisplay}`;
        ctx.fillText(String(remaining), width / 2, height / 2);

        ctx.globalAlpha = 0.75;
        ctx.font = `500 15px ${THEME.fontUi}`;
        ctx.letterSpacing = '0.3em';
        ctx.fillText('SOURIEZ', width / 2, height / 2 + height * 0.17);
        ctx.restore();
    }

    _renderRecordingBadge(ctx, width) {
        const elapsed = this.recorder.elapsed;
        const label = formatDuration(elapsed);
        const blink = Math.sin(elapsed * 6) > -0.4;

        ctx.save();
        ctx.font = `500 13px ${THEME.fontUi}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        const textWidth = ctx.measureText(label).width;
        const boxWidth = textWidth + 46;
        const x = width / 2 - boxWidth / 2;
        const y = 92;

        ctx.fillStyle = 'rgba(16, 18, 20, 0.78)';
        ctx.beginPath();
        ctx.roundRect(x, y, boxWidth, 30, 15);
        ctx.fill();

        if (blink) {
            ctx.fillStyle = THEME.danger;
            ctx.beginPath();
            ctx.arc(x + 18, y + 15, 5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = THEME.text;
        ctx.fillText(label, x + 32, y + 16);
        ctx.restore();
    }

    _createFlash() {
        const el = document.createElement('div');
        el.className = 'capture-flash';
        document.body.appendChild(el);
        return el;
    }

    _fireFlash(discreet = false) {
        this.flash.classList.remove('is-firing', 'is-discreet');
        void this.flash.offsetWidth; // reflow forcé, sinon l'animation ne rejoue pas
        this.flash.classList.add('is-firing');
        if (discreet) this.flash.classList.add('is-discreet');
    }
}

function formatDuration(seconds) {
    const total = Math.floor(seconds);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatStamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
