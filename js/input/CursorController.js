import { CONFIG } from '../core/Config.js';
import { playerColor } from '../core/Theme.js';

/**
 * CURSEUR VIRTUEL
 *
 * Sans souris, on valide en gardant la main immobile sur un bouton : un
 * anneau se remplit puis déclenche le clic. Un pincement pouce/index
 * raccourcit l'attente.
 *
 * Cette classe est volontairement séparée du moteur : elle ne connaît que
 * les joueurs et le DOM, et c'est la seule à parler de « survol ».
 */
export class CursorController {
    /**
     * @param {object} options
     * @param {() => Array} options.getPlayers - renvoie les joueurs courants
     * @param {(id: number) => boolean} [options.isNativePointer] - ce joueur
     *        pilote-t-il déjà un vrai pointeur (souris, tactile) ?
     * @param {(type: string) => void} [options.onSound] - retour sonore
     */
    constructor({ getPlayers, isNativePointer = () => false, onSound = () => {} }) {
        this.getPlayers = getPlayers;
        this.isNativePointer = isNativePointer;
        this.onSound = onSound;
        this.dwellTime = CONFIG.engine.dwellTime;

        this.cursors = new Map();

        // Le DOM cliquable ne bouge qu'aux changements de scène : inutile
        // de le requêter — et de mesurer ses positions — à chaque frame.
        this._elements = new Set();
        this._elementsDirty = true;
    }

    /** À appeler dès que des éléments cliquables apparaissent ou disparaissent. */
    invalidate() {
        this._elementsDirty = true;
    }

    update() {
        const now = performance.now();
        const players = this.getPlayers();

        for (let id = 0; id < 2; id++) {
            // Avec une vraie souris, le pointeur du système fait déjà le
            // travail : doubler d'un curseur virtuel qui valide au survol
            // déclencherait des clics involontaires dès qu'on s'arrête.
            if (this.isNativePointer(id)) {
                this.cursors.get(id)?.el.style.setProperty('display', 'none');
                continue;
            }

            const player = players[id];
            const cursor = this._getCursor(id);

            if (!player || !player.detected) {
                cursor.el.style.display = 'none';
                this._reset(cursor);
                continue;
            }

            cursor.el.style.display = 'block';
            cursor.el.style.transform = `translate3d(${player.x}px, ${player.y}px, 0)`;

            const hovered = this._hitTest(player);
            if (!hovered) {
                this._reset(cursor);
                continue;
            }

            if (cursor.hoveredElement !== hovered) {
                cursor.hoveredElement = hovered;
                cursor.hoverStart = now;
                cursor.triggered = false;
                cursor.el.classList.add('cursor-locked');
                hovered.classList.add('is-targeted');
                this.onSound('hover');
            }

            if (cursor.triggered) continue;

            const progress = Math.min(1, (now - cursor.hoverStart) / this.dwellTime);
            cursor.ring.style.strokeDashoffset = RING_LENGTH * (1 - progress);

            if (progress >= 1 || player.isClicking) this._click(cursor, hovered);
        }
    }

    /** Supprime les curseurs du DOM. */
    dispose() {
        for (const cursor of this.cursors.values()) cursor.el.remove();
        this.cursors.clear();
    }

    // ----------------------------------------------------------

    /**
     * On demande au navigateur ce qui se trouve vraiment sous le curseur,
     * puis on remonte jusqu'au premier élément cliquable.
     *
     * Comparer des rectangles ignorait l'empilement : le curseur pouvait
     * viser un bouton caché derrière une surcouche (la pellicule ouverte
     * par-dessus la modale de fin de partie, par exemple).
     */
    _hitTest(player) {
        const top = document.elementFromPoint(player.x, player.y);
        if (!top) return null;

        const interactive = this._getElements();
        for (let node = top; node && node !== document.body; node = node.parentElement) {
            if (interactive.has(node)) return node;
        }
        return null;
    }

    _getElements() {
        if (this._elementsDirty) {
            this._elements = new Set(document.querySelectorAll(INTERACTIVE_SELECTOR));
            this._elementsDirty = false;
        }
        return this._elements;
    }

    _getCursor(id) {
        const existing = this.cursors.get(id);
        if (existing) return existing;

        const el = document.createElement('div');
        el.className = 'virtual-cursor';
        el.id = `cursor-p${id}`;
        el.style.setProperty('--cursor-color', playerColor(id));
        el.innerHTML = `
            <div class="cursor-scaler">
                <svg class="progress-ring" width="60" height="60" viewBox="0 0 60 60">
                    <circle class="ring-bg" cx="30" cy="30" r="22"/>
                    <circle class="ring-progress" cx="30" cy="30" r="22"/>
                </svg>
                <div class="cursor-dot"></div>
            </div>
        `;
        document.body.appendChild(el);

        const cursor = {
            el,
            ring: el.querySelector('.ring-progress'),
            hoverStart: 0,
            hoveredElement: null,
            triggered: false
        };
        this.cursors.set(id, cursor);
        return cursor;
    }

    _reset(cursor) {
        cursor.hoveredElement?.classList.remove('is-targeted');
        cursor.hoveredElement = null;
        cursor.triggered = false;
        cursor.el.classList.remove('cursor-locked', 'cursor-clicked');
        cursor.ring.style.strokeDashoffset = RING_LENGTH;
    }

    _click(cursor, element) {
        cursor.triggered = true;
        cursor.el.classList.add('cursor-clicked');
        this.onSound('select');

        element.click();

        setTimeout(() => this._reset(cursor), 300);
    }
}

/** Circonférence de l'anneau de progression (r = 22). */
const RING_LENGTH = 138;

const INTERACTIVE_SELECTOR = '#ui-header button, #ui-header .switch-opt, .interactive';
