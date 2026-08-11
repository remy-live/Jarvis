import { Registry } from '../core/GameRegistry.js';

export class MenuSketch {
    static id = 'MENU_SKETCH';
    static title = 'CARNET DE JEUX';

    constructor(game) {
        this.game = game;
        this.id = MenuSketch.id;
        this.layer = null;
        this.playerCount = 1;
    }

    enter() {
        console.log("📝 MENU: Ouverture du carnet");

        // 1. CIBLAGE (On vise layer-2d)
        this.layer = document.getElementById('layer-2d');

        if (!this.layer) {
            console.error("❌ ERREUR CRITIQUE: <div id='layer-2d'> introuvable dans index.html !");
            return;
        }

        // 2. INJECTION DU HTML (CRÉATION DE LA GRILLE)
        // C'est ici que l'élément #sketch-grid est créé.
        this.layer.innerHTML = `
            <div class="menu-sketch-container theme-sketch">
                <header class="sketch-header">
                    <h1 class="menu-title">JARVIS ARCADE</h1>
                    
                    <div class="player-toggle">
                        <span class="toggle-opt active" data-n="1">1 JOUEUR</span>
                        <span class="toggle-opt" data-n="2">2 JOUEURS</span>
                    </div>
                </header>

                <div class="games-grid" id="sketch-grid"></div>
            </div>
        `;

        // 3. REMPLISSAGE (Seulement APRES l'injection HTML)
        // Petite sécurité : on attend un micro-instant pour être sûr que le DOM est prêt
        setTimeout(() => {
            this.renderGamesList();
            this.bindEvents();
        }, 0);
    }

    renderGamesList() {
        // On cherche l'élément qu'on vient de créer
        const grid = document.getElementById('sketch-grid');
        
        if(!grid) {
            console.error("❌ ERREUR: #sketch-grid est toujours introuvable !");
            return;
        }

        grid.innerHTML = ''; // Nettoyage

        const allGames = Registry.getAll();
        
        if (allGames.length === 0) {
            grid.innerHTML = '<div class="game-card">Aucun jeu...</div>';
            return;
        }

        allGames.forEach(entry => {
            const GameClass = entry.class;
            if (!GameClass) return;

            // On vérifie l'ID statique
            const gameId = GameClass.id; 
            
            // Si pas d'ID ou si c'est le menu, on saute
            if (!gameId || gameId.includes('MENU')) return;

            // Titre
            const title = GameClass.title || entry.name || "Jeu";

            // Création de la carte
            const card = document.createElement('div');
            card.className = 'game-card sketch-btn';
            card.innerHTML = `<span>${title}</span>`;

            card.onclick = () => {
                this.launchGame(gameId);
            };

            grid.appendChild(card);
        });
    }

    bindEvents() {
        if (!this.layer) return;
        
        const opts = this.layer.querySelectorAll('.toggle-opt');
        opts.forEach(opt => {
            opt.onclick = () => {
                opts.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.playerCount = parseInt(opt.dataset.n);
                console.log("👥 Joueurs : " + this.playerCount);
            };
        });
    }

    launchGame(gameId) {
        console.log(`🚀 MENU: Lancement de ${gameId}`);
        this.game.session = { playerCount: this.playerCount };
        this.game.loadGame(gameId);
    }

    update(dt) {}
    render(display) {}

    exit() {
        if (this.layer) {
            this.layer.innerHTML = '';
        }
    }
}