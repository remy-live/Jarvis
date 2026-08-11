import { Game } from '../core/Game.js';
import { Registry, registerGame } from '../core/GameRegistry.js';
import { CONFIG } from '../core/Config.js';
import { THEME } from '../core/Theme.js';

/**
 * MENU PRINCIPAL
 *
 * Entièrement construit à partir du registre : icône, couleur, description
 * et nombre de joueurs viennent de la déclaration de chaque jeu.
 *
 * Trois façons d'entrer dans un jeu : le pointer à la main (ou à la souris),
 * naviguer aux flèches et valider à Entrée, ou laisser le hasard choisir.
 */
const FILTERS = [
    { id: 'all', label: 'Tous', match: () => true },
    { id: 'solo', label: 'Seul', match: (game) => game.solo !== false },
    { id: 'duo', label: 'À deux', match: (game) => game.players > 1 }
];

export class MenuHolo extends Game {
    constructor(engine) {
        super(engine);
        this.id = 'menu_holo';
        this.name = 'MENU PRINCIPAL';
        this.isMenu = true;

        this.filter = 'all';
        this.focusIndex = 0;
        this._onKeyDown = (event) => this._handleKey(event);
    }

    enter() {
        // Caméra en fond : on se voit avant de jouer, c'est l'effet borne
        this.setup({
            cameraMode: 'fullscreen',
            hands: true,
            pose: false,
            face: false,
            smoothing: CONFIG.input.menuSmoothing
        });

        this.game.display.setBackground(THEME.bg);
        this.game.audio.setupGameAudio(null);

        this.root = this._build();
        this.game.display.gameLayer.replaceChildren(this.root);
        this._renderGrid();

        window.addEventListener('keydown', this._onKeyDown);
    }

    exit() {
        this.clearTimers();
        window.removeEventListener('keydown', this._onKeyDown);
        this.game.display.gameLayer.replaceChildren();
        this.game.invalidateInteractives();
    }

    // ==========================================================
    //  CONSTRUCTION
    // ==========================================================

    _build() {
        const root = document.createElement('div');
        root.className = 'menu';
        root.innerHTML = `
            <header class="menu__head">
                <p class="menu__eyebrow">Borne gestuelle</p>
                <h1 class="menu__title">Jarvis <span>Arcade</span></h1>
            </header>

            <nav class="menu__filters" aria-label="Filtrer les jeux"></nav>

            <div class="menu__grid" role="list"></div>

            <footer class="menu__foot">
                <button class="menu__random interactive" type="button">Au hasard</button>
                <p class="menu__hint"></p>
            </footer>
        `;

        const filters = root.querySelector('.menu__filters');
        for (const filter of FILTERS) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip interactive';
            chip.dataset.filter = filter.id;
            chip.textContent = filter.label;
            chip.addEventListener('click', () => this._setFilter(filter.id));
            filters.appendChild(chip);
        }

        root.querySelector('.menu__random').addEventListener('click', () => this._launchRandom());
        root.querySelector('.menu__hint').textContent = this.game.inputs.mode === 'vision'
            ? 'Pointez une carte et gardez la main immobile · C photo · R vidéo · G pellicule · V vue caméra'
            : 'Clic pour valider · flèches et Entrée · C photo · R vidéo · G pellicule · P joueur 2';

        return root;
    }

    _setFilter(id) {
        if (this.filter === id) return;
        this.filter = id;
        this.focusIndex = 0;
        this._renderGrid();
        this.game.playSound('hover');
    }

    _visibleGames() {
        const filter = FILTERS.find((f) => f.id === this.filter) || FILTERS[0];
        return Registry.getPlayable().filter(filter.match);
    }

    _renderGrid() {
        const grid = this.root.querySelector('.menu__grid');
        const games = this._visibleGames();

        this.root.querySelectorAll('.chip').forEach((chip) => {
            chip.classList.toggle('is-active', chip.dataset.filter === this.filter);
        });

        grid.replaceChildren();

        if (games.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'menu__empty';
            empty.textContent = 'Aucun jeu dans cette catégorie.';
            grid.appendChild(empty);
        } else {
            games.forEach((entry, index) => grid.appendChild(this._createCard(entry, index)));
        }

        this.cards = Array.from(grid.querySelectorAll('.card'));
        this._applyFocus();

        // Le curseur virtuel garde en cache la liste des cibles cliquables
        this.game.invalidateInteractives();
    }

    _createCard(entry, index) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'card interactive';
        card.dataset.id = entry.id;
        card.setAttribute('role', 'listitem');
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
        card.querySelector('.card__players').textContent = entry.players > 1 ? '1–2' : '1';

        card.addEventListener('click', () => this._launch(entry, card));
        card.addEventListener('mouseenter', () => {
            this.focusIndex = index;
            this._applyFocus();
        });

        return card;
    }

    // ==========================================================
    //  NAVIGATION
    // ==========================================================

    _handleKey(event) {
        const games = this._visibleGames();
        if (games.length === 0) return;

        const columns = this._columnCount();
        let handled = true;

        switch (event.key) {
            case 'ArrowRight': this.focusIndex = (this.focusIndex + 1) % games.length; break;
            case 'ArrowLeft': this.focusIndex = (this.focusIndex - 1 + games.length) % games.length; break;
            case 'ArrowDown': this.focusIndex = Math.min(games.length - 1, this.focusIndex + columns); break;
            case 'ArrowUp': this.focusIndex = Math.max(0, this.focusIndex - columns); break;
            case 'Tab':
                this._setFilter(FILTERS[(FILTERS.findIndex((f) => f.id === this.filter) + 1) % FILTERS.length].id);
                break;
            case 'Enter':
                this._launch(games[this.focusIndex], this.cards[this.focusIndex]);
                break;
            default: handled = false;
        }

        if (!handled) return;
        event.preventDefault();
        this._applyFocus();
    }

    /** Nombre de colonnes réellement affichées (la grille est fluide). */
    _columnCount() {
        if (!this.cards?.length) return 1;
        const firstTop = this.cards[0].offsetTop;
        const sameRow = this.cards.filter((card) => card.offsetTop === firstTop);
        return Math.max(1, sameRow.length);
    }

    _applyFocus() {
        if (!this.cards?.length) return;
        this.focusIndex = Math.max(0, Math.min(this.cards.length - 1, this.focusIndex));
        this.cards.forEach((card, i) => card.classList.toggle('is-focused', i === this.focusIndex));
    }

    _launchRandom() {
        const games = this._visibleGames();
        if (games.length === 0) return;
        const index = Math.floor(Math.random() * games.length);
        this._launch(games[index], this.cards[index]);
    }

    _launch(entry, card) {
        if (!entry || this._launching) return;
        this._launching = true;

        this.game.playSound('select');
        card?.classList.add('is-launching');
        this.after(140, () => this.game.loadGame(entry.id));
    }
}

registerGame({
    id: 'menu_holo',
    name: 'MENU PRINCIPAL',
    icon: '🏠',
    color: '#8fa6b8',
    // Le menu suit deux personnes : c'est là qu'un second joueur rejoint
    players: 2,
    isMenu: true,
    class: MenuHolo
});
