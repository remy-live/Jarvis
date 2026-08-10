import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../core/GameOverModal.js';

export class FlappySquat extends Game {
    constructor(game) {
        super(game);
        this.game = game;
        this.id = 'flappy_squat';
        this.name = 'FLAPPY SQUAT DUO';
        this.color = '#fbbf24'; 
        this.isMenu = false;

        this.modal = new GameOverModal(this.game);

        this.gameState = 'WAITING'; 
        this.speed = 220; 
        this.groundHeight = 80; 
        
        // Calibration Squat
        this.squatRangeMin = 0.35; 
        this.squatRangeMax = 0.75; 

        this.clouds = [];
        this.initClouds();
        this.groundScroll = 0;
        this.playersState = [];
    }

    initClouds() {
        this.clouds = [];
        for(let i=0; i<12; i++) {
            this.clouds.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * (window.innerHeight * 0.6),
                scale: 0.3 + Math.random() * 1.0,
                speed: 5 + Math.random() * 25,
                opacity: 0.4 + Math.random() * 0.4
            });
        }
    }

    enter() {
        // --- LIBERTÉ TOTALE ---
        // pose: true  -> Pour l'oiseau (épaules)
        // hands: true -> Pour le curseur (index)
        this.gameConfig = { cameraMode: 'fullscreen', pose: true, face: false, hands: true };
        this.setup(this.gameConfig);
        this.reset();
    }
    
    exit() {
        this.clearTimers();
        this.playersState = [];
        if(this.modal) this.modal.hide();
    }

    reset() {
        this.gameState = 'WAITING';
        this.playersState = [
            // J1 : Jaune (Poussin)
            this.createPlayerState(0, '#fbbf24', '#e67e22'), 
            // J2 : Rouge (Perroquet)
            this.createPlayerState(1, '#fb7185', '#2c3e50') 
        ];
        this.pipeSpawnTimer = -2.0; 
        this.pipeFrequency = 2.2; 
        this.modal.hide();
    }

    createPlayerState(id, bodyColor, wingColor) {
        const h = window.innerHeight;
        const halfW = window.innerWidth / 2;

        return {
            id: id,
            color: bodyColor,     // Couleur du corps
            wingColor: wingColor, // Couleur de l'aile
            score: 0,
            alive: true,
            bird: {
                x: halfW * 0.25, 
                y: h / 2,
                width: 50, height: 40, targetY: h / 2, 
                rotation: 0,
                wingAngle: 0,     // Angle de l'aile
                flapSpeed: 0.2    // Vitesse de battement
            },
            pipes: [],
            particles: []
        };
    }

    spawnParticles(pState, x, y, type) {
        const count = (type === 'score') ? 15 : 30; 
        const baseColor = (type === 'score') ? pState.color : '#ffffff';

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * (type === 'score' ? 150 : 300) + 50; 
            
            pState.particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                gravity: 500, 
                life: 0.5 + Math.random() * 0.5, 
                maxLife: 1.0,
                color: type === 'death' ? '#bdc3c7' : baseColor,
                size: Math.random() * 8 + 4,
                type: type
            });
        }
    }

    updateParticles(pState, dt) {
        for (let i = pState.particles.length - 1; i >= 0; i--) {
            const p = pState.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += p.gravity * dt; 
            p.life -= dt;
            if (p.life <= 0) pState.particles.splice(i, 1);
        }
    }

    update(dt) {
        // NOTE: On ne return PAS si la modale est visible, pour que le curseur puisse bouger
        // Mais on fige le jeu (pipes)

        const inputs = this.game.inputs;
        const w = this.game.display.uiCanvas.width;
        const h = this.game.display.uiCanvas.height;
        const halfW = w / 2;

        // Scrolling (Seulement si pas de modale)
        if (!this.modal.isVisible) {
            this.groundScroll = (this.groundScroll + this.speed * dt) % 40; 
            this.clouds.forEach(c => {
                 c.x -= c.speed * dt;
                 if(c.x < -150) c.x = w + 50;
            });
        }

        let activePlayersDetected = 0;
        let activePlayersAlive = 0;
        let readyCount = 0;

        for (let i = 0; i < 2; i++) {
            const pState = this.playersState[i];
            const inputPlayer = inputs.players[i];
            const isDetected = inputPlayer && inputPlayer.detected;

            if (isDetected) activePlayersDetected++;
            if (isDetected && pState.alive) activePlayersAlive++;

            this.updateParticles(pState, dt);

            // --- INPUT SQUAT (Strictement sur les épaules) ---
            let poseFound = false;
            let ratio = 0.5;

            // On vérifie spécifiquement la POSE (ignorer la main)
            if (isDetected && (inputPlayer.poseLandmarks || (inputPlayer.pose && inputPlayer.pose.raw))) {
                 const lm = inputPlayer.poseLandmarks || inputPlayer.pose.raw;
                 // Epaules
                 if (lm[11] && lm[12]) {
                     const shouldersY = (lm[11].y + lm[12].y) / 2;
                     ratio = (shouldersY - this.squatRangeMin) / (this.squatRangeMax - this.squatRangeMin);
                     ratio = Math.max(0, Math.min(1, ratio));
                     poseFound = true;
                 }
            } 
            // NOTE : Pas de fallback sur inputPlayer.y ici car inputPlayer.y est la main (curseur)

            if (poseFound) {
                const playableHeight = h - this.groundHeight - pState.bird.height - 20;
                
                if (pState.alive && !this.modal.isVisible) {
                    pState.bird.targetY = 20 + ratio * playableHeight;
                }
                
                if (this.gameState === 'WAITING' && ratio > 0.15) readyCount++;
            } else {
                if (this.gameState === 'WAITING') pState.bird.targetY = h / 2;
            }

            // Physique et Animation de l'oiseau
            this.updateBirdPhysics(pState, dt);

            // Logique de jeu (tuyaux)
            if (this.gameState === 'PLAYING' && !this.modal.isVisible) {
                if (pState.alive) {
                    this.updatePipes(pState, dt, halfW, h);
                } else {
                    // Chute libre
                    if (pState.bird.y < h - this.groundHeight) {
                        pState.bird.y += 500 * dt;
                        pState.bird.rotation += dt * 5; 
                    }
                }
            }
        }

        if (this.gameState === 'WAITING' && readyCount > 0 && !this.modal.isVisible) {
            this.gameState = 'PLAYING';
            this.pipeSpawnTimer = -1.5; 
        }

        if (this.gameState === 'PLAYING' && activePlayersDetected > 0 && activePlayersAlive === 0) {
            this.triggerGameOver();
        }

        if (this.gameState === 'PLAYING' && !this.modal.isVisible) {
            this.pipeSpawnTimer += dt;
            if (this.pipeSpawnTimer >= this.pipeFrequency) {
                this.spawnSynchronizedPipes(halfW, h);
                this.pipeSpawnTimer = 0;
            }
        }
    }

    triggerGameOver() {
        this.gameState = 'GAMEOVER';
        if(this.game.playSound) this.game.playSound('hit');

        this.after(1000, () => {
            const scores = { p1: this.playersState[0].score, p2: this.playersState[1].score };
            // On affiche la modale mais ON NE CHANGE PAS LA CONFIG (on garde hands: true)
            this.modal.show(scores, this.gameConfig, () => this.reset());
        }, 1000);
    }

    updateBirdPhysics(pState, dt) {
        const b = pState.bird;
        
        // Mouvement Vertical (Lissage)
        if (!isNaN(b.targetY) && pState.alive && !this.modal.isVisible) {
            b.y += (b.targetY - b.y) * 0.18;
            b.rotation = (b.targetY - b.y) * 0.005; 
        }

        // Animation de l'aile (Battement Sinusoïdal)
        // Plus il monte, plus il bat vite
        const flapSpeed = (b.targetY < b.y) ? 20 : 10; 
        b.flapSpeed += dt * flapSpeed;
        b.wingAngle = Math.sin(b.flapSpeed) * 0.5; // Oscille entre -0.5 et 0.5 radians
    }
    
    updatePipes(pState, dt, zoneWidth, zoneHeight) {
        for (let i = pState.pipes.length - 1; i >= 0; i--) {
            const pipe = pState.pipes[i];
            pipe.x -= this.speed * dt;

            if (!pipe.passed && pipe.x + pipe.width < pState.bird.x) {
                pState.score++;
                pipe.passed = true;
                if(pState.id === 0 && this.game.playSound) this.game.playSound('select'); 
                const particleY = pipe.type === 'top' ? pipe.y + pipe.height + 50 : pipe.y - 50;
                this.spawnParticles(pState, pState.bird.x, particleY, 'score');
            }

            if (pipe.x + pipe.width < 0) pState.pipes.splice(i, 1);
            
            const p = 10; 
            const bx = pState.bird.x + p, by = pState.bird.y + p;
            const bw = pState.bird.width - p*2, bh = pState.bird.height - p*2;
            
            if (bx < pipe.x + pipe.width && bx + bw > pipe.x && by < pipe.y + pipe.height && by + bh > pipe.y) {
                 this.triggerDeath(pState);
            }
        }
        if (pState.bird.y + pState.bird.height > zoneHeight - this.groundHeight) {
             if (pState.alive) this.triggerDeath(pState);
        }
    }
    
    triggerDeath(pState) {
        pState.alive = false;
        this.spawnParticles(pState, pState.bird.x, pState.bird.y, 'death');
    }
    
    spawnSynchronizedPipes(zoneWidth, zoneHeight) {
        const gapSize = 240;
        const minY = 80;
        const maxY = zoneHeight - this.groundHeight - gapSize - 80;
        const gapY = Math.random() * (maxY - minY) + minY;
        for(let i=0; i<2; i++) {
            if(!this.playersState[i].alive) continue;
            this.playersState[i].pipes.push({ x: zoneWidth, y: 0, width: 70, height: gapY, type: 'top', passed: false });
            this.playersState[i].pipes.push({ x: zoneWidth, y: gapY + gapSize, width: 70, height: zoneHeight - this.groundHeight - (gapY + gapSize), type: 'bottom', passed: false });
        }
    }

    render(display) {
        const ctx = display.ctx;
        const w = display.uiCanvas.width;
        const h = display.uiCanvas.height;
        const halfW = w / 2;

        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, '#3498db'); skyGrad.addColorStop(1, '#87ceeb'); 
        ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, h);

        this.drawClouds(ctx);

        for (let i = 0; i < 2; i++) {
            const pState = this.playersState[i];
            ctx.save();
            ctx.beginPath(); ctx.rect(i * halfW, 0, halfW, h); ctx.clip();
            ctx.translate(i * halfW, 0);

            pState.pipes.forEach(pipe => this.drawPipe(ctx, pipe));
            this.drawGround(ctx, halfW, h);
            this.drawParticles(ctx, pState);

            if (!pState.alive) ctx.filter = 'grayscale(80%) contrast(1.2)';
            
            // DESSIN CARTOON
            this.drawCartoonBird(ctx, pState.bird, pState.color, pState.wingColor);
            
            ctx.filter = 'none';

            if (this.gameState !== 'WAITING') {
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
                ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 4;
                ctx.font = '900 70px Arial'; ctx.textAlign = 'center';
                ctx.strokeText(pState.score, halfW / 2, 120);
                ctx.fillText(pState.score, halfW / 2, 120);
                ctx.restore();
            }
            ctx.restore();
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.fillRect(halfW - 2, 0, 4, h);
        this.drawGlobalUI(ctx, w, h);
    }
    
    // --- NOUVEAU DESSIN D'OISEAU ANIMÉ ---
    drawCartoonBird(ctx, b, bodyColor, wingColor) {
        ctx.save();
        ctx.translate(b.x + b.width/2, b.y + b.height/2);
        ctx.rotate(b.rotation);

        // 1. Corps (Ovale)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, b.width/2, b.height/2, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = 'black'; ctx.stroke();

        // 2. Gros Œil Blanc
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(b.width/4, -b.height/4, b.width/3.5, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();

        // 3. Pupille Noire
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(b.width/4 + 2, -b.height/4, b.width/10, 0, Math.PI*2);
        ctx.fill();

        // 4. Bec (Triangle Orange)
        ctx.fillStyle = '#e67e22';
        ctx.beginPath();
        ctx.moveTo(b.width/2, 0); // Pointe
        ctx.lineTo(b.width/2 + 15, 5); 
        ctx.lineTo(b.width/2, 10);
        ctx.fill(); ctx.stroke();

        // 5. Aile (Mobile !)
        ctx.save();
        // On se place un peu en arrière pour l'aile
        ctx.translate(-b.width/4, 5);
        // On applique la rotation du battement
        ctx.rotate(b.wingAngle);
        
        ctx.fillStyle = wingColor;
        ctx.beginPath();
        // Forme d'aile (ellipse aplatie)
        ctx.ellipse(10, 0, 15, 10, 0, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    drawParticles(ctx, pState) {
        pState.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life / p.maxLife; 
            ctx.translate(p.x, p.y);
            // Petit carré qui tourne
            ctx.rotate(p.life * 10);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        });
    }
    
    // UI Globale
    drawGlobalUI(ctx, w, h) {
        if (this.modal.isVisible) return; 

        ctx.textAlign = 'center';
        if (this.gameState === 'WAITING') {
             ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(w/2 - 300, h/2 - 60, 600, 120);
             ctx.fillStyle = '#fbbf24'; ctx.font = '900 40px Arial';
             ctx.fillText("SQUATTEZ POUR DÉMARRER !", w/2, h/2 + 15);
        }
    }
    
    drawPipe(ctx, p) { 
        const grad = ctx.createLinearGradient(p.x, 0, p.x + p.width, 0);
        grad.addColorStop(0, '#558c22'); grad.addColorStop(0.3, '#9ce659'); grad.addColorStop(1, '#73bf2e'); 
        ctx.fillStyle = grad; ctx.fillRect(p.x, p.y, p.width, p.height);
        ctx.strokeStyle = '#2d4d12'; ctx.lineWidth = 4; ctx.strokeRect(p.x, p.y, p.width, p.height);
        
        const capH = 40; const capY = (p.type === 'top') ? p.height - capH : p.y;
        ctx.fillStyle = grad; ctx.fillRect(p.x - 4, capY, p.width + 8, capH);
        ctx.strokeRect(p.x - 4, capY, p.width + 8, capH);
    }

    drawGround(ctx, w, h) { 
        ctx.fillStyle = '#ded895'; ctx.fillRect(0, h - this.groundHeight, w, this.groundHeight); 
        ctx.fillStyle = '#73bf2e'; ctx.fillRect(0, h - this.groundHeight, w, 20);
    }

    drawClouds(ctx) { 
        this.clouds.forEach(c => {
            ctx.save(); ctx.globalAlpha = c.opacity; ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(c.x, c.y, 30*c.scale, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        });
    }
}

registerGame({
    id: 'flappy_squat',
    name: 'FLAPPY SQUAT',
    icon: '🦅',
    color: '#facc15',
    players: 2,
    description: 'Accroupissez-vous pour faire descendre l\'oiseau.',
    class: FlappySquat
});