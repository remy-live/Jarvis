import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../core/GameOverModal.js';

export class NeonInvaders extends Game {
    constructor(game) {
        super(game);
        this.game = game;
        this.id = 'neon_invaders';
        this.name = 'NEON INVADERS';
        this.isMenu = false;

        this.modal = new GameOverModal(this.game);

        // --- Config ---
        this.shipSpeed = 15; 
        this.fireRate = 0.2; 
        this.superLaserDuration = 2.0;
    }

    enter() {
        // CONFIG : Pose (Mouvement) + Hands (Super Laser)
        this.gameConfig = { cameraMode: 'fullscreen', pose: true, face: false, hands: true };
        this.setup(this.gameConfig);
        this.reset();
    }

    exit() {
        this.clearTimers();
        if(this.modal) this.modal.hide();
    }

    reset() {
        this.state = 'WAITING'; // WAITING, PLAYING, GAMEOVER
        this.score = 0;
        this.lives = 3;
        this.wave = 1;

        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        // Vaisseau
        this.ship = {
            x: w / 2,
            y: h - 80,
            width: 40, height: 40,
            color: '#7dd3fc',
            superMode: false,
            superTimer: 0,
            cooldown: 0
        };

        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.stars = [];

        // Création des étoiles de fond
        for(let i=0; i<50; i++) {
            this.stars.push({
                x: Math.random() * w,
                y: Math.random() * h,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 2 + 0.5
            });
        }

        this.spawnWave();
        this.fireTimer = 0;
        this.modal.hide();
    }

