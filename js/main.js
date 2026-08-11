import { CONFIG } from './core/Config.js';
import { Display } from './core/Display.js';
import { InputSystem } from './input/InputSystem.js';
import { Engine } from './core/Engine.js';

// Catalogue des jeux : pour en ajouter un, tout se passe dans ce fichier.
import { MenuHolo } from './games/index.js';

class JarvisArcade {
    constructor() {
        this.statusElement = document.getElementById('status-text');
        this.loadingBar = document.getElementById('loading-bar');
        this.bootScreen = document.getElementById('boot-screen');
        this.errorBox = document.getElementById('boot-error');
        this.errorText = document.getElementById('boot-error-text');
        this.continueBtn = document.getElementById('boot-continue');
    }

    async init() {
        try {
            this.updateStatus('INITIALISATION DE L\'AFFICHAGE...', 10);
            this.display = new Display();

            this.updateStatus('DÉMARRAGE DU NEURAL ENGINE...', 25);
            this.inputs = new InputSystem();

            const mode = await this.inputs.initialize((msg, progress) => this.updateStatus(msg, progress));

            this.updateStatus('LANCEMENT DU MOTEUR...', 90);
            this.engine = new Engine(this.display, this.inputs);
            this.engine.loadGame(MenuHolo);

            if (mode === 'vision') {
                this.inputs.setSmoothing(CONFIG.input.menuSmoothing);
                this.updateStatus('SYSTÈME PRÊT', 100);
                this.finishBoot();
            } else {
                // Sans caméra on reste sur l'écran de boot le temps
                // d'expliquer la situation et les commandes de secours.
                this.showFallbackNotice(this.inputs.fallbackReason);
            }
        } catch (error) {
            console.error('CRITICAL BOOT ERROR:', error);
            this.showFatalError(error);
        }
    }

    updateStatus(text, progress) {
        if (this.statusElement) this.statusElement.textContent = text;
        if (this.loadingBar && typeof progress === 'number') {
            this.loadingBar.style.width = `${progress}%`;
        }
    }

    showFallbackNotice(reason) {
        this.updateStatus('MODE SOURIS / CLAVIER', 100);
        this.errorText.innerHTML = `
            <strong>${reason || 'Caméra indisponible.'}</strong><br>
            Vous pouvez jouer à la souris :<br>
            <span class="boot-keys">souris</span> = se déplacer &nbsp;
            <span class="boot-keys">clic</span> = valider<br>
            <span class="boot-keys">Espace</span> = bras levés &nbsp;
            <span class="boot-keys">E</span> = ouvrir la bouche &nbsp;
            <span class="boot-keys">P</span> = joueur 2 (flèches)<br>
            <span class="boot-keys">C</span> = photo &nbsp;
            <span class="boot-keys">R</span> = vidéo &nbsp;
            <span class="boot-keys">G</span> = pellicule
        `;
        this.errorBox.hidden = false;
        this.continueBtn.textContent = 'JOUER À LA SOURIS';
        this.continueBtn.onclick = () => {
            this.engine.header.setNotice('MODE SOURIS');
            this.finishBoot();
        };
        this.continueBtn.focus();
    }

    showFatalError(error) {
        this.updateStatus('ERREUR SYSTÈME', 100);
        if (this.statusElement) this.statusElement.style.color = '#ff0055';
        this.errorText.textContent = `${error.message} — ouvrez la console (F12) pour le détail.`;
        this.errorBox.hidden = false;
        this.continueBtn.textContent = 'RECHARGER';
        this.continueBtn.onclick = () => window.location.reload();
    }

    finishBoot() {
        if (this._booted) return;
        this._booted = true;

        this.bootScreen.style.opacity = '0';
        setTimeout(() => {
            this.bootScreen.style.display = 'none';
            this.engine.start();
        }, 800);
    }
}

const arcade = new JarvisArcade();

// Poignée de débogage : `jarvis.engine`, `jarvis.inputs`, `jarvis.display`
// depuis la console du navigateur. Aucun coût à l'exécution.
window.jarvis = arcade;

arcade.init();
