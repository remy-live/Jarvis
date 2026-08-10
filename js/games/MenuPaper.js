import { Game } from '../core/Game.js';
import { Registry, registerGame } from '../core/GameRegistry.js';


export class MenuPaper extends Game{
    constructor(game) {
        super(game);
        // --- Configuration standard du "Jeu" ---
        this.game = game;
        this.id = 'menu_paper';
        this.name = 'MENU PAPIER';
        this.isMenu = true;

        // --- Paramètres du menu ---

        this.domLayer = this.game.display.gameLayer; // La div 2D au-dessus du canvas
        this.gamesList = [];
        this.currentPage = 0;
        this.gamesPerPage = 9;
        this.backgroundOpacity = 0.4;

        // --- Interaction Doigt (Dwell Click) ---
        // L'élément DOM actuellement survolé par le doigt
        this.hoveredElement = null;
        // Timer pour valider la sélection en restant dessus
        this.dwellTimer = 0;
        // Temps requis pour valider (en secondes)
        this.dwellThreshold = 1.5; 
        this.setup({
            cameraMode: 'fullscreen',
            face: false, // Pas besoin d'IA visage pour le menu
            pose: false 
        });
    }

    /**
     * Appelé par le moteur quand on arrive sur ce menu.
     */
    enter() {
        console.log("📜 MENU PAPIER: Initialisation");

        // 1. Nettoyage du layer 2D
        this.domLayer.innerHTML = '';

        // 2. Récupération et filtrage des jeux
        // On enlève le menu lui-même de la liste
        this.gamesList = Registry.getAll().filter(gameClass => gameClass.name !== this.name);

        // 3. Injection de la structure HTML de base
        this.domLayer.innerHTML = `
            <div class="paper-menu-container" style="opacity:`+this.backgroundOpacity+`">
                <h1 class="paper-title">ARCADE NOTEBOOK</h1>
                <div class="paper-grid-wrapper">
                    <div class="paper-grid" id="paper-games-grid"></div>
                </div>
                <div class="paper-pagination" id="paper-pagination-controls"></div>
                <div id="finger-cursor" class="finger-cursor"></div>
            </div>
        `;

        // Rendu de la première page
        this.renderPage();
    }

    /**
     * Affiche les jeux de la page courante.
     */
renderPage() {
        const grid = document.getElementById('paper-games-grid');
        const pagination = document.getElementById('paper-pagination-controls');
        
        // Sécurité si le HTML n'est pas encore prêt
        if (!grid || !pagination) return;

        grid.innerHTML = '';
        pagination.innerHTML = '';

        // Calcul des index pour la pagination
        const start = this.currentPage * this.gamesPerPage;
        const end = Math.min(start + this.gamesPerPage, this.gamesList.length);
        const pageGames = this.gamesList.slice(start, end);

        // Création des cartes de jeu
        pageGames.forEach((GameClass, index) => {
            const globalIndex = start + index;
            
            // --- SECURITÉ NOM DU JEU (ANTI-CRASH) ---
            // 1. On cherche le titre joli (static title)
            // 2. Sinon le nom de la classe
            // 3. Sinon une valeur par défaut
            // 4. On force la conversion en String pour éviter le bug .toUpperCase()
            let rawName = GameClass.title || GameClass.name || "JEU MYSTÈRE";
            let displayName = String(rawName).toUpperCase(); 
            // ----------------------------------------

            const card = document.createElement('div');
            card.className = 'paper-card interactive';
            //card.className = 'paper-card';
            card.dataset.gameIndex = globalIndex;

            card.innerHTML = `
                <div class="card-content">
                    <span class="game-marker">#${globalIndex + 1}</span>
                    <h2>${displayName}</h2>
                </div>
                <div class="dwell-progress-bar"></div>
            `;

            // Interaction Souris
            card.addEventListener('click', () => {
                this.selectGame(globalIndex);
            });

            grid.appendChild(card);
        });

        // Contrôles de pagination
        if (this.gamesList.length > this.gamesPerPage) {
            pagination.innerHTML = `
                <button class="paper-btn prev" ${this.currentPage === 0 ? 'disabled' : ''}>← Précédent</button>
                <span class="page-indicator">Page ${this.currentPage + 1}/${Math.ceil(this.gamesList.length / this.gamesPerPage)}</span>
                <button class="paper-btn next" ${end === this.gamesList.length ? 'disabled' : ''}>Suivant →</button>
            `;

            pagination.querySelector('.prev')?.addEventListener('click', () => this.changePage(-1));
            pagination.querySelector('.next')?.addEventListener('click', () => this.changePage(1));
        }
    }

