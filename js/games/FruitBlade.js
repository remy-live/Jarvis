import { Game } from '../core/Game.js';
import { Registry } from '../core/GameRegistry.js';

// --- CLASSE LAME ---
class Blade {
    constructor(color) {
        this.points = []; 
        this.color = color;
        this.maxLength = 12; 
    }

    update(x, y, dt) {
        this.points.unshift({ x, y, life: 1.0 });
        if (this.points.length > this.maxLength) this.points.pop();
        this.points.forEach(p => p.life -= dt * 8); 
        this.points = this.points.filter(p => p.life > 0);
    }

    draw(ctx) {
        if (this.points.length < 2) return;
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowBlur = 20; ctx.shadowColor = this.color;

        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i+1];
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
            
            ctx.strokeStyle = "white"; 
            ctx.globalAlpha = p1.life;
            ctx.lineWidth = 15 * p1.life; 
            ctx.stroke();
            
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 20 * p1.life;
            ctx.globalAlpha = p1.life * 0.5;
            ctx.stroke();
        }
        ctx.restore();
    }
}

// --- CLASSE FRUIT ---
class Fruit {
    constructor(w, h, side) {
        this.active = true;
        this.side = side; 
        
        const safeZoneWidth = 200; 
        const centerX = w / 2;
        const quarterW = w / 4; 
        const threeQuarterW = w * 0.75; 

        const spawnMargin = 50;
        
        if (side === 'left') {
            const maxLeft = centerX - (safeZoneWidth / 2);
            this.x = Math.random() * (maxLeft - spawnMargin * 2) + spawnMargin;
            this.vx = (quarterW - this.x) * (0.001 + Math.random() * 0.001);
        } else {
            const minRight = centerX + (safeZoneWidth / 2);
            this.x = Math.random() * (w - minRight - spawnMargin) + minRight;
            this.vx = (threeQuarterW - this.x) * (0.001 + Math.random() * 0.001);
        }

        this.y = h + 150;

        // Vitesses exprimées en pixels/seconde (et non par frame) :
        // le jeu se comporte pareil sur un écran 60 Hz ou 144 Hz.
        this.vx *= 60;
        this.vy = -(Math.random() * 5 + 13) * 60;
        this.gravity = 0.2 * 3600;

        this.rotation = 0;
        this.rotSpeed = (Math.random() - 0.5) * 0.05 * 60;

        const types = [
            { icon: '🍉', color: '#ff4757', score: 10 },
            { icon: '🍌', color: '#f1c40f', score: 10 },
            { icon: '🍍', color: '#f39c12', score: 20 },
            { icon: '🥥', color: '#ecf0f1', score: 30 },
            { icon: '💣', color: '#000000', score: -50, isBomb: true }
        ];
        
        const typeIdx = Math.random() > 0.85 ? 4 : Math.floor(Math.random() * 4);
        this.data = types[typeIdx];
        
        this.size = 130; 
        this.hitbox = 90;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += this.gravity * dt;
        this.rotation += this.rotSpeed * dt;

        if (this.y > window.innerHeight + 300) {
            this.active = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        ctx.font = "130px Arial"; 
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.strokeText(this.data.icon, 0, 10);
        
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 20;
        
        ctx.fillText(this.data.icon, 0, 10); 
        ctx.restore();
    }
}

// --- JEU PRINCIPAL ---
export class FruitBlade extends Game {
    constructor(game) {
        super(game);
        this.game = game;
        this.id = 'fruit_blade';
        this.name = 'FRUIT BLADE';
        
        this.ctx = this.game.display.ctx;
        this.fruits = [];
        this.particles = [];
        this.blades = [new Blade('#00ffff'), new Blade('#ff00ff')]; 
        
        this.scores = [0, 0];
        this.timer = 60; 
        this.spawnTimer = 0;
        this.state = 'WAITING';
    }

