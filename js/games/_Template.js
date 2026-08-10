/**
 * MODÈLE DE JEU — copiez ce fichier pour en créer un nouveau.
 *
 * 1. Renommez la classe et l'`id`.
 * 2. Ajoutez `import './MonJeu.js';` dans js/games/index.js.
 * 3. C'est tout : le jeu apparaît dans le menu.
 *
 * Ce qui est fourni par la classe `Game` :
 *   this.game / this.engine  → le moteur
 *   this.game.display        → canvas 2D (.ctx), scène 3D (.scene), tailles (.virtW/.virtH)
 *   this.game.inputs.players → [joueur1, joueur2]
 *   this.game.audio          → musiques et bruitages
 *   this.setup({...})        → caméra + IA à activer
 *   this.after(ms, fn)       → setTimeout annulé automatiquement à la sortie
 *
 * Forme d'un joueur (identique en mode webcam et en mode souris) :
 *   { detected, x, y, z, isClicking,
 *     indexTip:{x,y}, handCenter:{x,y},
 *     pose:{raw:[33 points]}, face:{raw:[478 points], mouthOpen}, hand:{raw:[21 points]} }
 *   Les points bruts sont normalisés (0..1) dans le repère caméra :
 *   pensez à appliquer `1 - point.x` pour l'effet miroir.
 */

import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';

export class TemplateGame extends Game {
    constructor(engine) {
        super(engine);
        this.score = 0;
    }

    /** Appelé une fois au lancement du jeu. */
    enter() {
        // Quelles IA activer ? (tout ce qui est inutile coûte du CPU pour rien)
        this.setup({
            cameraMode: 'fullscreen', // 'fullscreen' | 'vignette' | 'hidden'
            hands: true,              // suivi des mains (curseur, pincement)
            pose: false,              // suivi du corps (squats, bras levés)
            face: false,              // suivi du visage (bouche, yeux)
            smoothing: 0.75           // 0 = très lissé, 1 = brut
        });

        this.game.display.setBackground('#0b0f14');
        this.score = 0;
    }

    /** Appelé à chaque frame. `dt` = secondes écoulées (déjà borné). */
    update(dt) {
        const player = this.game.inputs.players[0];
        if (!player || !player.detected) return;

        // Exemple : compter les pincements
        if (player.isClicking && !this._wasClicking) this.score++;
        this._wasClicking = player.isClicking;
    }

    /** Appelé après update(). Le canvas 2D est déjà effacé. */
    render(display) {
        const ctx = display.ctx;
        ctx.fillStyle = '#e6edf3';
        ctx.font = "600 32px 'Orbitron', sans-serif";
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`SCORE ${this.score}`, 40, 140);
    }

    /** Appelé en quittant : libérez tout ce que vous avez créé. */
    exit() {
        this.clearTimers(); // annule les this.after() en attente
    }
}

registerGame({
    id: 'template_game',
    name: 'MON JEU',
    icon: '🎯',
    color: '#7dd3fc',
    players: 1,
    description: 'Décrivez le jeu en une phrase, elle s\'affiche dans le menu.',
    hidden: true, // passez à false pour le faire apparaître dans le menu
    class: TemplateGame
});
