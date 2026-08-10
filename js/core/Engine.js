import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { AudioManager } from './AudioManager.js';
import { Header } from './Header.js';
import { Registry } from './GameRegistry.js';
import { PhotoBooth } from './PhotoBooth.js';
import { Stats } from './Stats.js';
import { playerColor } from './Theme.js';

/**
 * MOTEUR
 *
 * Orchestre la boucle de jeu, le chargement des scènes et le curseur
 * virtuel (validation par survol, faute de clic).
 */
export class Engine {
    constructor(display, inputSystem) {
        this.display = display;
        this.inputs = inputSystem;
        this.registry = Registry;
        this.header = new Header(this);

        this.isRunning = false;
        this.currentState = null;
        this.config = { playerCount: 1 };

        this.audio = new AudioManager();
        this.clock = new THREE.Clock();
        this.photoBooth = new PhotoBooth(this);
        this.stats = new Stats(this);

        this.dwellTime = CONFIG.engine.dwellTime;
        this.cursors = {};

        // Le DOM interactif ne change qu'au chargement d'une scène :
        // inutile de le requêter 120 fois par seconde.
        this._interactives = [];
        this._interactivesDirty = true;
        this._rects = [];
        this._rectsTime = 0;

        this._onKeyDown = (e) => this._handleKey(e);
        window.addEventListener('keydown', this._onKeyDown);

        // Onglet en arrière-plan : on gèle proprement au lieu de dériver
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.clock.getDelta(); // absorbe le delta accumulé
        });
    }

    _handleKey(e) {
        if (e.repeat) return;
        const key = e.key.toLowerCase();

        if (key === 'm' || key === 'escape') {
            if (this.currentState && this.currentState.isMenu) return;
            this.loadGame('menu_holo');
        }
        if (key === 'c') this.photoBooth.start();
        if (key === 'f') this.stats.toggle();
    }

    // ==========================================================
    //  CURSEUR VIRTUEL
    // ==========================================================

    getOrCreateCursor(id) {
        if (this.cursors[id]) return this.cursors[id];

        const cursorDiv = document.createElement('div');
        cursorDiv.className = 'virtual-cursor';
        cursorDiv.id = `cursor-p${id}`;
        cursorDiv.style.setProperty('--cursor-color', playerColor(id));
        cursorDiv.innerHTML = `
            <div class="cursor-scaler">
                <svg class="progress-ring" width="60" height="60" viewBox="0 0 60 60">
                   <circle class="ring-bg" cx="30" cy="30" r="22"/>
                   <circle class="ring-progress" cx="30" cy="30" r="22"/>
                </svg>
                <div class="cursor-dot"></div>
            </div>
        `;
        document.body.appendChild(cursorDiv);

        this.cursors[id] = {
            el: cursorDiv,
            ring: cursorDiv.querySelector('.ring-progress'),
            hoverStartTime: 0,
            hoveredElement: null,
            hasTriggered: false
        };

        return this.cursors[id];
    }

    /** À appeler quand des éléments cliquables sont ajoutés ou retirés. */
    invalidateInteractives() {
        this._interactivesDirty = true;
    }

    _getInteractives() {
        if (this._interactivesDirty) {
            this._interactives = Array.from(
                document.querySelectorAll('#ui-header button, #ui-header .switch-opt, .interactive')
            );
            this._interactivesDirty = false;
            this._rectsTime = 0;
        }
        return this._interactives;
    }

    /**
     * getBoundingClientRect() force un recalcul de mise en page : le faire
     * pour chaque bouton, deux joueurs, 60 fois par seconde coûtait cher.
     * On rafraîchit les positions 4 fois par seconde, c'est largement assez.
     */
    _getInteractiveRects(now) {
        if (now - this._rectsTime > 250) {
            this._rectsTime = now;
            this._rects = this._getInteractives()
                .filter((el) => el.isConnected && el.offsetParent !== null)
                .map((el) => ({ el, rect: el.getBoundingClientRect() }));
        }
        return this._rects;
    }

    updateVirtualCursor() {
        const now = performance.now();

        for (const playerId of [0, 1]) {
            const player = this.inputs.players[playerId];
            const cursor = this.getOrCreateCursor(playerId);

            if (!player || !player.detected) {
                cursor.el.style.display = 'none';
                this.resetDwell(cursor);
                continue;
            }

            cursor.el.style.display = 'block';
            cursor.el.style.transform = `translate3d(${player.x}px, ${player.y}px, 0)`;

            let hovered = null;
            for (const { el, rect } of this._getInteractiveRects(now)) {
                if (player.x >= rect.left && player.x <= rect.right &&
                    player.y >= rect.top && player.y <= rect.bottom) {
                    hovered = el;
                }
            }

            if (!hovered) {
                this.resetDwell(cursor);
                continue;
            }

            if (cursor.hoveredElement !== hovered) {
                cursor.hoveredElement = hovered;
                cursor.hoverStartTime = now;
                cursor.hasTriggered = false;
                cursor.el.classList.add('cursor-locked');
                this.playSound('hover');
            }

            if (cursor.hasTriggered) continue;

            // Le pincement (pouce + index) valide immédiatement,
            // sinon on attend la fin du cercle de progression.
            const progress = Math.min(1, (now - cursor.hoverStartTime) / this.dwellTime);
            if (cursor.ring) cursor.ring.style.strokeDashoffset = 138 - progress * 138;

            if (progress >= 1 || player.isClicking) {
                this.triggerClick(cursor, hovered);
            }
        }
    }

    resetDwell(cursor) {
        cursor.hoveredElement = null;
        cursor.hasTriggered = false;
        cursor.el.classList.remove('cursor-locked', 'cursor-clicked');
        if (cursor.ring) cursor.ring.style.strokeDashoffset = 138;
    }

    triggerClick(cursor, element) {
        cursor.hasTriggered = true;
        cursor.el.classList.add('cursor-clicked');
        this.playSound('select');

        element.click();

        setTimeout(() => {
            cursor.el.classList.remove('cursor-clicked');
            this.resetDwell(cursor);
        }, 300);
    }

    // ==========================================================
    //  CYCLE DE VIE DES JEUX
    // ==========================================================

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.clock.getDelta();
        requestAnimationFrame((t) => this.loop(t));
    }

    stop() {
        this.isRunning = false;
    }

    loadGame(gameIdentifier) {
        if (this.currentState?.exit) {
            try {
                this.currentState.exit();
            } catch (error) {
                console.error('❌ Erreur pendant la sortie du jeu :', error);
            }
        }
        this.currentState = null;
        this.display.reset();

        const GameClass = this._resolveGameClass(gameIdentifier);
        if (!GameClass) {
            console.error('⚠️ Jeu introuvable :', gameIdentifier);
            if (gameIdentifier !== 'menu_holo') this.loadGame('menu_holo');
            return;
        }

        try {
            const state = new GameClass(this);
            this.currentState = state;

            if (this.header) this.header.setMode(state.isMenu === true);
            if (state.enter) state.enter();

            this.invalidateInteractives();
            console.log(`✅ ENGINE: jeu démarré → ${GameClass.name}`);
        } catch (error) {
            console.error('❌ CRASH ENGINE:', error);
            this.currentState = null;
            if (gameIdentifier !== 'menu_holo') this.loadGame('menu_holo');
        }
    }

    _resolveGameClass(identifier) {
        const candidate = typeof identifier === 'string'
            ? this.registry.get(identifier)
            : identifier;

        if (!candidate) return null;
        return candidate.class ? candidate.class : candidate;
    }

    // ==========================================================
    //  SON
    // ==========================================================

    /** Petits bips d'interface générés à la volée (aucun fichier requis). */
    playSound(type) {
        if (this.header?.isMuted) return;

        try {
            if (!this.audioCtx) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                this.audioCtx = new Ctx();
            }
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            const now = this.audioCtx.currentTime;
            if (type === 'select') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, now);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
            } else {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, now);
                gain.gain.setValueAtTime(0.03, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            }
        } catch (error) {
            console.warn('🔇 Bip d\'interface impossible :', error);
        }
    }

    toggleAudio(isMuted) {
        this.audio.setMuted(isMuted);
    }

    // ==========================================================
    //  BOUCLE PRINCIPALE
    // ==========================================================

    loop(timestamp) {
        if (!this.isRunning) return;
        requestAnimationFrame((t) => this.loop(t));

        // Onglet caché : on saute le rendu (et on économise la batterie)
        if (document.hidden) return;

        const dt = Math.min(this.clock.getDelta(), CONFIG.engine.maxDelta);

        try {
            this.inputs.update(timestamp, this.display);
            this.updateVirtualCursor();
            this.photoBooth.update(dt);
            this.display.beginFrame();

            if (this.currentState) {
                if (this.currentState.update) this.currentState.update(dt);
                if (this.currentState.render) this.currentState.render(this.display);
            }

            // La capture lit les canvas AVANT que le navigateur ne présente
            // (et vide) le buffer WebGL — et avant les surcouches de debug,
            // pour que la photo ne montre que le jeu.
            this.photoBooth.flushPending();

            this.photoBooth.render(this.display.ctx, this.display.virtW, this.display.virtH);
            this.stats.render(this.display.ctx, dt);
            this.display.done();
        } catch (error) {
            // Un jeu qui plante ne doit pas figer toute la borne
            console.error('❌ Erreur dans la boucle de jeu :', error);
            this.loadGame('menu_holo');
        }
    }
}
