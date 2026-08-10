/**
 * BANDEAU SUPÉRIEUR
 *
 * Barre transparente qui ne capte les clics que sur ses boutons.
 * Les styles vivent dans style.css (section "HEADER GLOBAL").
 */
export class Header {
    /** @param {import('./Engine.js').Engine} engine */
    constructor(engine) {
        this.engine = engine;
        this.playerCount = 1;
        this.isMuted = false;

        this.dom = document.createElement('div');
        this.dom.id = 'ui-header';
        this.dom.className = 'header-overlay';
        this.dom.innerHTML = `
            <div class="header-group left">
                <button id="btn-quit" class="btn-retro red" type="button" hidden>⬅ MENU</button>
            </div>

            <div class="header-group center">
                <div id="player-switch" class="player-switch">
                    <div class="switch-opt active" data-val="1" role="button" tabindex="0">1 JOUEUR</div>
                    <div class="switch-opt" data-val="2" role="button" tabindex="0">2 JOUEURS</div>
                </div>
            </div>

            <div class="header-group right">
                <button id="btn-sound" class="btn-round" type="button" aria-label="Couper le son">🔊</button>
            </div>
        `;
        document.body.appendChild(this.dom);

        this.bindEvents();
    }

    bindEvents() {
        this.dom.querySelector('#btn-sound').addEventListener('click', () => this.toggleSound());
        this.dom.querySelector('#btn-quit').addEventListener('click', () => this.engine.loadGame('menu_holo'));

        this.dom.querySelectorAll('.switch-opt').forEach((opt) => {
            opt.addEventListener('click', () => this.setPlayerCount(parseInt(opt.dataset.val, 10)));
        });
    }

    toggleSound() {
        this.isMuted = !this.isMuted;
        const btn = this.dom.querySelector('#btn-sound');
        btn.textContent = this.isMuted ? '🔇' : '🔊';
        btn.setAttribute('aria-label', this.isMuted ? 'Activer le son' : 'Couper le son');
        this.engine.toggleAudio(this.isMuted);
    }

    /** Menu : sélecteur de joueurs. Jeu : bouton retour. */
    setMode(isMenu) {
        this.dom.querySelector('#player-switch').hidden = !isMenu;
        this.dom.querySelector('#btn-quit').hidden = isMenu;
        this.engine.invalidateInteractives();
    }

    setPlayerCount(count) {
        this.playerCount = count;
        this.dom.querySelectorAll('.switch-opt').forEach((opt) => {
            opt.classList.toggle('active', parseInt(opt.dataset.val, 10) === count);
        });
        this.engine.config = { ...this.engine.config, playerCount: count };
    }

    /** Petit badge d'info (ex : "mode souris"). */
    setNotice(text) {
        let notice = this.dom.querySelector('#header-notice');
        if (!text) {
            notice?.remove();
            return;
        }
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'header-notice';
            notice.className = 'header-notice';
            this.dom.querySelector('.header-group.left').appendChild(notice);
        }
        notice.textContent = text;
    }
}