    changePage(direction) {
        this.currentPage += direction;
        this.renderPage();
    }

    /**
     * Boucle principale, appelée à chaque frame par le moteur.
     * C'est ici qu'on gère l'interaction avec le doigt.
     */
    update(dt) {
    const inputs = this.game.inputs;
    const cursor = document.getElementById('finger-cursor');
   // console.log(cursor);
    let fingerX = null;
    let fingerY = null;



    // 1. DÉTECTION
    if (inputs.hand && inputs.hand.indexTip) {
        
        // Si tes coordonnées hand sont déjà converties en pixels par Display.js
        fingerX = inputs.hand.indexTip.x;
      //  console.log(fingerX);
        fingerY = inputs.hand.indexTip.y;
    } 
    else if (inputs.mouse && typeof inputs.mouse.x === 'number') {
        fingerX = inputs.mouse.x;
        fingerY = inputs.mouse.y;
    }

    // 2. MISE À JOUR VISUELLE
    if (cursor) {
        if (fingerX !== null && fingerY !== null) {
            cursor.style.display = 'block';
            // Utilise transform pour plus de fluidité (évite les calculs de layout)
            cursor.style.transform = `translate3d(${fingerX}px, ${fingerY}px, 0)`;
            cursor.style.left = '0';
            cursor.style.top = '0';
        } else {
            cursor.style.display = 'none';
        }
    }

    // 3. LOGIQUE DWELL CLICK
    let newHoveredElement = null;

    if (fingerX !== null && fingerY !== null) {
        // On récupère l'élément sous le doigt
        // (Le pointer-events: none en CSS est crucial ici)
        const target = document.elementFromPoint(fingerX, fingerY);
        
        if (target) {
            newHoveredElement = target.closest('.paper-card') || target.closest('.paper-btn:not([disabled])');
        }
    }

    // Gestion du changement de survol
    if (newHoveredElement !== this.hoveredElement) {
        this.resetDwellState(); // On nettoie l'ancien
        this.hoveredElement = newHoveredElement;
        
        if (this.hoveredElement) {
            this.hoveredElement.classList.add('finger-hover');
        }
    }

    // Progression du Timer
    if (this.hoveredElement) {
        this.dwellTimer += dt;
        const progress = Math.min(this.dwellTimer / this.dwellThreshold, 1.0);
        
        const progressBar = this.hoveredElement.querySelector('.dwell-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress * 100}%`;
        }

        if (this.dwellTimer >= this.dwellThreshold) {
            // Déclenche l'action
            this.hoveredElement.click(); 
            this.resetDwellState();
        }
    }
}

    resetDwellState() {
        if (this.hoveredElement) {
            this.hoveredElement.classList.remove('finger-hover');
            const progressBar = this.hoveredElement.querySelector('.dwell-progress-bar');
            if (progressBar) progressBar.style.width = '0%';
        }
        this.hoveredElement = null;
        this.dwellTimer = 0;
    }

    selectGame(index) {
        // 1. On récupère l'entrée dans la liste
        const entry = this.gamesList[index];

        // 2. ROBUSTESSE : On gère les deux formats possibles du registre
        // Soit c'est directement la Classe, soit c'est un objet { class: ..., name: ... }
        const GameClass = entry.class || entry;

        // 3. On récupère l'ID unique du jeu
        const gameId = GameClass.id;

        if (entry && entry.id) {
            console.log(`🚀 MENU: Commande de lancement -> ${gameId}`);
            
            // 4. ON NE FAIT PAS 'new' ICI !
            // On demande au moteur de charger le jeu par son ID.
            // C'est le travail de Engine.js de gérer le constructeur.
            this.game.loadGame(entry.id); 
        } else {
            console.error("❌ ERREUR: Ce jeu n'a pas d'ID statique (static id) !", entry);
        }
    }

    /**
     * Appelé quand on quitte le menu.
     */
    exit() {
        // Nettoyage du DOM pour laisser la place au jeu suivant
        this.domLayer.innerHTML = '';
    }
}

// N'oublie pas d'importer et d'enregistrer cette classe dans ton fichier principal (main.js ou là où tu gères le registre)
registerGame({
    id: 'menu_paper',
    name: 'MENU PAPIER',
    icon: '📄',
    color: '#e5e7eb',
    isMenu: true,
    hidden: true,
    class: MenuPaper
});