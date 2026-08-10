import { Game } from '../core/Game.js';
import { Registry } from '../core/GameRegistry.js';

export class NeonBrickBattle extends Game {
    constructor(game) {
        super(game);
        this.game = game;
        this.id = 'neon_bricks_vs';
        this.name = 'NEON BATTLE HIGH-VIZ';
        this.isMenu = false;

        // --- Config ---
        this.paddleW = 25; 
        this.paddleH = 140; 
        this.ballRadius = 14; // Un tout petit peu plus grosse pour la lisibilité
        this.ballSpeedBase = 600; 

        // --- État ---
        this.state = 'WAITING_P2'; 
        this.ball = { x: 0, y: 0, vx: 0, vy: 0, trail: [] };
        this.ballSpeed = this.ballSpeedBase;
        
        this.p1 = { score: 0, lives: 5, x: 0, y: 0, color: '#00ffff' }; 
        this.p2 = { score: 0, lives: 5, x: 0, y: 0, color: '#ff00ff' };
        this.winner = null;

        this.bricks = [];
        this.particles = [];
        this.shakeIntensity = 0;

        this.setup({
            cameraMode: 'fullscreen',
            hands: true, 
            face: false, 
            pose: false 
        });
    }

    enter() {
        this.game.display.setBackground("black"); 
        if(this.game.inputs.setSmoothing) this.game.inputs.setSmoothing(0.85);
        this.resetGame();
    }

    resetGame() {
        this.p1.score = 0; this.p1.lives = 5;
        this.p2.score = 0; this.p2.lives = 5;
        this.state = 'WAITING_P2';
        
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;
        
        this.p1.x = 50; 
        this.p1.y = h / 2 - this.paddleH / 2;
        this.p2.x = w - 50 - this.paddleW;
        this.p2.y = h / 2 - this.paddleH / 2;

        this.createBricks();
        this.resetBall();
    }