    enter() {
        if(this.game.display.uiCanvas) {
            this.game.display.uiCanvas.style.backgroundColor = 'transparent';
            this.game.display.uiCanvas.style.display = 'block';
            this.game.display.uiCanvas.style.zIndex = '10'; 
        }
        this.game.display.setBackground("transparent");
        
        // --- BOOST RÉACTIVITÉ CURSEUR ---
        // Plus proche de 1.0 = Plus rapide (moins de lissage)
        // 0.85 est un bon compromis pour Fruit Ninja (très réactif mais pas tremblant)
        if(this.game.inputs.setSmoothing) {
            this.game.inputs.setSmoothing(0.85); 
        }

        this.setup({ cameraMode: 'fullscreen', hands: true, pose: false, face: false });
        
        this.fruits = [];
        this.particles = [];
        this.scores = [0, 0];
        this.timer = 60;
        this.state = 'WAITING';
    }

    createSplatter(x, y, color) {
        const count = 20; 
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 25 * 60,
                vy: (Math.random() - 0.5) * 25 * 60,
                life: 1.0,
                color: color,
                size: Math.random() * 10 + 5
            });
        }
    }

    update(dt) {
        const inputs = this.game.inputs;
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        // 1. INPUT MAINS
        let activePlayers = 0;
        for (let i = 0; i < 2; i++) {
            const player = inputs.players[i];
            
            if (player && player.detected) {
                activePlayers++;
                const bx = player.indexTip ? player.indexTip.x : player.x;
                const by = player.indexTip ? player.indexTip.y : player.y;
                
                this.blades[i].update(bx, by, dt);
                this.checkCollisions(i, bx, by);
            } else {
                this.blades[i].points = [];
            }
        }

        if (this.state === 'WAITING' && activePlayers > 0) {
            this.state = 'PLAYING';
        }

        if (this.state !== 'PLAYING') return;

        // 2. SPAWN
        this.spawnTimer += dt;
        const difficulty = (60 - this.timer) / 60; 
        const spawnRate = 1.2 - (difficulty * 0.7); 
        
        if (this.spawnTimer > spawnRate) {
            const randomSide = Math.random() > 0.5 ? 'left' : 'right';
            if (difficulty > 0.5 && Math.random() > 0.7) {
                this.fruits.push(new Fruit(w, h, 'left'));
                this.fruits.push(new Fruit(w, h, 'right'));
            } else {
                this.fruits.push(new Fruit(w, h, randomSide));
            }
            this.spawnTimer = 0;
        }

        // 3. PHYSIQUE
        this.fruits.forEach(f => f.update(dt));
        this.fruits = this.fruits.filter(f => f.active);

        // Particules
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 0.3 * 3600 * dt;
            p.life -= dt * 2.0;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 0;
            this.state = 'GAMEOVER';
            // `after` est annulé si on quitte le jeu entre-temps
            this.after(5000, () => this.enter());
        }
    }

    exit() {
        this.clearTimers();
        this.fruits = [];
        this.particles = [];
        this.blades.forEach(b => { b.points = []; });
        this.game.inputs.setSmoothing(0.75);
    }

    checkCollisions(playerId, bx, by) {
        const blade = this.blades[playerId];
        if (blade.points.length < 2) return;

        const p1 = blade.points[0]; 
        const p2 = blade.points[1]; 
        const speed = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        
        if (speed < 5) return; 

        for (const fruit of this.fruits) {
            const dist = Math.hypot(fruit.x - bx, fruit.y - by);
            if (dist < fruit.hitbox) {
                if ((playerId === 0 && fruit.side === 'left') || (playerId === 1 && fruit.side === 'right')) {
                    this.sliceFruit(fruit, playerId);
                    fruit.active = false; 
                }
            }
        }
    }

    sliceFruit(fruit, playerId) {
        if (fruit.data.isBomb) {
            this.scores[playerId] = Math.max(0, this.scores[playerId] + fruit.data.score);
            this.createSplatter(fruit.x, fruit.y, '#000000');
            this.game.display.gameLayer.style.backgroundColor = 'rgba(255,0,0,0.4)';
            setTimeout(() => this.game.display.gameLayer.style.backgroundColor = '', 100);
            
            if (this.game.audio) this.game.audio.playSFX('crunch'); 
        } else {
            this.scores[playerId] += fruit.data.score;
            this.createSplatter(fruit.x, fruit.y, fruit.data.color);
            
            this.particles.push({
                x: fruit.x, y: fruit.y,
                vx: 0, vy: -3,
                life: 1.0,
                text: `+${fruit.data.score}`,
                color: '#fff',
                isText: true
            });

            if (this.game.audio) this.game.audio.playSFX('select'); 
        }
    }

    render(display) {
        const ctx = display.ctx;
        const w = display.uiCanvas.width;
        const h = display.uiCanvas.height;

        // 1. Nettoyage
        ctx.clearRect(0, 0, w, h);

        // 2. Filtre
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; 
        ctx.fillRect(0, 0, w, h);

        // 3. Ligne centrale pointillée
        const midX = w / 2;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(midX, 0);
        ctx.lineTo(midX, h);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.setLineDash([20, 30]); 
        ctx.stroke();
        ctx.restore();

        // 4. Éléments
        this.particles.forEach(p => {
            ctx.globalAlpha = p.life;
            if (p.isText) {
                ctx.fillStyle = p.color;
                ctx.font = "bold 50px Arial";
                ctx.strokeStyle = "black"; ctx.lineWidth = 3;
                ctx.strokeText(p.text, p.x, p.y);
                ctx.fillText(p.text, p.x, p.y);
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
            }
        });
        ctx.globalAlpha = 1.0;

        this.fruits.forEach(f => f.draw(ctx));
        this.blades.forEach(b => b.draw(ctx));

        // --- 5. HUD CENTRÉ (CORRECTIF) ---
        
        const topY = 70; // Hauteur confortable sous le header transparent
        
        ctx.font = "bold 50px 'Orbitron'";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center"; // IMPORTANT : On centre tout par défaut

        // TIMER (Au milieu absolu)
        ctx.fillStyle = this.timer < 10 ? "#ff4757" : "white";
        ctx.shadowColor = "black"; ctx.shadowBlur = 10;
        ctx.font = "bold 70px 'Orbitron'";
        ctx.fillText(Math.ceil(this.timer), midX, topY);
        
        // SCORE P1 (Centré dans la zone gauche : 25% de la largeur)
        // Reset Font
        ctx.font = "bold 50px 'Orbitron'";
        ctx.fillStyle = "#00ffff"; // Cyan
        ctx.shadowColor = "#00ffff"; ctx.shadowBlur = 15;
        // w * 0.25 = Le centre exact de la moitié gauche
        ctx.fillText(`${this.scores[0]}`, w * 0.25, topY);

        // SCORE P2 (Centré dans la zone droite : 75% de la largeur)
        ctx.fillStyle = "#ff00ff"; // Magenta
        ctx.shadowColor = "#ff00ff";
        // w * 0.75 = Le centre exact de la moitié droite
        ctx.fillText(`${this.scores[1]}`, w * 0.75, topY);

        // Reset Ombres
        ctx.shadowBlur = 0;

        // Messages d'état
        if (this.state === 'WAITING') {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, h/2 - 60, w, 120);
            ctx.textAlign = "center";
            ctx.fillStyle = "white";
            ctx.font = "bold 40px Arial";
            ctx.fillText("👋 AGITEZ POUR JOUER", w/2, h/2 + 5);
        } else if (this.state === 'GAMEOVER') {
            ctx.fillStyle = "rgba(0,0,0,0.85)";
            ctx.fillRect(0, 0, w, h);
            
            ctx.textAlign = "center";
            ctx.fillStyle = "white";
            ctx.font = "bold 90px 'Orbitron'";
            ctx.fillText("FINI !", w/2, h/2 - 30);
            
            let winner = "EGALITE";
            let color = "white";
            if (this.scores[0] > this.scores[1]) { winner = "P1 GAGNE !"; color = "#00ffff"; }
            if (this.scores[1] > this.scores[0]) { winner = "P2 GAGNE !"; color = "#ff00ff"; }
            
            ctx.fillStyle = color;
            ctx.shadowColor = color; ctx.shadowBlur = 20;
            ctx.font = "bold 60px Arial";
            ctx.fillText(winner, w/2, h/2 + 70);
        }
    }
}

Registry.register('fruit_blade', "FRUIT BLADE", FruitBlade, "#e74c3c");