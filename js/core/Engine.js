import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { Registry } from './GameRegistry.js';
import { AudioManager } from './AudioManager.js';
import { Stats } from './Stats.js';
import { CursorController } from '../input/CursorController.js';
import { CaptureStudio } from '../capture/CaptureStudio.js';
import { Header } from '../ui/Header.js';

/**
 * MOTEUR
 *
 * Orchestrateur : il tient la boucle, charge les scènes et fait dialoguer
 * les sous-systèmes (entrées, affichage, capture, audio, interface).
 * Toute logique spécialisée vit dans son propre module.
 */
export class Engine {
    /**
     * @param {import('./Display.js').Display} display
     * @param {import('../input/InputSystem.js').InputSystem} inputs
     */
    constructor(display, inputs) {
        this.display = display;
        this.inputs = inputs;
        this.registry = Registry;

        this.isRunning = false;
        this.currentState = null;
        this.config = { playerCount: 1 };

        this.clock = new THREE.Clock();
        this.audio = new AudioManager();
        this.stats = new Stats(this);

        this.cursor = new CursorController({
            getPlayers: () => this.inputs.players,
            // Le joueur 1 en mode souris a déjà un pointeur système ; le
            // joueur 2 (au clavier), lui, a bien besoin du curseur virtuel.
            isNativePointer: (id) => id === 0 && this.inputs.mode !== 'vision',
            onSound: (type) => this.playSound(type)
        });

        this.header = new Header(this);
        this.capture = new CaptureStudio(this);

        this._onKeyDown = (event) => this._handleKey(event);
        window.addEventListener('keydown', this._onKeyDown);

        // Retour d'onglet : on absorbe le delta accumulé au lieu de dériver
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.clock.getDelta();
        });
    }

    /** Raccourcis clavier globaux. */
    _handleKey(event) {
        if (event.repeat) return;

        switch (event.key.toLowerCase()) {
            case 'm':
            case 'escape':
                if (!this.currentState?.isMenu) this.loadGame(MENU_ID);
                break;
            case 'c': this.capture.photo(); break;
            case 'r': this.capture.toggleRecording(); break;
            case 'g': this.capture.openGallery(); break;
            case 'f': this.stats.toggle(); break;
            default: break;
        }
    }

    /** Le DOM cliquable a changé : le curseur doit remesurer. */
    invalidateInteractives() {
        this.cursor.invalidate();
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

    /**
     * Charge un jeu par son identifiant ou par sa classe.
     * En cas d'échec, on retombe toujours sur le menu plutôt que sur un
     * écran noir.
     */
    loadGame(identifier) {
        this._exitCurrentState();
        this.display.reset();

        const GameClass = this._resolveGameClass(identifier);
        if (!GameClass) {
            console.error('⚠️ Jeu introuvable :', identifier);
            if (identifier !== MENU_ID) this.loadGame(MENU_ID);
            return;
        }

        try {
            const state = new GameClass(this);
            this.currentState = state;

            this.header.setMode(state.isMenu === true);
            state.enter?.();
            this.invalidateInteractives();

            console.log(`✅ ENGINE: jeu démarré → ${GameClass.name}`);
        } catch (error) {
            console.error('❌ CRASH ENGINE:', error);
            this.currentState = null;
            if (identifier !== MENU_ID) this.loadGame(MENU_ID);
        }
    }

    _exitCurrentState() {
        if (!this.currentState) return;
        try {
            this.currentState.exit?.();
        } catch (error) {
            console.error('❌ Erreur pendant la sortie du jeu :', error);
        }
        this.currentState = null;
    }

    _resolveGameClass(identifier) {
        const candidate = typeof identifier === 'string' ? this.registry.get(identifier) : identifier;
        if (!candidate) return null;
        return candidate.class || candidate;
    }

    // ==========================================================
    //  SON
    // ==========================================================

    /** Bips d'interface générés à la volée : aucun fichier son requis. */
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
            const preset = type === 'select' ? BEEPS.select : BEEPS.hover;

            osc.type = preset.wave;
            osc.frequency.setValueAtTime(preset.frequency, now);
            gain.gain.setValueAtTime(preset.gain, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
            osc.start(now);
            osc.stop(now + preset.duration);
        } catch (error) {
            console.warn("🔇 Bip d'interface impossible :", error);
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

        // Onglet caché : ni rendu, ni inférence, ni batterie consommée
        if (document.hidden) return;

        const dt = Math.min(this.clock.getDelta(), CONFIG.engine.maxDelta);

        try {
            this.inputs.update(timestamp, this.display);
            this.cursor.update();
            this.capture.update(dt);

            this.display.beginFrame();
            this.currentState?.update?.(dt);
            this.currentState?.render?.(this.display);

            // La capture lit les canvas ici : après le rendu du jeu, avant
            // les surcouches de debug et avant que le navigateur ne vide le
            // buffer WebGL.
            this.capture.composeFrame();

            this.capture.renderOverlay(this.display.ctx, this.display.virtW, this.display.virtH);
            this.stats.render(this.display.ctx, dt);
            this.display.done();
        } catch (error) {
            // Un jeu qui plante ne doit pas figer toute la borne
            console.error('❌ Erreur dans la boucle de jeu :', error);
            this.loadGame(MENU_ID);
        }
    }
}

const MENU_ID = 'menu_holo';

const BEEPS = {
    hover: { wave: 'sine', frequency: 420, gain: 0.025, duration: 0.09 },
    select: { wave: 'triangle', frequency: 660, gain: 0.07, duration: 0.14 }
};
