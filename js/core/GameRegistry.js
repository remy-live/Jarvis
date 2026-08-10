/**
 * REGISTRE DES JEUX
 *
 * Chaque jeu se déclare lui-même en bas de son fichier :
 *
 *     registerGame({
 *         id: 'mon_jeu',
 *         name: 'MON JEU',
 *         icon: '🎯',
 *         color: '#7dd3fc',
 *         players: 2,
 *         description: 'Une phrase pour le menu.',
 *         class: MonJeu
 *     });
 *
 * Le menu se construit ensuite tout seul à partir de cette liste.
 */

/** @typedef {{id:string,name:string,class:Function,icon:string,color:string,players:number,description:string,isMenu:boolean,hidden:boolean}} GameEntry */

const DEFAULTS = {
    icon: '🎮',
    color: '#7dd3fc',
    players: 1,
    description: '',
    isMenu: false,
    hidden: false
};

class GameRegistry {
    constructor() {
        /** @type {GameEntry[]} */
        this.games = [];
    }

    /**
     * Déclaration moderne (objet unique).
     * @param {Partial<GameEntry> & {id:string, name:string, class:Function}} definition
     */
    add(definition) {
        const { id, name } = definition;
        const GameClass = definition.class;

        if (typeof id !== 'string' || !id) {
            console.error('❌ REGISTRY: un jeu doit avoir un `id` (chaîne unique).', definition);
            return null;
        }
        if (typeof GameClass !== 'function') {
            console.error(`❌ REGISTRY: "${id}" n'expose pas de classe valide.`, definition);
            return null;
        }

        const existing = this.games.findIndex((g) => g.id === id);
        if (existing !== -1) {
            console.warn(`⚠️ REGISTRY: "${id}" était déjà inscrit, il est remplacé.`);
            this.games.splice(existing, 1);
        }

        const entry = {
            ...DEFAULTS,
            ...definition,
            id,
            name: name || id,
            class: GameClass
        };

        // On rend les métadonnées lisibles depuis la classe elle-même
        GameClass.meta = entry;

        this.games.push(entry);
        console.log(`📝 REGISTRY: [${id}] → ${entry.name}`);
        return entry;
    }

    /**
     * Ancienne signature, conservée pour ne pas casser les jeux existants.
     * @deprecated Utiliser `registerGame({ ... })`.
     */
    register(id, name, gameClass, color = DEFAULTS.color, options = {}) {
        return this.add({ id, name, class: gameClass, color, ...options });
    }

    /** @returns {Function|null} la classe du jeu, ou null si inconnu */
    get(identifier) {
        return this.games.find((g) => g.id === identifier)?.class || null;
    }

    /** @returns {GameEntry|null} l'entrée complète (nom, icône, couleur...) */
    getEntry(identifier) {
        return this.games.find((g) => g.id === identifier) || null;
    }

    getAll() {
        return [...this.games];
    }

    /** Les jeux affichables dans le menu (ni menus, ni cachés). */
    getPlayable() {
        return this.games.filter((g) => !g.isMenu && !g.hidden);
    }
}

export const Registry = new GameRegistry();

/** Raccourci recommandé pour déclarer un jeu. */
export const registerGame = (definition) => Registry.add(definition);
