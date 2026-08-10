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

import './NeonBrickBattle.js';
import './NeonInvaders.js';
import './FruitBlade.js';
import './FlappySquat.js';
import './ShurikenShowdown.js';
import './NutsGame.js';

// --- Prototypes (déclarés `hidden: true`, absents du menu) ---
// import './NeonBlade.js';
// import './SquirrelGame.js';
// import './MenuPaper.js';
