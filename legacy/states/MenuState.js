import { Registry } from '../core/GameRegistry.js';

// --- CONFIGURATION DU STYLE (THEME) ---
// Modifie ici pour changer l'apparence sans toucher au code logique
const MENU_THEME = {
    layout: {
        btnWidth: 450,
        btnHeight: 90,
        gap: 25,
        startYOffset: 0 // Décalage vertical si besoin
    },
    colors: {
        text: '#ffffff',
        background: 'rgba(10, 10, 20, 0.85)', // Fond des boutons
        border: '#444444',
        borderHover: '#ffffff', // Bordure quand survolé
        progressBar: 'rgba(255, 255, 255, 0.2)' // Barre de chargement
    },
    fonts: {
        title: "bold 70px 'Orbitron', sans-serif",
        button: "bold 30px 'Orbitron', sans-serif",
        info: "16px sans-serif"
    },
    interaction: {
        requiredTime: 1.5, // Temps en secondes pour valider avec la main
    }
};

export class MenuState {
    constructor(game) {
        this.game = game;
        this.buttons = [];
        
        // État de la souris
        this.mouse = { x: -1000, y: -1000, isDown: false };
        
        // Liaison des événements (binding) pour pouvoir les supprimer proprement
        this._onMouseMove = (e) => this.updateMouse(e);
        this._onMouseDown = (e) => this.handleClick(e);
    }

    enter() {
        console.log("💿 MENU: Initialisation (Mode Hybride)...");
        
        // 1. Setup des Événements Souris
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mousedown', this._onMouseDown);

        // 2. Récupération des jeux
        const availableGames = Registry.getAll();
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;
        
        // 3. Calcul de la mise en page
        const { btnWidth, btnHeight, gap } = MENU_THEME.layout;
        const totalHeight = availableGames.length * (btnHeight + gap);
        let startY = (h - totalHeight) / 2 + MENU_THEME.layout.startYOffset;

        // 4. Création des boutons
        this.buttons = availableGames.map((gameInfo, index) => {
            return {
                name: gameInfo.name,
                // Centré horizontalement
                x: (w - btnWidth) / 2, 
                y: startY + index * (btnHeight + gap),
                w: btnWidth,
                h: btnHeight,
                color: gameInfo.color || '#00ffff', // Couleur par défaut si absente
                hoverTime: 0,
                isHovered: false,
                // L'action stockée
                action: () => {
                    console.log(`🚀 Launching ${gameInfo.name}`);
                    // Nettoyage avant transition
                    this.game.setState(new gameInfo.class(this.game));
                }
            };
        });
    }

    // --- GESTION INPUT SOURIS ---
    updateMouse(e) {
        // On doit ajuster si le canvas n'est pas en plein écran, mais ici on assume fullscreen
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }

    handleClick(e) {
        // Clic immédiat = Lancement sans attendre
        this.buttons.forEach(btn => {
            if (this.isPointInside(this.mouse.x, this.mouse.y, btn)) {
                btn.action();
            }
        });
    }

    // --- BOUCLE LOGIQUE ---
    update(dt) {
        // 1. Récupération Main (InputSystem)
        const inputs = this.game.inputs;
        let hand = null;
        if (inputs && inputs.players && inputs.players.length > 0) {
            hand = inputs.players[0]; // On prend la première main (pixels)
        }
        this.handPos = hand;

        // 2. Vérification des Boutons
        this.buttons.forEach(btn => {
            let hit = false;

            // A. Check Main
            if (hand && this.isPointInside(hand.x, hand.y, btn)) {
                hit = true;
            }
            
            // B. Check Souris
            if (this.isPointInside(this.mouse.x, this.mouse.y, btn)) {
                hit = true;
            }

            btn.isHovered = hit;

            // C. Logique de Chargement (Dwell Click)
            if (hit) {
                btn.hoverTime += dt;
                
                // Effet visuel : Si on approche de la fin, on peut faire vibrer ou autre
                
                if (btn.hoverTime >= MENU_THEME.interaction.requiredTime) {
                    btn.hoverTime = 0;
                    btn.action();
                }
            } else {
                // Déchargement rapide mais pas instantané (plus fluide)
                btn.hoverTime = Math.max(0, btn.hoverTime - dt * 5);
            }
        });
    }

    // --- BOUCLE GRAPHIQUE ---
    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;

        // 1. Titre
        ctx.save();
        ctx.fillStyle = MENU_THEME.colors.text;
        ctx.font = MENU_THEME.fonts.title;
        ctx.textAlign = "center";
        
        // Effet d'ombre néon sur le titre
        ctx.shadowColor = "#00ffff";
        ctx.shadowBlur = 20;
        ctx.fillText("JARVIS ARCADE", w / 2, 120);
        ctx.restore();

        // 2. Boutons
        this.buttons.forEach(btn => {
            this.drawButton(ctx, btn);
        });

        // 3. Curseur Main (Feedback visuel spécifique AR)
        if (this.handPos) {
            ctx.beginPath();
            ctx.arc(this.handPos.x, this.handPos.y, 20, 0, Math.PI * 2);
            ctx.strokeStyle = "white";
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = "rgba(0, 255, 255, 0.5)";
            ctx.fill();
        }
    }

    drawButton(ctx, btn) {
        const theme = MENU_THEME;

        // A. Fond
        ctx.fillStyle = theme.colors.background;
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

        // B. Barre de chargement (Fond coloré qui monte)
        if (btn.hoverTime > 0) {
            const progress = btn.hoverTime / theme.interaction.requiredTime;
            ctx.fillStyle = btn.color; // Couleur spécifique au jeu
            ctx.globalAlpha = 0.3; // Transparence
            // Remplissage de gauche à droite
            ctx.fillRect(btn.x, btn.y, btn.w * progress, btn.h);
            ctx.globalAlpha = 1.0;
        }

        // C. Bordure
        ctx.lineWidth = 4;
        if (btn.isHovered) {
            ctx.strokeStyle = btn.color; // S'illumine de la couleur du jeu
            ctx.shadowColor = btn.color;
            ctx.shadowBlur = 15;
        } else {
            ctx.strokeStyle = theme.colors.border;
            ctx.shadowBlur = 0;
        }
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
        ctx.shadowBlur = 0; // Reset shadow pour le texte

        // D. Texte
        ctx.fillStyle = theme.colors.text;
        ctx.font = theme.fonts.button;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle"; // Centrage vertical facile
        const buttonText = (btn.name && typeof btn.name === 'string') ? btn.name.toUpperCase() : "JEU INCONNU";
        ctx.fillText(buttonText, btn.x + btn.w / 2, btn.y + btn.h / 2 + 10);
    }

    // --- UTILITAIRES ---
    
    isPointInside(x, y, rect) {
        return (x > rect.x && x < rect.x + rect.w &&
                y > rect.y && y < rect.y + rect.h);
    }

    exit() {
        // IMPORTANT : Nettoyage des événements pour ne pas les accumuler
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mousedown', this._onMouseDown);
        this.buttons = [];
    }
}