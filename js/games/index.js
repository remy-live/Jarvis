/**
 * CATALOGUE DES JEUX
 *
 * === AJOUTER UN JEU EN 2 ÉTAPES ===
 *
 *   1. Copier `js/games/_Template.js` sous un nouveau nom.
 *   2. Ajouter son import dans la liste ci-dessous.
 *
 * C'est tout : le jeu se déclare lui-même (`registerGame({...})`) et
 * apparaît automatiquement dans le menu, avec son icône et sa couleur.
 *
 * L'ordre des imports = l'ordre d'affichage dans le menu.
 */

export { MenuHolo } from './MenuHolo.js';

// --- Duels et défis à la main ---
import './AirHockey.js';
import './BubblePop.js';
import './FruitBlade.js';
import './NeonBrickBattle.js';

// --- Corps entier ---
import './LaserDodge.js';
import './NeonInvaders.js';
import './FlappySquat.js';

// --- Réflexion et visage ---
import './MemoryPads.js';
import './ShurikenShowdown.js';
import './NutsGame.js';

// --- Prototypes (déclarés `hidden: true`, absents du menu) ---
// import './NeonBlade.js';
// import './SquirrelGame.js';
// import './MenuPaper.js';
