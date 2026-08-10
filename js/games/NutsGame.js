import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { spawnItem, createParticles } from './utils_2d.js';
import { AudioManager } from '../core/AudioManager.js';

export class NutsGame extends Game {
    constructor(game) {
        super(game);
        this.id = 'game_nuts';
        this.name = 'NOISETTES EXPRESSIVE';
        this.game = game;
        
        this.domLayer = this.game.display.gameLayer;
        this.ctx = this.game.display.ctx;
        
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        
        this.interval = null;
        this.mask = null;
        
        // Physique Masque
        this.pose = { x: this.w/2, y: this.h/2, scale: 1, angle: 0 };
        this.SMOOTH = 0.5; // Un peu plus doux pour éviter les tremblements

        this.mouthThreshold = 0.03; 
        this.score = 0;
        this.audioConfig = {
            music: './assets/sounds/music/Nuts.mp3', 
            sfx: {
                'crunch': './assets/sounds/sfx/crunch.wav', 
                'bonus':  './assets/sounds/sfx/win.wav'
            }
        };
        // On demande uniquement le visage
        this.setup({
            cameraMode: 'fullscreen', 
            hands: false,
            face: true,             
            pose: false             
        });
    }

    enter() {
        console.log("🐿️ NOISETTES: Démarrage");
        this.game.display.setBackground("linear-gradient(to bottom, #a8bcc9 0%, #E0F7FA 100%)");
        this.game.audio.setupGameAudio(this.audioConfig); 
        
        // CRÉATION DU MASQUE DOM
        this.mask = document.createElement('div');
        this.mask.id = 'squirrel-mask';
        this.mask.innerHTML = `
            <div class="mask-head">
                <div class="mask-eyes">
                    <div id="eye-l" class="eye"></div>
                    <div id="eye-r" class="eye"></div>
                </div>
                <div class="mask-nose"></div>
                
                <div class="mask-mouth" id="squirrel-mouth">
                    <div class="mask-teeth">
                        <div class="tooth"></div>
                        <div class="tooth"></div>
                    </div>
                </div>
            </div>`;
        this.domLayer.appendChild(this.mask);

        this.startSpawner();
        this.score = 0;
    }

    startSpawner() {
        this.interval = setInterval(() => {
            let cfg = { emoji: '🌰', size: 70, speed: 3.5, className: 'nut-base' };
            if(Math.random() > 0.85) cfg = { emoji: '🌟', size: 60, speed: 2.5, className: 'nut-gold' };
            spawnItem(cfg, this.domLayer, this.w, this.h);
        }, 1200);
    }

