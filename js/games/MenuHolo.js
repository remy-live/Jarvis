import { Game } from '../core/Game.js';
import { Registry } from '../core/GameRegistry.js';
import { CONFIG } from '../core/Config.js';

/** Icône par défaut selon l'identifiant du jeu. */
const ICONS = [
    [/nuts|squirrel/, '🐿️'],
    [/flappy/, '🦅'],
    [/brick/, '🧱'],
    [/invaders/, '👾'],
    [/fruit/, '🍉'],
    [/blade|shuriken/, '🥷'],
    [/pong/, '🏓']
];

export class MenuHolo extends Game {
    constructor(engine) {
        super(engine);
        this.id = 'menu_holo';
        this.name = 'MENU PRINCIPAL';
        this.isMenu = true;
    }

    enter() {
        // Caméra en fond : on se voit jouer, c'est l'effet "borne d'arcade"
        this.setup({
            cameraMode: 'fullscreen',
            hands: true,
            pose: false,
            face: false,
            smoothing: CONFIG.input.menuSmoothing
        });

        const layer = this.game.display.gameLayer;
        layer.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'holo-container';

        const title = document.createElement('div');
        title.className = 'holo-title';
        title.innerHTML = "JARVIS <span style='color:#00ffff'>ARCADE</span>";
        container.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'holo-grid';

        const games = Registry.getAll().filter((g) => !g.isMenu);
        if (games.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'holo-empty';
            empty.textContent = "Aucun jeu enregistré — vérifiez les imports dans js/main.js";
            grid.appendChild(empty);
        }

        for (const g of games) {
            grid.appendChild(this._createCard(g));
        }

        container.appendChild(grid);

        const hint = document.createElement('div');
        hint.className = 'holo-hint';
        hint.textContent = this.game.inputs.mode === 'vision'
            ? 'Pointez une carte et maintenez pour valider · V = vue caméra · G = 2e joueur fantôme'
            : 'Mode souris : cliquez une carte · P = joueur 2 · Espace = bras levés · E = bouche';
        container.appendChild(hint);

        layer.appendChild(container);

        // Le moteur met en cache les éléments cliquables : on le prévient
        this.game.invalidateInteractives();
    }

    _createCard(g) {
        const card = document.createElement('div');
        card.className = 'holo-card interactive';
        card.dataset.id = g.id;
        if (g.color) card.style.setProperty('--card-color', g.color);

        const icon = ICONS.find(([pattern]) => pattern.test(g.id))?.[1] || '🎮';

        card.innerHTML = `
            <div class="holo-icon">${icon}</div>
            <div class="holo-name"></div>
            <div class="holo-scanline"></div>
        `;
        // textContent : un nom de jeu ne doit pas pouvoir injecter de HTML
        card.querySelector('.holo-name').textContent = g.name;

        card.addEventListener('click', () => {
            if (this._launching) return;
            this._launching = true;

            this.game.audio.playSFX('select');
            card.classList.add('holo-card--launching');
            this.after(100, () => this.game.loadGame(g.id));
        });

        return card;
    }

    exit() {
        this.clearTimers();
        this.game.display.gameLayer.innerHTML = '';
        this.game.invalidateInteractives();
    }
}

Registry.register('menu_holo', 'MENU PRINCIPAL', MenuHolo, '#00ffff', { isMenu: true });
