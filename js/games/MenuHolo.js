import { Game } from '../core/Game.js';
import { Registry, registerGame } from '../core/GameRegistry.js';
import { CONFIG } from '../core/Config.js';
import { THEME } from '../core/Theme.js';

/**
 * MENU PRINCIPAL
 *
 * Construit entièrement à partir du registre : icône, couleur, nombre de
 * joueurs et description viennent de la déclaration de chaque jeu.
 */
export class MenuHolo extends Game {
    constructor(engine) {
        super(engine);
        this.id = 'menu_holo';
        this.name = 'MENU PRINCIPAL';
        this.isMenu = true;
    }

    enter() {
        // Caméra en fond : on se voit jouer, c'est l'effet « borne d'arcade »
        this.setup({
            cameraMode: 'fullscreen',
            hands: true,
            pose: false,
            face: false,
            smoothing: CONFIG.input.menuSmoothing
        });

        this.game.display.setBackground(THEME.bg);

        const layer = this.game.display.gameLayer;
        layer.innerHTML = '';
        layer.appendChild(this._buildMenu());

        // Le moteur met en cache les éléments cliquables : on le prévient
        this.game.invalidateInteractives();
    }

    _buildMenu() {
        const container = document.createElement('div');
        container.className = 'menu';

        const header = document.createElement('header');
        header.className = 'menu__head';
        header.innerHTML = `
            <p class="menu__eyebrow">Borne gestuelle</p>
            <h1 class="menu__title">Jarvis <span>Arcade</span></h1>
        `;
        container.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'menu__grid';

        const games = Registry.getPlayable();
        if (games.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'menu__empty';
            empty.textContent = 'Aucun jeu déclaré — ajoutez son import dans js/games/index.js';
            grid.appendChild(empty);
        }

        for (const entry of games) grid.appendChild(this._createCard(entry));
        container.appendChild(grid);

        const hint = document.createElement('p');
        hint.className = 'menu__hint';
        hint.textContent = this.game.inputs.mode === 'vision'
            ? 'Pointez une carte et gardez la main immobile · C photo · R vidéo · G pellicule · V vue caméra'
            : 'Mode souris · clic pour valider · C photo · R vidéo · G pellicule · P joueur 2';
        container.appendChild(hint);

        return container;
    }

    _createCard(entry) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'card interactive';
        card.dataset.id = entry.id;
        card.style.setProperty('--card-accent', entry.color);

        card.innerHTML = `
            <span class="card__icon" aria-hidden="true"></span>
            <span class="card__body">
                <span class="card__name"></span>
                <span class="card__desc"></span>
            </span>
            <span class="card__players"></span>
        `;

        // textContent : un nom de jeu ne doit jamais pouvoir injecter du HTML
        card.querySelector('.card__icon').textContent = entry.icon;
        card.querySelector('.card__name').textContent = entry.name;
        card.querySelector('.card__desc').textContent = entry.description;
        card.querySelector('.card__players').textContent = entry.players > 1 ? `1–${entry.players} J` : '1 J';

        card.addEventListener('click', () => {
            if (this._launching) return;
            this._launching = true;

            this.game.audio.playSFX('select');
            card.classList.add('is-launching');
            this.after(140, () => this.game.loadGame(entry.id));
        });

        return card;
    }

    exit() {
        this.clearTimers();
        this.game.display.gameLayer.innerHTML = '';
        this.game.invalidateInteractives();
    }
}

registerGame({
    id: 'menu_holo',
    name: 'MENU PRINCIPAL',
    icon: '🏠',
    color: '#8fa6b8',
    isMenu: true,
    class: MenuHolo
});
