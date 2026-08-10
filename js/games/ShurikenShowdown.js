import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../core/GameOverModal.js';

export class ShurikenShowdown extends Game {
    constructor(game) {
        super(game);
        this.game = game;
        this.id = 'shuriken_showdown';
        this.name = 'SHURIKEN SHOWDOWN';
        this.color = '#fb7185'; 
        this.isMenu = false;

        this.modal = new GameOverModal(this.game);

        // --- Paramètres ---
        this.throwThreshold = 12; 
        this.throwCooldown = 0.5; // Tir un peu plus rapide
        this.shurikenSpeed = 500; 
        this.targetMoveSpeed = 80; // Vitesse de déplacement de la cible (doux)
        this.maxHP = 5;

        this.playersState = [];
        this.projectiles = [];
        this.particles = [];
    }

    enter() {
        // On a besoin de 'Hands' pour jouer. 
        // On garde 'Pose' uniquement si tu veux afficher le squelette pour le fun, 
        // mais pour le gameplay, on n'utilise plus le corps comme cible.
        this.gameConfig = { cameraMode: 'fullscreen', pose: false, face: false, hands: true };
        this.setup(this.gameConfig);
        this.reset();
    }
    
    exit() {
        this.clearTimers();
        this.playersState = [];
        this.projectiles = [];
        if(this.modal) this.modal.hide();
    }

    reset() {
        this.gameState = 'WAITING';
        
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        this.playersState = [
            this.createPlayer(0, '#3498db', 'BLUE', w * 0.15, h), // Cible à gauche
            this.createPlayer(1, '#fb7185', 'RED', w * 0.85, h)   // Cible à droite
        ];

        this.projectiles = [];
        this.particles = [];
        this.modal.hide();
    }