    createBricks() {
        this.bricks = [];
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;
        
        const cols = 4;
        const rows = 8;
        const brickW = 40;
        const brickH = 60;
        const gap = 15;
        
        const totalW = cols * (brickW + gap);
        const startX = (w - totalW) / 2;
        const startY = (h - (rows * (brickH + gap))) / 2;

        const colors = ['#ff0055', '#55ff00', '#00ffff', '#ffff00'];

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                this.bricks.push({
                    x: startX + c * (brickW + gap),
                    y: startY + r * (brickH + gap),
                    w: brickW,
                    h: brickH,
                    active: true,
                    color: colors[r % 4]
                });
            }
        }
    }

    resetBall(direction = 0) {
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        this.ball.x = w / 2;
        this.ball.y = h / 2;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.trail = []; 
        this.ballSpeed = this.ballSpeedBase;

        this.after(1500, () => {
            if (this.state === 'PLAYING') {
                const dirX = direction === 0 ? (Math.random() > 0.5 ? 1 : -1) : direction;
                const dirY = (Math.random() - 0.5) * 1.5; 
                const len = Math.hypot(dirX, dirY);
                this.ball.vx = (dirX / len);
                this.ball.vy = (dirY / len);
            }
        });
    }

    spawnParticles(x, y, color, count = 12) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 600,
                vy: (Math.random() - 0.5) * 600,
                life: 1.0,
                color: color,
                size: Math.random() * 10 + 4,
                rotation: Math.random() * Math.PI,
                rotSpeed: (Math.random() - 0.5) * 10 
            });
        }
    }

    triggerShake(intensity) {
        this.shakeIntensity = intensity;
    }

    update(dt) {
        if (this.shakeIntensity > 0) {
            this.shakeIntensity -= dt * 30; 
            if (this.shakeIntensity < 0) this.shakeIntensity = 0;
        }

        const inputs = this.game.inputs;
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        // 1. RAQUETTES
        const updatePaddle = (playerObj, inputData, isLeft) => {
            if (inputData && inputData.detected) {
                const sourcePos = inputData.handCenter ? inputData.handCenter : inputData;
                const targetY = sourcePos.y - this.paddleH / 2;
                const targetXRaw = sourcePos.x - this.paddleW / 2;
                let targetX = targetXRaw;

                if (isLeft) targetX = Math.max(0, Math.min(w * 0.35, targetXRaw));
                else targetX = Math.max(w * 0.65, Math.min(w - this.paddleW, targetXRaw));

                const clampedY = Math.max(0, Math.min(h - this.paddleH, targetY));
                
                playerObj.y += (clampedY - playerObj.y) * 25 * dt;
                playerObj.x += (targetX - playerObj.x) * 25 * dt;
            }
        };

        updatePaddle(this.p1, inputs.players[0], true);
        updatePaddle(this.p2, inputs.players[1], false);

        if (this.state === 'WAITING_P2') {
            if (inputs.players[0].detected && inputs.players[1].detected) {
                this.state = 'PLAYING';
                this.resetBall();
            }
            return;
        }

        if (this.state !== 'PLAYING') return;

        // 2. PHYSIQUE BALLE
        if (this.ball.vx === 0) return;

        this.ball.trail.unshift({ x: this.ball.x, y: this.ball.y });
        if (this.ball.trail.length > 10) this.ball.trail.pop();

        let nextX = this.ball.x + this.ball.vx * this.ballSpeed * dt;
        let nextY = this.ball.y + this.ball.vy * this.ballSpeed * dt;

        // A. Murs
        if (nextY - this.ballRadius < 0) {
            nextY = this.ballRadius;
            this.ball.vy *= -1;
            this.triggerShake(5);
        } else if (nextY + this.ballRadius > h) {
            nextY = h - this.ballRadius;
            this.ball.vy *= -1;
            this.triggerShake(5);
        }

        // B. Raquettes
        const checkPaddleCollision = (player) => {
            if (nextX + this.ballRadius > player.x && 
                nextX - this.ballRadius < player.x + this.paddleW &&
                nextY + this.ballRadius > player.y && 
                nextY - this.ballRadius < player.y + this.paddleH) {
                
                const isFrontHit = (this.ball.vx < 0 && nextX > player.x + this.paddleW/2) || 
                                   (this.ball.vx > 0 && nextX < player.x + this.paddleW/2);

                if (isFrontHit) {
                    this.ball.vx *= -1;
                    if (this.ball.vx > 0) nextX = player.x + this.paddleW + this.ballRadius + 2;
                    else nextX = player.x - this.ballRadius - 2;
                } else {
                    this.ball.vy *= -1;
                }

                const hitPos = (nextY - (player.y + this.paddleH/2)) / (this.paddleH/2);
                this.ball.vy += hitPos * 0.8; 
                this.normalizeBall();
                
                this.ballSpeed += 25; 
                
                this.triggerShake(10);
                this.spawnParticles(nextX, nextY, "white", 5);
                
                if(this.game.audio) this.game.audio.playSFX('select');
                return true;
            }
            return false;
        };

        if (!checkPaddleCollision(this.p1)) checkPaddleCollision(this.p2);

        // C. Briques
        if (nextX > w * 0.2 && nextX < w * 0.8) {
            for (let i = 0; i < this.bricks.length; i++) {
                const b = this.bricks[i];
                if (!b.active) continue;

                if (nextX > b.x && nextX < b.x + b.w &&
                    nextY > b.y && nextY < b.y + b.h) {
                    
                    b.active = false;
                    this.ball.vx *= -1; 
                    
                    if (this.ball.vx > 0) this.p1.score += 10;
                    else this.p2.score += 10;

                    this.triggerShake(15);
                    this.spawnParticles(b.x + b.w/2, b.y + b.h/2, b.color, 15);
                    
                    if(this.game.audio) this.game.audio.playSFX('crunch');
                    break; 
                }
            }
        }

        if (this.bricks.every(b => !b.active)) {
            this.createBricks();
            this.ballSpeed += 50;
        }

        // D. Buts
        if (nextX < 0) {
            this.p1.lives--;
            if (this.p1.lives <= 0) this.endGame("JOUEUR ROSE (DROITE)");
            else this.resetBall(1); 
            this.triggerShake(20); 
            return;
        } 
        else if (nextX > w) {
            this.p2.lives--;
            if (this.p2.lives <= 0) this.endGame("JOUEUR CYAN (GAUCHE)");
            else this.resetBall(-1);
            this.triggerShake(20);
            return;
        }

        this.ball.x = nextX;
        this.ball.y = nextY;

        // 3. Update Particules
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rotation += p.rotSpeed * dt; 
            p.life -= dt * 2.5;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    normalizeBall() {
        const len = Math.hypot(this.ball.vx, this.ball.vy);
        this.ball.vx /= len;
        this.ball.vy /= len;
    }

    endGame(winnerName) {
        this.state = 'GAMEOVER';
        this.winner = winnerName;
        this.after(5000, () => { if (this.state === 'GAMEOVER') this.enter(); });
    }

    render(display) {
        const ctx = display.ctx;
        const w = display.uiCanvas.width;
        const h = display.uiCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // SHAKE
        ctx.save();
        if (this.shakeIntensity > 0.5) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            ctx.translate(dx, dy);
        }

        // Ligne
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([10, 15]);
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; 
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        // Raquettes
        this.drawGlowRect(ctx, this.p1.x, this.p1.y, this.paddleW, this.paddleH, this.p1.color);
        this.drawGlowRect(ctx, this.p2.x, this.p2.y, this.paddleW, this.paddleH, this.p2.color);

        // Briques
        this.bricks.forEach(b => {
            if (b.active) this.drawGlowRect(ctx, b.x, b.y, b.w, b.h, b.color, 10);
        });

        // --- TRAÎNÉE VISIBLE ---
        // On dessine la traînée avec une ombre noire pour qu'elle se voie sur fond clair
        if (this.ball.trail.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(this.ball.trail[0].x, this.ball.trail[0].y);
            for (let i = 1; i < this.ball.trail.length; i++) {
                ctx.lineTo(this.ball.trail[i].x, this.ball.trail[i].y);
            }
            
            ctx.shadowColor = "black";
            ctx.shadowBlur = 5;
            
            const grad = ctx.createLinearGradient(this.ball.x, this.ball.y, this.ball.trail[this.ball.trail.length-1].x, this.ball.trail[this.ball.trail.length-1].y);
            grad.addColorStop(0, "rgba(255,255,255,0.9)");
            grad.addColorStop(1, "rgba(255,255,255,0)");
            
            ctx.strokeStyle = grad;
            ctx.lineWidth = this.ballRadius * 0.8;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();
            ctx.restore();
        }

        // --- BALLE HAUTE VISIBILITÉ (DOUBLE CONTRASTE) ---
        // Visible sur fond Noir ET sur fond Blanc
        ctx.save();
        
        // 1. Fond Noir (plus large que la balle)
        ctx.fillStyle = "black";
        ctx.beginPath(); 
        ctx.arc(this.ball.x, this.ball.y, this.ballRadius, 0, Math.PI*2);
        ctx.fill();

        // 2. Cœur Blanc (un peu plus petit)
        ctx.fillStyle = "white";
        ctx.shadowColor = "white"; ctx.shadowBlur = 15; // Glow néon
        ctx.beginPath(); 
        ctx.arc(this.ball.x, this.ball.y, this.ballRadius * 0.7, 0, Math.PI*2);
        ctx.fill();
        
        // 3. Contour Noir (pour couper le glow au centre et faire "propre")
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();

        // Particules
        this.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            
            // Ombre portée noire pour voir les particules sur fond clair
            ctx.shadowColor = "black"; 
            ctx.shadowBlur = 2;
            
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        });

        ctx.restore(); 

        // UI
        ctx.save();
        ctx.font = "bold 40px 'Orbitron'";
        
        ctx.textAlign = "left";
        ctx.fillStyle = this.p1.color;
        ctx.shadowColor = "black"; ctx.shadowBlur = 4; // Ombre noire pour le texte
        ctx.fillText(`P1: ${this.p1.lives} ❤`, 50, 60);
        ctx.fillText(`${this.p1.score}`, 50, 110);

        ctx.textAlign = "right";
        ctx.fillStyle = this.p2.color;
        ctx.fillText(`❤ ${this.p2.lives}`, w - 50, 60);
        ctx.fillText(`${this.p2.score}`, w - 50, 110);

        ctx.shadowBlur = 0;

        ctx.textAlign = "center";
        if (this.state === 'WAITING_P2') {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, h/2 - 50, w, 100);
            ctx.fillStyle = "white";
            ctx.fillText("EN ATTENTE : LEVEZ LES MAINS 👋", w/2, h/2 + 15);
        } else if (this.state === 'GAMEOVER') {
            ctx.fillStyle = "rgba(0,0,0,0.85)";
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "white";
            ctx.font = "bold 60px 'Orbitron'";
            ctx.fillText("VICTOIRE !", w/2, h/2 - 20);
            ctx.fillStyle = this.winner.includes("GAUCHE") ? this.p1.color : this.p2.color;
            ctx.fillText(this.winner, w/2, h/2 + 60);
        }
        ctx.restore();
    }

    drawGlowRect(ctx, x, y, w, h, color, blur = 20) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        
        // Bordure blanche + Ombre noire interne pour contraste max
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        
        ctx.fillStyle = "rgba(0,0,0,0.2)"; // Légèrement sombre dedans pour la transparence
        ctx.fillRect(x, y, w, h);
        
        ctx.restore();
    }

    exit() {
        this.clearTimers();
        this.bricks = [];
        this.particles = [];
        this.ball.trail = [];
        if(this.game.inputs.setSmoothing) this.game.inputs.setSmoothing(0.75);
    }
}

Registry.register('neon_bricks_vs', "NEON BATTLE 2D", NeonBrickBattle, "#00ffff");