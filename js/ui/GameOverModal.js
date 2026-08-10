import { CONFIG } from '../core/Config.js';
import { THEME } from '../core/Theme.js';

/**
 * MODALE DE FIN DE PARTIE
 *
 * Un seul élément DOM est créé pour toute l'application : chaque jeu
 * instancie sa modale, mais tous réutilisent la même boîte (sinon on
 * empilait un `<div>` orphelin de plus à chaque lancement de partie).
 */
export class GameOverModal {
    /** @param {import('./Engine.js').Engine} engine */
    constructor(engine) {
        this.engine = engine;
        // Alias historique
        this.game = engine;

        this.isVisible = false;
        this.savedGameConfig = null;
        this.onRetryCallback = null;

        this.dom = document.getElementById('gameover-modal') || this._createDom();
        this._bind();
    }

    _createDom() {
        const dom = document.createElement('div');
        dom.id = 'gameover-modal';
        dom.className = 'modal-overlay';
        dom.style.display = 'none';
        dom.innerHTML = `
            <div class="modal-box">
                <h1 class="modal-title">GAME OVER</h1>
                <div class="modal-score" id="modal-score-text">SCORE: 0</div>
                <div class="modal-actions">
                    <button id="btn-retry" class="btn-modal interactive" type="button">REJOUER ↻</button>
                    <button id="btn-menu" class="btn-modal interactive" type="button">MENU 🏠</button>
                </div>
            </div>
        `;
        document.body.appendChild(dom);
        return dom;
    }

    /**
     * Les boutons étant partagés, on remplace les écouteurs du jeu
     * précédent en clonant les noeuds (plus simple et sans fuite).
     */
    _bind() {
        const retry = this._replaceNode('#btn-retry');
        const menu = this._replaceNode('#btn-menu');
        retry.addEventListener('click', () => this.retry());
        menu.addEventListener('click', () => this.quit());
    }

    _replaceNode(selector) {
        const old = this.dom.querySelector(selector);
        const fresh = old.cloneNode(true);
        old.replaceWith(fresh);
        return fresh;
    }

    /**
     * @param {string|number|{p1:number,p2:number}} scoreInfo
     * @param {object} gameConfig - config d'entrées à restaurer si on rejoue
     * @param {Function} onRetry
     */
    show(scoreInfo, gameConfig, onRetry) {
        if (this.isVisible) return;
        this.isVisible = true;
        this.savedGameConfig = gameConfig;
        this.onRetryCallback = onRetry;

        const scoreDiv = this.dom.querySelector('#modal-score-text');
        if (scoreInfo && typeof scoreInfo === 'object') {
            scoreDiv.innerHTML = `<span style="color:${THEME.player1}">P1 ${scoreInfo.p1}</span>`
                + `<span style="color:${THEME.textMuted}"> · </span>`
                + `<span style="color:${THEME.player2}">P2 ${scoreInfo.p2}</span>`;
        } else {
            scoreDiv.textContent = typeof scoreInfo === 'number' ? `SCORE: ${scoreInfo}` : String(scoreInfo);
        }

        this.dom.style.display = 'flex';
        requestAnimationFrame(() => this.dom.classList.add('visible'));

        // Pendant la modale : mains seules (on pilote un curseur, on ne joue plus)
        this.engine.inputs.setActiveTrackers({ hands: true, pose: false, face: false });
        this.engine.inputs.setSmoothing(CONFIG.input.menuSmoothing);
        this.engine.invalidateInteractives();
    }

    hide() {
        if (!this.isVisible) return;
        this.isVisible = false;
        this.dom.classList.remove('visible');
        setTimeout(() => {
            if (!this.isVisible) this.dom.style.display = 'none';
        }, 300);
        this.engine.invalidateInteractives();
    }

    retry() {
        this.hide();

        if (this.savedGameConfig) this.engine.inputs.setActiveTrackers(this.savedGameConfig);
        this.engine.inputs.setSmoothing(CONFIG.input.smoothing);

        if (this.onRetryCallback) this.onRetryCallback();
    }

    quit() {
        this.hide();
        this.engine.loadGame('menu_holo');
    }
}
