/**
 * REGISTRE DES JEUX
 *
 * Chaque jeu s'inscrit lui-même à l'import (bas de son fichier).
 * Le menu se construit ensuite à partir de cette liste : ajouter un jeu
 * = créer le fichier + l'importer dans js/main.js, rien d'autre.
 */
class GameRegistry {
    constructor() {
        this.games = [];
    }

    /**
     * @param {string} id - identifiant unique (ex: 'game_nuts')
     * @param {string} name - nom affiché (ex: 'NOISETTES')
     * @param {Function} gameClass - la classe du jeu
     * @param {string} [color] - couleur d'accent dans le menu
     * @param {{isMenu?: boolean}} [options]
     */
    register(id, name, gameClass, color = '#ffffff', options = {}) {
        if (typeof id !== 'string' || typeof gameClass !== 'function') {
            console.error(`❌ REGISTRY: inscription invalide pour "${id}" (signature attendue : id, nom, classe, couleur).`);
            return;
        }

        const existing = this.games.findIndex((g) => g.id === id);
        if (existing !== -1) {
            console.warn(`⚠️ REGISTRY: "${id}" était déjà inscrit, il est remplacé.`);
            this.games.splice(existing, 1);
        }

        console.log(`📝 REGISTRY: [${id}] → ${name}`);
        this.games.push({
            id,
            name,
            class: gameClass,
            color,
            isMenu: options.isMenu === true
        });
    }

    /** @returns {Function|null} la classe du jeu, ou null si inconnu */
    get(identifier) {
        return this.games.find((g) => g.id === identifier)?.class || null;
    }

    /** @returns {object|null} l'entrée complète (nom, couleur...) */
    getEntry(identifier) {
        return this.games.find((g) => g.id === identifier) || null;
    }

    getAll() {
        return [...this.games];
    }
}

export const Registry = new GameRegistry();
