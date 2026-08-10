import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { AudioManager } from './AudioManager.js';
import { Header } from './Header.js';
import { Registry } from './GameRegistry.js';

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

        this.dwellTime = CONFIG.engine.dwellTime;
        this.cursors = {};

        // Le DOM interactif ne change qu'au chargement d'une scène :
        // inutile de le requêter 120 fois par seconde.
        this._interactives = [];
        this._interactivesDirty = true;

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
    }

    // ==========================================================
    //  CURSEUR VIRTUEL
    // ==========================================================

    getOrCreateCursor(id) {
        if (this.cursors[id]) return this.cursors[id];

        const cursorDiv = document.createElement('div');
        cursorDiv.className = 'virtual-cursor';
        cursorDiv.id = `cursor-p${id}`;
        cursorDiv.style.setProperty('--cursor-color', id === 0 ? '#00ffff' : '#ff00ff');
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
        }
        return this._interactives;
    }

    updateVirtualCursor() {
        const now = performance.now();
        const interactives = this._getInteractives();

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
            for (const el of interactives) {
                if (!el.isConnected || el.offsetParent === null) continue;
                const rect = el.getBoundingClientRect();
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
            this.display.beginFrame();

            if (this.currentState) {
                if (this.currentState.update) this.currentState.update(dt);
                if (this.currentState.render) this.currentState.render(this.display);
            }
            this.display.done();
        } catch (error) {
            // Un jeu qui plante ne doit pas figer toute la borne
            console.error('❌ Erreur dans la boucle de jeu :', error);
            this.loadGame('menu_holo');
        }
    }
}