    update(dt) {
        const inputs = this.game.inputs;
        const display = this.game.display;
        
        // On prend le joueur 1 par défaut
        const player = inputs.players[0];

        // --- 1. SÉCURITÉ ---
        // On vérifie qu'on a bien un visage détecté
        if (!player || !player.detected || !player.face || !player.face.raw) return;

        // --- 2. RÉCUPÉRATION INTELLIGENTE DES DONNÉES ---
        // Le nouveau InputSystem stocke la position principale lissée dans player.x / player.y
        // Mais pour le visage spécifiquement, on veut être précis.
        
        // Si InputSystem a calculé 'nose' (position lissée du nez), on l'utilise.
        // Sinon, on prend player.x/y qui est la position "maître".
        let targetX = player.x;
        let targetY = player.y;

        if (player.face.nose) {
            targetX = player.face.nose.x;
            targetY = player.face.nose.y;
        }

        const lm = player.face.raw; // Les points bruts (normalisés 0-1)

        // --- 3. CALCULS GÉOMÉTRIQUES ---
        
        // A. Calcul de l'angle (Front vs Nez)
        // Point 10 = Haut du front, Point 1 = Bout du nez
        // Attention : lm contient des coordonnées normalisées (0-1), il faut convertir en pixels pour l'angle
        const foreheadRaw = lm[10]; 
        const noseRaw = lm[1];

        // Conversion en pixels
        const p1 = display.toVirtual(1 - foreheadRaw.x, foreheadRaw.y); // Front
        const p2 = display.toVirtual(1 - noseRaw.x, noseRaw.y);         // Nez (Reference pour l'angle)

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        
        // Angle (+90 car le masque HTML est droit par défaut)
        const targetAngle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
        
        // B. Calcul de l'échelle (Distance Front-Menton ou Front-Nez)
        // On utilise la distance calculée précédemment
        const distPixels = Math.sqrt(dx*dx + dy*dy);
        // Facteur d'échelle empirique (à ajuster selon la taille de tes assets CSS)
        const targetScale = (distPixels / 100) * 1.8; 

        // C. Ouverture de la bouche
        // Points 13 (Lèvre haut) et 14 (Lèvre bas)
        const upperLip = lm[13];
        const lowerLip = lm[14];
        // Distance simple (pas besoin de convertir en pixels, le ratio suffit)
        const mouthDist = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
        
        // Seuil d'ouverture (ajusté pour être réactif)
        // 0.05 est une bonne valeur moyenne pour une bouche ouverte
        const mouthOpening = Math.max(0, (mouthDist - 0.01) * 30); 

        // D. Yeux (Clignement)
        // Oeil Gauche (386 haut, 374 bas) - Oeil Droit (159 haut, 145 bas)
        const leftEyeOpen = Math.abs(lm[386].y - lm[374].y) > 0.012;
        const rightEyeOpen = Math.abs(lm[159].y - lm[145].y) > 0.012;

        // --- 4. APPLICATION PHYSIQUE (LISSAGE) ---
        // On lisse les mouvements pour éviter que le masque ne saute partout
        this.pose.x += (targetX - this.pose.x) * this.SMOOTH;
        this.pose.y += (targetY - this.pose.y) * this.SMOOTH;
        this.pose.scale += (targetScale - this.pose.scale) * this.SMOOTH;
        
        // Lissage angulaire correct (évite le tour complet lors du passage -180/180)
        let diffAngle = targetAngle - this.pose.angle;
        while (diffAngle > 180) diffAngle -= 360;
        while (diffAngle < -180) diffAngle += 360;
        this.pose.angle += diffAngle * this.SMOOTH;

        // --- 5. MISE À JOUR DOM ---
        if (this.mask) {
            // Transformation CSS globale
            this.mask.style.transform = 
                `translate3d(${this.pose.x}px, ${this.pose.y}px, 0) ` +
                `translate(-50%, -50%) ` +
                `scale(${this.pose.scale}) ` +
                `rotate(${this.pose.angle}deg)`;
            
            // Bouche
            const mouthEl = this.mask.querySelector('#squirrel-mouth');
            if(mouthEl) {
                // On limite la hauteur max pour pas que ça casse le design
                let hPx = 10 + (mouthOpening * 40);
                hPx = Math.min(70, hPx);
                mouthEl.style.height = `${hPx}px`;
            }

            // Yeux
            const eyeL = this.mask.querySelector('#eye-l');
            const eyeR = this.mask.querySelector('#eye-r');
            if(eyeL) eyeL.classList.toggle('closed', !leftEyeOpen);
            if(eyeR) eyeR.classList.toggle('closed', !rightEyeOpen);
        }

        // --- 6. LOGIQUE DE JEU (COLLISIONS) ---
        const isMouthOpen = mouthDist > 0.04; // Seuil pour "Manger"
        
        // Point de collision (un peu décalé devant le masque selon l'angle)
        // 60px est environ la distance entre le centre de la tête et la bouche
        const hitOffset = 60 * this.pose.scale;
        const hitX = this.pose.x + Math.sin(-this.pose.angle * Math.PI/180) * hitOffset;
        const hitY = this.pose.y + Math.cos(-this.pose.angle * Math.PI/180) * hitOffset;
        
        const interactionRadius = 50 * this.pose.scale; 
        const items = this.domLayer.querySelectorAll('.game-item');

        items.forEach(el => {
            if(el.dataset.status === 'eaten') return;

            const r = el.getBoundingClientRect();
            const cx = r.left + r.width/2; 
            const cy = r.top + r.height/2;
            const d = Math.hypot(hitX - cx, hitY - cy);

            // Zone d'interaction
            if (d < interactionRadius) {
                if (!isMouthOpen) {
                     // Si bouche fermée, on pousse la noisette (petit feedback physique)
                     const pushX = (cx - hitX) * 0.2;
                     el.style.transform = `translate(${pushX}px, -10px)`;
                } else {
                    // Si bouche ouverte
                    if (d < 35 * this.pose.scale) { 
                        // MIAM !
                        this.eatNut(el, cx, cy);
                    } else {
                        // Attraction magnétique vers la bouche
                        const pullX = (hitX - cx) * 0.2;
                        const pullY = (hitY - cy) * 0.2;
                        el.style.transform = `translate(${pullX}px, ${pullY}px) scale(0.9)`;
                    }
                }
            }
        });
    }

    eatNut(el, x, y) {
        el.dataset.status = 'eaten';
        el.remove();
        this.score++;
        
        if (el.classList.contains('nut-gold')) {
            this.game.audio.playSFX('bonus');
        } else {
            this.game.audio.playSFX('crunch');
        }
        
        createParticles(x, y, '#a9764b', this.domLayer);
        
        // Feedback visuel sur le masque
        if(this.mask) {
            const mouthEl = this.mask.querySelector('#squirrel-mouth');
            if(mouthEl) {
                mouthEl.style.backgroundColor = "#5a2d0c"; // Assombrir l'intérieur
                setTimeout(() => mouthEl.style.backgroundColor = "", 100);
            }
        }
    }

    render(display) {
        const ctx = display.ctx;
        ctx.fillStyle = "#5a2d0c";
        ctx.font = "bold 40px 'Orbitron'";
        ctx.textAlign = "left";
        ctx.fillText(`NOISETTES: ${this.score}`, 30, 60);
        
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeText(`NOISETTES: ${this.score}`, 30, 60);
    }

    exit() {
        this.clearTimers();
        clearInterval(this.interval);
        if(this.domLayer) this.domLayer.innerHTML = '';
        this.mask = null;
    }
}

registerGame({
    id: 'game_nuts',
    name: 'NOISETTES',
    icon: '🐿️',
    color: '#c2a882',
    players: 1,
    description: 'Attrapez les noisettes en ouvrant la bouche.',
    class: NutsGame
});