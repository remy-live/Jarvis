import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class NeonBrickBattle {
    constructor(game) {
        this.id = 'neon_bricks_vs';
        this.name = 'NEON BATTLE SIDE';
        this.game = game;

        // --- Config (Mode Paysage) ---
        this.fieldWidth = 32;  // Largeur du terrain (Distance entre buts)
        this.fieldHeight = 16; // Hauteur du terrain (Murs rebond)
        this.paddleHeight = 4; // Taille verticale de la raquette
        this.ballSpeedBase = 14;
        
        // --- État ---
        this.state = 'WAITING_P2'; 
        this.ballVel = new THREE.Vector3(0,0,0);
        this.ballSpeedCurrent = this.ballSpeedBase;
        
        this.p1 = { score: 0, lives: 5 }; // Joueur Gauche
        this.p2 = { score: 0, lives: 5 }; // Joueur Droite
        this.winner = null;

        this.paddle1 = null; 
        this.paddle2 = null; 
        this.ball = null;
        this.bricks = [];
        this.walls = [];
        this.lights = [];
    }

    enter() {
        console.log("🧱 NEON BATTLE: Side-by-Side Init");
        
        // 1. Caméra (On recule un peu pour voir la largeur)
        const aspect = window.innerWidth / window.innerHeight;
        this.game.display.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.game.display.camera.position.set(0, 0, 32);
        this.game.display.camera.lookAt(0, 0, 0);

        // 2. Lumières
        const ambient = new THREE.AmbientLight(0xffffff, 0.3);
        this.lights.push(ambient);
        this.game.display.scene.add(ambient);
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(0, 5, 20);
        this.lights.push(sun);
        this.game.display.scene.add(sun);

        // 3. Monde
        this.createArena();
        this.createPaddles();
        this.createBall();
        this.resetBricks();

        // 4. Reset
        this.p1 = { score: 0, lives: 5 };
        this.p2 = { score: 0, lives: 5 };
        this.state = 'WAITING_P2';
        this.winner = null;
        this.resetBall();
    }

    createArena() {
        // MURS (Haut et Bas cette fois)
        const wallGeo = new THREE.BoxGeometry(this.fieldWidth + 2, 1, 2);
        const wallMat = new THREE.MeshPhongMaterial({ color: 0x4444ff, emissive: 0x111144 });
        
        const topWall = new THREE.Mesh(wallGeo, wallMat);
        topWall.position.y = this.fieldHeight / 2 + 0.5;
        this.walls.push(topWall);

        const botWall = new THREE.Mesh(wallGeo, wallMat);
        botWall.position.y = -this.fieldHeight / 2 - 0.5;
        this.walls.push(botWall);

        this.game.display.scene.add(topWall, botWall);

        // Fond Grille
        const grid = new THREE.GridHelper(this.fieldWidth, 16, 0x222222, 0x111111);
        grid.rotation.x = Math.PI / 2;
        grid.position.z = -1;
        this.walls.push(grid);
        this.game.display.scene.add(grid);
    }

    createPaddles() {
        // Géométrie Verticale (Fine en X, Haute en Y)
        const padGeo = new THREE.BoxGeometry(1, this.paddleHeight, 1);
        
        // P1 (Gauche - Cyan)
        this.paddle1 = new THREE.Mesh(padGeo, new THREE.MeshPhongMaterial({ color: 0x00ffff, emissive: 0x004444 }));
        this.paddle1.position.set(-this.fieldWidth/2 + 2, 0, 0);
        
        // P2 (Droite - Rose)
        this.paddle2 = new THREE.Mesh(padGeo, new THREE.MeshPhongMaterial({ color: 0xff00ff, emissive: 0x440044 }));
        this.paddle2.position.set(this.fieldWidth/2 - 2, 0, 0);

        this.game.display.scene.add(this.paddle1, this.paddle2);
    }

    createBall() {
        this.ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 16, 16),
            new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xaaaaaa })
        );
        this.game.display.scene.add(this.ball);
    }

 resetBricks() {
        this.bricks.forEach(b => {
            this.game.display.scene.remove(b.mesh);
            b.mesh.geometry.dispose(); 
            b.mesh.material.dispose();
        });
        this.bricks = [];

        // --- CORRECTION ICI ---
        const rows = 8; 
        const cols = 4; // "const" ajouté ici
        const brickW = 1.5; 
        const brickH = 1.5; // "const" ajouté ici
        // ----------------------

        // Palette de couleurs Cyberpunk
        const colors = [0xff0055, 0x55ff00, 0x00ffff, 0xffff00];

        const startX = -(cols * brickW) / 2 + brickW/2;
        const startY = -(rows * brickH) / 2 + brickH/2;

        const geo = new THREE.BoxGeometry(brickW - 0.1, brickH - 0.1, 1);

        for (let r = 0; r < rows; r++) {
            const color = colors[r % 4];
            // Matériau semi-transparent et brillant
            const mat = new THREE.MeshStandardMaterial({ 
                color: color, 
                emissive: color, emissiveIntensity: 1.5,
                transparent: true, opacity: 0.9,
                roughness: 0.1, metalness: 0.9
            });
            
            for (let c = 0; c < cols; c++) {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(startX + c * brickW, startY + r * brickH, 0);
                this.game.display.scene.add(mesh);
                this.bricks.push({ mesh: mesh, active: true, color: color });
            }
        }
    }

    resetBall() {
        this.ball.position.set(0, 0, 0);
        this.ballSpeedCurrent = this.ballSpeedBase;
        
        setTimeout(() => {
            if (this.state === 'PLAYING') {
                 // Lance aléatoirement gauche ou droite
                 const dirX = Math.random() > 0.5 ? 1 : -1;
                 // Avec un angle Y aléatoire
                 this.ballVel.set(dirX, (Math.random()-0.5)*0.8, 0).normalize();
            }
        }, 1500);
        this.ballVel.set(0,0,0);
    }

    update(dt) {
        const inputs = this.game.inputs;
        const players = inputs.players;
        const screenH = this.game.display.virtH || window.innerHeight;
        const screenW = this.game.display.virtW || window.innerWidth;

        // --- 1. ETAT ---
        // On vérifie s'il y a une main à gauche ET une main à droite pour démarrer
        let hasLeftPlayer = false;
        let hasRightPlayer = false;

        // --- 2. CONTROLES INTELLIGENTS (Spatiaux + Lissés) ---
        
        // Fonction de contrôle générique
        const updatePaddle = (paddle, handPos) => {
            // Mapping : On n'utilise que 80% de l'écran pour éviter d'aller chercher trop haut/bas
            // Zone confortable : 10% (0.1) à 90% (0.9)
            const safeY = Math.max(0.1, Math.min(0.9, handPos.y / screenH)); 
            
            // Conversion 0..1 vers Monde 3D
            // Inversion : main en haut (0) = raquette en haut (+Y)
            const targetY = -(safeY - 0.5) * (this.fieldHeight * 1.2); 

            // Clamp (Limites physiques du terrain)
            const limit = (this.fieldHeight - this.paddleHeight) / 2;
            const clampedY = Math.max(-limit, Math.min(limit, targetY));

            // LISSAGE (Le secret de la fluidité)
            // Facteur 10 = rapide mais fluide. 
            paddle.position.y += (clampedY - paddle.position.y) * 10 * dt;
        };

        // On parcourt TOUTES les mains détectées
        players.forEach(p => {
            const source = p.indexTip || p; // Priorité index, sinon paume
            const normX = source.x / screenW;

            if (normX < 0.5) {
                // Cette main est dans la zone GAUCHE -> Contrôle P1
                hasLeftPlayer = true;
                if (this.paddle1) updatePaddle(this.paddle1, source);
            } else {
                // Cette main est dans la zone DROITE -> Contrôle P2
                hasRightPlayer = true;
                if (this.paddle2) updatePaddle(this.paddle2, source);
            }
        });

        // Gestion Démarrage
        if (this.state === 'WAITING_P2') {
            if (hasLeftPlayer && hasRightPlayer) {
                this.state = 'PLAYING';
                this.resetBall();
            }
        }
        
        if (this.state === 'GAMEOVER') return;


        // --- 3. PHYSIQUE AVANCÉE ---
        if (this.state !== 'PLAYING' || this.ballVel.lengthSq() === 0) return;

        // Calcul position future
        const nextPos = this.ball.position.clone().add(this.ballVel.clone().multiplyScalar(this.ballSpeedCurrent * dt));

        // A. REBOND MURS (Haut / Bas)
        if (nextPos.y > this.fieldHeight/2 - 0.5 || nextPos.y < -this.fieldHeight/2 + 0.5) {
            this.ballVel.y *= -1;
            // Anti-Bug : On sort la balle du mur pour éviter qu'elle ne se coince
            nextPos.y = Math.sign(nextPos.y) * (this.fieldHeight/2 - 0.55);
            
            // Petit son ou particule ici plus tard
        }

        // B. RAQUETTES (Latérales)
        const checkPaddle = (paddle, isLeft) => {
            const pBox = new THREE.Box3().setFromObject(paddle);
            const bSphere = new THREE.Sphere(nextPos, 0.6); // Hitbox balle un peu généreuse

            if (pBox.intersectsSphere(bSphere)) {
                // Rebond X
                this.ballVel.x = isLeft ? 1 : -1;
                
                // EFFET LIFT (Contrôle de l'angle)
                // Si on tape avec le haut de la raquette, la balle part vers le haut
                const hitOffset = (nextPos.y - paddle.position.y) / (this.paddleHeight / 2);
                this.ballVel.y = hitOffset * 1.5; // Facteur d'angle
                
                // Normalisation essentielle pour garder une vitesse constante
                this.ballVel.normalize();

                // ACCELERATION (Gameplay Loop)
                // La balle va de plus en plus vite
                this.ballSpeedCurrent = Math.min(25, this.ballSpeedCurrent + 1.0);
                
                return true;
            }
            return false;
        };

        // Optimisation : On ne check la collision que si la balle va vers la raquette
        if (this.ballVel.x < 0 && nextPos.x < -this.fieldWidth/2 + 4) checkPaddle(this.paddle1, true);
        else if (this.ballVel.x > 0 && nextPos.x > this.fieldWidth/2 - 4) checkPaddle(this.paddle2, false);

        // C. BRIQUES
        const ballBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(1,1,1));
        
        // Anti-Bloquage horizontal (Si la balle rebondit trop à l'horizontale, on la pousse un peu)
        if (Math.abs(this.ballVel.x) > 0.95) {
             this.ballVel.y += (this.ballVel.y > 0 ? 0.1 : -0.1);
             this.ballVel.normalize();
        }

        for (let i = this.bricks.length - 1; i >= 0; i--) {
            const brick = this.bricks[i];
            if (!brick.active) continue;
            
            // Collision simple Box vs Box
            const bBox = new THREE.Box3().setFromObject(brick.mesh);
            if (ballBox.intersectsBox(bBox)) {
                brick.active = false;
                this.game.display.scene.remove(brick.mesh);
                
                if (this.ballVel.x > 0) this.p1.score += 10;
                else this.p2.score += 10;

                this.ballVel.x *= -1; 
                break;
            }
        }
        
        if (this.bricks.filter(b => b.active).length === 0) {
            this.resetBricks();
            this.ballSpeedCurrent += 2;
        }

        // D. BUTS
        if (nextPos.x < -this.fieldWidth/2 - 2) {
            this.p1.lives--;
            if (this.p1.lives <= 0) this.endGame("JOUEUR DROITE");
            else this.resetBall();
        }
        else if (nextPos.x > this.fieldWidth/2 + 2) {
            this.p2.lives--;
            if (this.p2.lives <= 0) this.endGame("JOUEUR GAUCHE");
            else this.resetBall();
        }

        this.ball.position.copy(nextPos);
    }

    endGame(winner) {
        this.state = 'GAMEOVER';
        this.winner = winner;
        this.ballVel.set(0,0,0);
        setTimeout(() => { if(this.state === 'GAMEOVER') this.enter(); }, 5000);
    }

    render(display) {
        display.renderer.render(this.game.display.scene, this.game.display.camera);
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.save();
        ctx.font = "bold 30px 'Orbitron'";
        
        // HUD GAUCHE (Cyan)
        ctx.fillStyle = "#00ffff";
        ctx.textAlign = "left"; 
        ctx.fillText(`P1: ${this.p1.lives} ❤`, 30, 50);
        ctx.fillText(`${this.p1.score}`, 30, 90);

        // HUD DROITE (Rose)
        ctx.fillStyle = "#ff00ff";
        ctx.textAlign = "right"; 
        ctx.fillText(`❤ ${this.p2.lives} :P2`, w-30, 50);
        ctx.fillText(`${this.p2.score}`, w-30, 90);

        ctx.textAlign = "center";
        if (this.state === 'WAITING_P2') {
            ctx.fillStyle = "yellow";
            ctx.fillText("ATTENTE JOUEUR 2", w/2, h/2);
        } else if (this.state === 'GAMEOVER') {
            ctx.fillStyle = "white";
            ctx.font = "bold 60px 'Orbitron'";
            ctx.fillText("VICTOIRE", w/2, h/2 - 20);
            ctx.fillStyle = this.winner.includes("GAUCHE") ? "#00ffff" : "#ff00ff";
            ctx.fillText(this.winner, w/2, h/2 + 50);
        }
        ctx.restore();
    }

    exit() {
        const s = this.game.display.scene;
        s.remove(this.paddle1); s.remove(this.paddle2); s.remove(this.ball);
        this.walls.forEach(w => s.remove(w));
        this.bricks.forEach(b => s.remove(b.mesh));
        this.lights.forEach(l => s.remove(l));
        this.bricks = []; this.walls = [];
    }
}

Registry.register("NEON BATTLE SIDE", NeonBrickBattle, "#00ffff");