    spawnWave() {
        this.enemies = [];
        // Difficulté progressive
        const rows = 3 + Math.min(3, Math.floor(this.wave / 2));
        const cols = 6 + Math.min(4, Math.floor(this.wave / 3));
        
        const startX = 50;
        const startY = 50;
        const gapX = 60;
        const gapY = 50;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this.enemies.push({
                    x: startX + c * gapX,
                    y: startY + r * gapY,
                    w: 30, h: 30,
                    type: r % 2 === 0 ? '👾' : '👽',
                    alive: true,
                    startX: startX + c * gapX,
                    offsetX: 0
                });
            }
        }
    }

    update(dt) {
        if (this.modal.isVisible) return;

        const inputs = this.game.inputs;
        const w = this.game.display.virtW;
        const h = this.game.display.virtH;

        // 1. INPUTS
        const player = inputs.players[0];
        let targetX = this.ship.x;
        let handsUp = false;

        if (player && player.detected) {
            const lm = player.pose && player.pose.raw;

            if (lm && lm[0]) {
                // Landmarks bruts (repère caméra) : on applique le miroir
                targetX = (1 - lm[0].x) * w;
            } else {
                // player.x est DÉJÀ en pixels écran et déjà miroité :
                // le réinverser mettait les commandes à l'envers.
                targetX = player.x;
            }

            // Détection "MAINS EN L'AIR" (Super Laser)
            // Poignets (15, 16) au-dessus du nez (0). En Y, 0 = haut de l'image,
            // donc "poignets < nez" signifie bien bras levés.
            if (lm && lm[0] && lm[15] && lm[16]) {
                const wristsY = (lm[15].y + lm[16].y) / 2;
                if (wristsY < lm[0].y) handsUp = true;
            }
        }

        // Lissage du vaisseau
        this.ship.x += (targetX - this.ship.x) * 10 * dt;
        this.ship.x = Math.max(30, Math.min(w - 30, this.ship.x));

        // Activation Super Laser
        if (handsUp && this.ship.cooldown <= 0) {
            this.ship.superMode = true;
            this.ship.superTimer = this.superLaserDuration;
            this.ship.cooldown = 10; 
            if(this.game.audio) this.game.audio.playSFX('select'); 
        }

        if (this.ship.superMode) {
            this.ship.superTimer -= dt;
            if (this.ship.superTimer <= 0) this.ship.superMode = false;
        }
        if (this.ship.cooldown > 0) this.ship.cooldown -= dt;


        if (this.state === 'WAITING') {
            if (player && player.detected) this.state = 'PLAYING';
            return;
        }

        // 2. TIRS
        this.fireTimer += dt;
        const currentFireRate = this.ship.superMode ? 0.05 : this.fireRate;
        
        if (this.fireTimer > currentFireRate) {
            this.fireTimer = 0;
            this.bullets.push({
                x: this.ship.x,
                y: this.ship.y - 20,
                vx: 0,
                vy: -600,
                isSuper: this.ship.superMode,
                w: this.ship.superMode ? 10 : 4,
                h: 15,
                color: this.ship.superMode ? '#fbbf24' : '#fde68a'
            });
        }

        // 3. PHYSIQUE BALLES
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.y += b.vy * dt;
            
            if (b.y < 0) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Collision Ennemis
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (!e.alive) continue;

                if (b.x > e.x - e.w/2 && b.x < e.x + e.w/2 &&
                    b.y > e.y - e.h/2 && b.y < e.y + e.h/2) {
                    
                    e.alive = false;
                    this.score += 10;
                    this.spawnParticles(e.x, e.y, '#86efac');
                    if(this.game.audio) this.game.audio.playSFX('crunch');

                    if (!b.isSuper) {
                        this.bullets.splice(i, 1);
                        break; 
                    }
                }
            }
        }

        // 4. PHYSIQUE ENNEMIS
        const time = Date.now() / 1000;
        let lowestEnemyY = 0;

        this.enemies.forEach(e => {
            if (!e.alive) return;
            // Mouvement latéral sinusoïdal
            e.offsetX = Math.sin(time * 2) * 50; 
            e.x = e.startX + e.offsetX;
            // Descente
            e.y += (10 + this.wave * 2) * dt; 

            if (e.y > lowestEnemyY) lowestEnemyY = e.y;
        });

        this.enemies = this.enemies.filter(e => e.alive);

        if (this.enemies.length === 0) {
            this.wave++;
            this.shipSpeed += 2;
            this.spawnWave();
        }

        // Game Over
        if (lowestEnemyY > this.ship.y - 30) {
            this.triggerGameOver();
        }

        // 5. FX
        this.updateFX(dt, h);
    }

    triggerGameOver() {
        this.state = 'GAMEOVER';
        if(this.game.audio) this.game.audio.playSFX('hit');
        // Appel Modale (Score, Config à restaurer, Callback reset)
        this.after(500, () => {
            this.modal.show(this.score, this.gameConfig, () => this.reset());
        });
    }

    updateFX(dt, h) {
        this.stars.forEach(s => {
            s.y += s.speed * (this.ship.superMode ? 20 : 5);
            if(s.y > h) { s.y = 0; s.x = Math.random() * this.game.display.virtW; }
        });

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if(p.life <= 0) this.particles.splice(i, 1);
        }
    }

    spawnParticles(x, y, color) {
        for(let i=0; i<8; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random()-0.5)*300,
                vy: (Math.random()-0.5)*300,
                life: 0.5,
                color: color,
                size: Math.random()*4+2
            });
        }
    }

    render(display) {
        const ctx = display.ctx;
        const w = display.uiCanvas.width;
        const h = display.uiCanvas.height;

        ctx.clearRect(0,0,w,h);

        // Fond
        ctx.fillStyle = this.ship.superMode ? '#1a001a' : '#000000';
        ctx.globalAlpha = 0.5;
        ctx.fillRect(0,0,w,h);
        ctx.globalAlpha = 1;

        // Etoiles
        ctx.fillStyle = 'white';
        this.stars.forEach(s => {
            ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI*2); ctx.fill();
        });

        if (this.state === 'WAITING') {
            this.drawUI(ctx, w, h, "BOUGEZ POUR START", "GAUCHE/DROITE = BOUGER | MAINS EN L'AIR = SUPER LASER");
            return;
        }

        // Vaisseau
        this.drawShip(ctx);

        // Balles
        this.bullets.forEach(b => {
            ctx.fillStyle = b.color;
            ctx.shadowColor = b.color; ctx.shadowBlur = 10;
            ctx.fillRect(b.x - b.w/2, b.y, b.w, b.h);
            ctx.shadowBlur = 0;
        });

        // Ennemis
        ctx.font = "30px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        this.enemies.forEach(e => {
            ctx.fillText(e.type, e.x, e.y);
        });

        // Particules
        this.particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life * 2;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        ctx.globalAlpha = 1;

        // HUD
        ctx.font = "bold 30px 'Orbitron'";
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.fillText(`SCORE: ${this.score}`, 20, 40);
        ctx.fillText(`WAVE: ${this.wave}`, 20, 80);

        // Barre Super Laser
        if (this.ship.cooldown > 0) {
            const pct = 1 - (this.ship.cooldown / 10);
            ctx.fillStyle = "#333";
            ctx.fillRect(w - 220, 20, 200, 20);
            ctx.fillStyle = "#fbbf24";
            ctx.fillRect(w - 220, 20, 200 * pct, 20);
            ctx.font = "15px Arial"; ctx.fillStyle = "white";
            ctx.fillText("RECHARGE...", w - 210, 35);
        } else if (this.ship.superMode) {
             ctx.fillStyle = "#fbbf24";
             ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 20;
             ctx.fillText("SUPER LASER !!!", w - 250, 40);
             ctx.shadowBlur = 0;
        } else {
             ctx.fillStyle = "#86efac";
             ctx.fillText("PRÊT ! (🙌)", w - 250, 40);
        }
    }

    drawShip(ctx) {
        const x = this.ship.x;
        const y = this.ship.y;
        
        ctx.save();
        ctx.translate(x, y);

        if (this.ship.superMode) {
            ctx.translate((Math.random()-0.5)*5, (Math.random()-0.5)*5);
        }

        ctx.fillStyle = this.ship.color;
        ctx.shadowColor = this.ship.color;
        ctx.shadowBlur = 15;
        
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(20, 20);
        ctx.lineTo(0, 10);
        ctx.lineTo(-20, 20);
        ctx.closePath();
        ctx.fill();

        // Réacteurs
        ctx.fillStyle = this.ship.superMode ? "#fbbf24" : "#fb923c";
        ctx.beginPath();
        ctx.moveTo(-10, 20); ctx.lineTo(-15, 30 + Math.random()*10); ctx.lineTo(-5, 20);
        ctx.moveTo(10, 20); ctx.lineTo(15, 30 + Math.random()*10); ctx.lineTo(5, 20);
        ctx.fill();

        ctx.restore();
    }

    drawUI(ctx, w, h, title, sub) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, h/2 - 60, w, 120);
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = "bold 40px 'Orbitron'";
        ctx.fillText(title, w/2, h/2 - 10);
        ctx.font = "20px Arial";
        ctx.fillStyle = "#aaaaaa";
        ctx.fillText(sub, w/2, h/2 + 30);
    }
}

registerGame({
    id: 'neon_invaders',
    name: 'NEON INVADERS',
    icon: '👾',
    color: '#a78bfa',
    players: 1,
    description: 'Déplacez-vous pour viser, levez les bras pour le super laser.',
    class: NeonInvaders
});