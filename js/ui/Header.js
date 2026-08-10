/**
 * BANDEAU SUPÉRIEUR
 *
 * Barre transparente : seuls les boutons captent les clics, le reste laisse
 * passer vers le jeu. Les styles vivent dans style.css.
 */
export class Header {
    /** @param {import('../core/Engine.js').Engine} engine */
    constructor(engine) {
        this.engine = engine;
        this.playerCount = 1;
        this.isMuted = false;

        this.dom = document.createElement('div');
        this.dom.id = 'ui-header';
        this.dom.className = 'header-overlay';
        this.dom.innerHTML = `
            <div class="header-group left">
                <button id="btn-quit" class="btn-pill" type="button" hidden>← Menu</button>
                <div id="header-notice" class="header-notice" hidden></div>
            </div>

            <div class="header-group center">
                <div id="player-switch" class="player-switch">
                    <button class="switch-opt is-active" data-val="1" type="button">1 joueur</button>
                    <button class="switch-opt" data-val="2" type="button">2 joueurs</button>
                </div>
            </div>

            <div class="header-group right">
                <button id="btn-record" class="btn-icon" type="button" aria-label="Enregistrer une vidéo" title="Vidéo (R)">
                    <span class="rec-dot"></span>
                </button>
                <button id="btn-photo" class="btn-icon" type="button" aria-label="Prendre une photo" title="Photo (C)">${ICONS.camera}</button>
                <button id="btn-gallery" class="btn-icon" type="button" aria-label="Ouvrir la pellicule" title="Pellicule (G)">${ICONS.gallery}</button>
                <button id="btn-sound" class="btn-icon" type="button" aria-label="Couper le son" title="Son">${ICONS.soundOn}</button>
            </div>
        `;
        document.body.appendChild(this.dom);

        this._bindEvents();
    }

    _bindEvents() {
        const on = (selector, handler) => this.dom.querySelector(selector).addEventListener('click', handler);

        on('#btn-quit', () => this.engine.loadGame('menu_holo'));
        on('#btn-photo', () => this.engine.capture.photo());
        on('#btn-record', () => this.engine.capture.toggleRecording());
        on('#btn-gallery', () => this.engine.capture.openGallery());
        on('#btn-sound', () => this.toggleSound());

        this.dom.querySelectorAll('.switch-opt').forEach((opt) => {
            opt.addEventListener('click', () => this.setPlayerCount(Number(opt.dataset.val)));
        });
    }

    toggleSound() {
        this.isMuted = !this.isMuted;
        const btn = this.dom.querySelector('#btn-sound');
        btn.innerHTML = this.isMuted ? ICONS.soundOff : ICONS.soundOn;
        btn.setAttribute('aria-label', this.isMuted ? 'Activer le son' : 'Couper le son');
        this.engine.toggleAudio(this.isMuted);
    }

    /** Menu : sélecteur de joueurs. En jeu : bouton retour. */
    setMode(isMenu) {
        this.dom.querySelector('#player-switch').hidden = !isMenu;
        this.dom.querySelector('#btn-quit').hidden = isMenu;
        this.engine.invalidateInteractives();
    }

    setPlayerCount(count) {
        this.playerCount = count;
        this.dom.querySelectorAll('.switch-opt').forEach((opt) => {
            opt.classList.toggle('is-active', Number(opt.dataset.val) === count);
        });
        this.engine.config = { ...this.engine.config, playerCount: count };
    }

    /** Point rouge clignotant sur le bouton vidéo. */
    setRecording(isRecording) {
        this.dom.querySelector('#btn-record').classList.toggle('is-recording', isRecording);
    }

    /** Badge d'information (ex : « mode souris »). */
    setNotice(text) {
        const notice = this.dom.querySelector('#header-notice');
        notice.textContent = text || '';
        notice.hidden = !text;
        this.engine.invalidateInteractives();
    }
}

/** Icônes SVG : nettes à toutes les tailles, et pas d'emoji multicolore. */
const ICONS = {
    camera: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.5"/></svg>`,
    gallery: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m7 15 3-3.5 2.5 3L15 11l3 4"/></svg>`,
    soundOn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5h3L12 6v12l-4-3.5H5z"/><path d="M16 9.5a4 4 0 0 1 0 5"/><path d="M18.5 7a7.5 7.5 0 0 1 0 10"/></svg>`,
    soundOff: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5h3L12 6v12l-4-3.5H5z"/><path d="m16.5 10 4 4m0-4-4 4"/></svg>`
};