    createPlayer(id, color, name, targetX, h) {
        return {
            id: id,
            color: color,
            name: name,
            hp: this.maxHP,
            alive: true,
            // Main
            handPos: { x: 0, y: 0 },
            prevHandPos: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 },
            trail: [],
            cooldown: 0,
            
            // CIBLE AUTOMATIQUE (L'Orbe)
            target: {
                x: targetX,
                y: h / 2,
                radius: 40,
                dir: 1, // 1 = descend, -1 = monte
                baseY: h / 2
            }
        };
    }

    update(dt) {
        if (this.modal.isVisible) return;

        const inputs = this.game.inputs;
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        let activePlayers = 0;

        // 1. GESTION DES JOUEURS
        for (let i = 0; i < 2; i++) {
            const p = this.playersState[i];
            const input = inputs.players[i];

            // A. DÉPLACEMENT DE LA CIBLE (Automatique)
            // Elle oscille de haut en bas
            p.target.y += this.targetMoveSpeed * p.target.dir * dt;
            
            // Rebond en haut et en bas (marge de 100px)
            if (p.target.y > h - 100) p.target.dir = -1;
            if (p.target.y < 100) p.target.dir = 1;


            // B. GESTION MAIN (Si détectée)
            // Position par défaut si main non détectée (au centre de sa zone)
            let defaultHandX = (i === 0) ? w * 0.25 : w * 0.75;
            let defaultHandY = h / 2;

            if (input && input.detected) {
                activePlayers++;
                
                let currentX = input.x || defaultHandX;
                let currentY = input.y || defaultHandY;

                // Trace
                p.trail.push({ x: currentX, y: currentY });
                if (p.trail.length > 10) p.trail.shift();

                // Vitesse
                const vx = (currentX - p.prevHandPos.x) / dt;
                const vy = (currentY - p.prevHandPos.y) / dt;
                p.velocity = { x: vx, y: vy };
                p.prevHandPos = { x: currentX, y: currentY };
                p.handPos = { x: currentX, y: currentY };

                // Lancer
                if (p.cooldown > 0) p.cooldown -= dt;
                
                const isThrowing = (i === 0 && vx > this.throwThreshold * w * 0.01) || 
                                   (i === 1 && vx < -this.throwThreshold * w * 0.01);

                if (isThrowing && p.cooldown <= 0 && this.gameState === 'PLAYING') {
                    this.throwShuriken(p, vx, vy);
                }
            } else {
                if (p.trail.length > 0) p.trail.shift();
                p.handPos = { x: defaultHandX, y: defaultHandY }; // Main au repos
            }
        }

        if (this.gameState === 'WAITING' && activePlayers >= 1) {
            this.gameState = 'PLAYING';
        }

        // 2. PROJECTILES
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            
            proj.x += proj.vx * dt;
            proj.y += proj.vy * dt;
            proj.rotation += 12 * dt; 

            if (proj.x < -100 || proj.x > w + 100) {
                this.projectiles.splice(i, 1);
                continue;
            }

            // --- COLLISIONS ---
            const targetId = proj.ownerId === 0 ? 1 : 0;
            const targetPlayer = this.playersState[targetId];
            
            if (!targetPlayer.alive) continue;

            // A. PARADE (Main du défenseur vs Shuriken)
            // Si le défenseur touche le shuriken avec sa main, il le détruit
            const distHand = Math.hypot(proj.x - targetPlayer.handPos.x, proj.y - targetPlayer.handPos.y);
            if (distHand < 60) { // Rayon de la main
                this.spawnParticles(proj.x, proj.y, '#ffffff', 'spark');
                if(this.game.audio) this.game.audio.playSFX('select');
                this.projectiles.splice(i, 1);
                continue;
            }

            // B. TOUCHE CIBLE (Shuriken vs Orbe Flottante)
            const distTarget = Math.hypot(proj.x - targetPlayer.target.x, proj.y - targetPlayer.target.y);
            
            if (distTarget < targetPlayer.target.radius + 20) { // +20 pour la taille du shuriken
                this.spawnParticles(proj.x, proj.y, targetPlayer.color, 'blood');
                targetPlayer.hp--;
                if(this.game.audio) this.game.audio.playSFX('crunch');
                
                this.projectiles.splice(i, 1);
                
                if (targetPlayer.hp <= 0) {
                    targetPlayer.alive = false;
                    this.triggerGameOver();
                }
                continue;
            }
        }

        this.updateParticles(dt);
    }

    throwShuriken(player, vx, vy) {
        player.cooldown = this.throwCooldown;
        const dirX = player.id === 0 ? 1 : -1;
        
        this.projectiles.push({
            // EXACTEMENT au centre de la main
            x: player.handPos.x,
            y: player.handPos.y,
            vx: dirX * this.shurikenSpeed,
            vy: vy * 0.15, // On garde un tout petit peu de direction verticale
            rotation: 0,
            ownerId: player.id,
            color: player.color
        });

        if(this.game.audio) this.game.audio.playSFX('throw');
    }

    spawnParticles(x, y, color, type) {
        const count = type === 'spark' ? 10 : 20;
        for(let i=0; i<count; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 400,
                vy: (Math.random() - 0.5) * 400,
                life: 0.3 + Math.random() * 0.3,
                color: color,
                size: Math.random() * 6 + 2,
                type: type
            });
        }
    }

    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    triggerGameOver() {
        this.gameState = 'GAMEOVER';
        this.after(1000, () => {
            const winner = this.playersState[0].alive ? "BLEU" : "ROUGE";
            this.modal.show(`${winner} GAGNE !`, this.gameConfig, () => this.reset());
        });
    }

    render(display) {
        const ctx = display.ctx;
        const w = display.uiCanvas.width;
        const h = display.uiCanvas.height;

        ctx.clearRect(0, 0, w, h);
        
        // Fond légèrement assombri
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; 
        ctx.fillRect(0, 0, w, h);
        
        // Ligne centrale
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.stroke();

        // JOUEURS
        this.playersState.forEach(p => {
            if (!p.alive) return;

            // 1. CIBLE FLOTTANTE (ORBE)
            this.drawOrb(ctx, p.target.x, p.target.y, p.target.radius, p.color);

            // 2. TRACE DU DOIGT
            this.drawTrail(ctx, p);

            // 3. MAIN (Curseur de Défense)
            // Cercle blanc pour la main
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'white'; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(p.handPos.x, p.handPos.y, 15, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            
            // Indicateur Cooldown (Cercle autour de la main)
            if (p.cooldown > 0) {
                ctx.strokeStyle = p.color; ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(p.handPos.x, p.handPos.y, 25, 0, Math.PI * 2 * (1 - p.cooldown/this.throwCooldown));
                ctx.stroke();
            }

            // Barre de Vie (Liée à la cible ou en haut ?) -> En haut c'est plus lisible
            this.drawHealthBar(ctx, p);
        });

        // PROJECTILES
        this.projectiles.forEach(proj => {
            this.drawShuriken(ctx, proj);
        });

        // PARTICULES
        this.particles.forEach(p => {
            ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        });
        ctx.globalAlpha = 1;

        if (this.gameState === 'WAITING') {
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, h/2 - 50, w, 100);
            ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '30px Orbitron';
            ctx.fillText("PRÉPAREZ VOS MAINS !", w/2, h/2 + 10);
        }
    }

    drawOrb(ctx, x, y, radius, color) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 30;

        // Orbe extérieure
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI*2); ctx.fill();

        // Noyau
        ctx.fillStyle = 'white';
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(x, y, radius * 0.4, 0, Math.PI*2); ctx.fill();

        // Anneaux d'énergie (déco)
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.ellipse(x, y, radius + 10, radius/2, 0, 0, Math.PI*2); ctx.stroke();
        
        ctx.restore();
    }

    drawTrail(ctx, p) {
        if (p.trail.length < 2) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // On dessine une ligne continue
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        
        for (let i = 1; i < p.trail.length; i++) {
            // Bezier curve pour lisser serait mieux, mais lineTo suffit pour l'instant
            ctx.lineTo(p.trail[i].x, p.trail[i].y);
        }

        // Effet de dégradé sur la traînée
        // Comme c'est compliqué de faire un dégradé sur une ligne courbe en canvas,
        // on fait simple : couleur solide avec transparence globale
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 10;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    drawShuriken(ctx, proj) {
        ctx.save();
        ctx.translate(proj.x, proj.y);
        ctx.rotate(proj.rotation);

        ctx.fillStyle = '#ecf0f1'; 
        ctx.shadowColor = proj.color; ctx.shadowBlur = 15;

        ctx.beginPath();
        const size = 30; 
        // Forme Shuriken Ninja Classique
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(size/2, size/4, size, 0); // Bord incurvé
            ctx.quadraticCurveTo(size/2, -size/4, 0, 0);
        }
        ctx.fill();
        
        ctx.fillStyle = proj.color; 
        ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fill();
        ctx.restore();
    }

    drawHealthBar(ctx, p) {
        const barW = 250; const barH = 20;
        // Barre au dessus de la cible (Orbe)
        // x centré sur la cible
        const x = p.target.x - barW / 2;
        const y = 30; // Fixe en haut de l'écran

        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, barW, barH);
        const hpPct = Math.max(0, p.hp / this.maxHP);
        
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, barW * hpPct, barH);
        
        ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.strokeRect(x, y, barW, barH);
        
        ctx.fillStyle = 'white'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
        ctx.fillText(p.name, p.target.x, y - 5);
    }
}

registerGame({
    id: 'shuriken_showdown',
    name: 'SHURIKEN SHOWDOWN',
    icon: '🥷',
    color: '#fb7185',
    players: 2,
    description: 'Lancez vos shurikens d\'un mouvement sec du bras.',
    class: ShurikenShowdown
});