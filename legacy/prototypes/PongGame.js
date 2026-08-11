import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class PongGame {
    constructor(game) {
        this.id = 'pong';
        this.name = 'pong';
        this.game = game;
        this.score = 0;
        this.lives = 3;
        this.isPlaying = false; // Attente avant de lancer la balle
        
        // Configuration du jeu
        this.fieldWidth = 20;
        this.fieldHeight = 15;
        this.paddleSpeed = 0; // Calculé dynamiquement
        
        // Physique de la balle
        this.ballVel = new THREE.Vector3(0, 0, 0);
        this.baseSpeed = 8.0;
        this.speedMultiplier = 1.0;
    }

    enter() {
        console.log("🏓 PONG: Initialisation...");

        // 1. CONFIGURATION CAMÉRA
        const aspect = window.innerWidth / window.innerHeight;
        // On recule la caméra pour voir tout le terrain
        this.game.display.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
        this.game.display.camera.position.set(0, 0, 20); // Z=20
        this.game.display.camera.lookAt(0, 0, 0);

        // 2. LUMIÈRES (Ambiance Arcade)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.game.display.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x00ffff, 1, 50);
        pointLight.position.set(0, 5, 5);
        this.game.display.scene.add(pointLight);

        // 3. CRÉATION DES OBJETS
        this.createField();
        this.createPaddle();
        this.createBall();

        // 4. LANCEMENT
        this.resetBall();
    }

    createField() {
        // Sol (Grille style Tron)
        const gridHelper = new THREE.GridHelper(this.fieldWidth * 2, 20, 0xff00ff, 0x220022);
        gridHelper.rotation.x = Math.PI / 2; // On redresse la grille face à nous
        gridHelper.position.z = -1; // Juste derrière la balle
        this.game.display.scene.add(gridHelper);
        this.grid = gridHelper;

        // Murs (Haut et Bas)
        const wallGeo = new THREE.BoxGeometry(this.fieldWidth + 2, 1, 2);
        const wallMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        
        this.topWall = new THREE.Mesh(wallGeo, wallMat);
        this.topWall.position.y = this.fieldHeight / 2 + 0.5;
        this.game.display.scene.add(this.topWall);

        this.bottomWall = new THREE.Mesh(wallGeo, wallMat);
        this.bottomWall.position.y = -(this.fieldHeight / 2 + 0.5);
        this.game.display.scene.add(this.bottomWall);
    }

    createPaddle() {
        // La raquette du joueur
        const geometry = new THREE.BoxGeometry(4, 0.8, 1);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x00ffff, 
            emissive: 0x004444 
        });
        this.paddle = new THREE.Mesh(geometry, material);
        
        // Position de départ (en bas)
        this.paddle.position.y = -6; 
        this.game.display.scene.add(this.paddle);
    }

    createBall() {
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0xff0000, 
            emissive: 0x440000 
        });
        this.ball = new THREE.Mesh(geometry, material);
        this.game.display.scene.add(this.ball);
    }

    resetBall() {
        this.ball.position.set(0, 0, 0);
        this.speedMultiplier = 1.0;
        
        // La balle part vers le haut avec un angle aléatoire
        const dirX = (Math.random() - 0.5) * 2; // Entre -1 et 1
        this.ballVel.set(dirX, 1, 0).normalize().multiplyScalar(this.baseSpeed);
    }

    
    update(dt) {
        // --- 1. CONTRÔLE DE LA RAQUETTE ---
        const inputs = this.game.inputs;
        let hand = null;

        if (inputs && inputs.players) {
            inputs.players.forEach(p => { if(p) hand = p; });
        }

        if (hand) {
            // CORRECTION ICI : Normalisation
            // On convertit les pixels (ex: 900px) en ratio (ex: 0.9)
            // Pour éviter la division par zéro, on vérifie que virtW existe
            const screenWidth = this.game.display.virtW || window.innerWidth;
            const normalizedX = hand.x / screenWidth;

            // Paramètres de sensibilité
            const sensitivity = 2.0; 
            
            // Calcul de la position cible (Inversion du signe pour l'effet miroir)
            const targetX = -(normalizedX - 0.5) * this.fieldWidth * sensitivity;
            
            // Mouvement fluide vers la cible
            this.paddle.position.x += (targetX - this.paddle.position.x) * 15 * dt;
            
            // Bloquer la raquette dans les murs
            const limit = this.fieldWidth / 2 - 2;
            this.paddle.position.x = Math.max(-limit, Math.min(limit, this.paddle.position.x));
        }

        // --- 2. PHYSIQUE DE LA BALLE ---
        // (Le reste du code ne change pas)
        if (this.lives > 0) {
             this.ball.position.add(this.ballVel.clone().multiplyScalar(dt * this.speedMultiplier));
        }
        
        this.ball.rotation.x += dt * 5;
        this.ball.rotation.y += dt * 5;

        // --- 3. COLLISIONS MURS ---
        const bPos = this.ball.position;
        
        // Droite / Gauche
        if (bPos.x > this.fieldWidth / 2) { bPos.x = this.fieldWidth / 2; this.ballVel.x *= -1; }
        if (bPos.x < -this.fieldWidth / 2) { bPos.x = -this.fieldWidth / 2; this.ballVel.x *= -1; }
        
        // Haut
        if (bPos.y > this.fieldHeight / 2) { bPos.y = this.fieldHeight / 2; this.ballVel.y *= -1; }
        
        // Perdu (Bas)
        if (bPos.y < -this.fieldHeight / 2 - 2) {
            this.lives--;
            if (this.lives <= 0) {
                this.score = 0;
                this.lives = 3;
                this.speedMultiplier = 1.0;
            }
            this.resetBall();
        }

        // --- 4. COLLISION RAQUETTE ---
        if (Math.abs(bPos.y - this.paddle.position.y) < 0.8) {
            if (Math.abs(bPos.x - this.paddle.position.x) < 2.5) {
                if (this.ballVel.y < 0) { // Uniquement si la balle descend
                    this.ballVel.y = Math.abs(this.ballVel.y);
                    
                    // Effet latéral selon où on tape
                    const hitPoint = bPos.x - this.paddle.position.x;
                    this.ballVel.x = hitPoint * 5; 
                    
                    this.ballVel.normalize().multiplyScalar(this.baseSpeed);
                    this.speedMultiplier += 0.05;
                    this.score += 10;
                }
            }
        }
    }
    render(display) {
        const ctx = display.ctx;
        
        // HUD (Affichage Tête Haute)
        ctx.fillStyle = "white";
        ctx.font = "bold 40px 'Orbitron', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`SCORE: ${this.score}`, 50, 80);

        ctx.textAlign = "right";
        ctx.fillText(`VIES: ${this.lives}`, display.virtW - 50, 80);

        // Guide visuel si pas de main
        if (!this.game.inputs.players.length) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
            ctx.textAlign = "center";
            ctx.font = "30px Arial";
            ctx.fillText("✋ LEVEZ LA MAIN POUR JOUER", display.virtW / 2, display.virtH / 2);
        }
    }

    exit() {
        console.log("🏓 PONG: Nettoyage scène");
        const s = this.game.display.scene;
        s.remove(this.paddle);
        s.remove(this.ball);
        s.remove(this.grid);
        s.remove(this.topWall);
        s.remove(this.bottomWall);
        // On pourrait nettoyer les lights aussi, mais bon pour l'instant ça va
    }
}

Registry.register("NEON PONG", PongGame, "#00ffff");