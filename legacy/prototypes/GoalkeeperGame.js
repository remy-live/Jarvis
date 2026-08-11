import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class GoalkeeperGame {
    constructor(game) {
        this.game = game;
        this.score = 0;
        this.lives = 5;
        this.isPlaying = false;

        // Configuration du jeu
        // Largeur/Hauteur virtuelles à la profondeur des mains pour la projection
        this.fieldRangeX = 15; 
        this.fieldRangeY = 10; 

        // Gestion du temps pour les balles
        this.spawnTimer = 0;
        this.spawnRate = 1.2; // Une balle toutes les 1.2 sec au début

        // Arrays pour gérer les objets dynamiques
        this.balls = [];
        this.gloves = []; // Les "mains" du gardien
    }

    enter() {
        console.log("⚽ GOALKEEPER: Initialisation...");

        // 1. CONFIGURATION CAMÉRA
        const aspect = window.innerWidth / window.innerHeight;
        // Caméra placée "derrière" le gardien, regarde vers le fond
        this.game.display.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
        this.game.display.camera.position.set(0, 0, 5); 
        this.game.display.camera.lookAt(0, 0, -50);

        // 2. LUMIÈRES
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.game.display.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(0, 10, 0);
        this.game.display.scene.add(dirLight);

        // 3. CRÉATION DES OBJETS
        this.createEnvironment();
        this.createGlovesPool(); // On prépare des gants (un pour chaque main détectée)

        // Reset
        this.score = 0;
        this.lives = 5;
        this.balls = [];
    }

    createEnvironment() {
        // Sol (Lignes de perspective pour donner l'impression de vitesse/profondeur)
        const gridHelper = new THREE.GridHelper(50, 20, 0x00ff00, 0x004400);
        gridHelper.position.set(0, -5, -25); // Sol plus bas
        gridHelper.scale.z = 2; // On l'étire en profondeur
        this.game.display.scene.add(gridHelper);
        this.grid = gridHelper;
        
        // Cadre de but symbolique (juste pour le visuel derrière nous)
        const geo = new THREE.TorusGeometry(18, 0.5, 8, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        this.goalFrame = new THREE.Mesh(geo, mat);
        this.goalFrame.rotation.z = Math.PI / 4;
        this.goalFrame.position.z = 2; // Juste derrière la caméra
        this.game.display.scene.add(this.goalFrame);
    }

    createGlovesPool() {
        // On crée 2 gants (Max 2 mains détectées généralement)
        const geometry = new THREE.BoxGeometry(2.5, 2.5, 2.5);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x00ff00, 
            opacity: 0.8,
            transparent: true,
            emissive: 0x004400 
        });

        for (let i = 0; i < 2; i++) {
            const glove = new THREE.Mesh(geometry, material);
            glove.visible = false; // Caché par défaut
            glove.position.z = -2; // Plan d'interception
            this.game.display.scene.add(glove);
            this.gloves.push(glove);
        }
    }

    spawnBall() {
        const geometry = new THREE.SphereGeometry(1.2, 16, 16);
        const material = new THREE.MeshPhongMaterial({ color: 0xffffff }); // Ballon blanc classique
        const ball = new THREE.Mesh(geometry, material);

        // Apparition au fond
        ball.position.z = -60;
        // X et Y aléatoires
        ball.position.x = (Math.random() - 0.5) * 30; 
        ball.position.y = (Math.random() - 0.5) * 15;

        this.game.display.scene.add(ball);
        this.balls.push({ mesh: ball, active: true });
    }

    update(dt) {
        // --- 1. CONTRÔLE DES GANTS (Basé sur ton code Pong) ---
        const inputs = this.game.inputs;
        const screenWidth = this.game.display.virtW || window.innerWidth;
        const screenHeight = this.game.display.virtH || window.innerHeight; // Besoin de H aussi

        // Reset visibilité
        this.gloves.forEach(g => g.visible = false);

        if (inputs && inputs.players) {
            inputs.players.forEach((p, index) => {
                if (index < this.gloves.length) {
                    const glove = this.gloves[index];
                    glove.visible = true;

                    // NORMALISATION (Comme Pong)
                    const normalizedX = p.x / screenWidth;
                    const normalizedY = p.y / screenHeight;

                    // MIROIR X : -(normalizedX - 0.5)
                    // Pour Y : -(normalizedY - 0.5) car canvas Y=0 est en haut, 3D Y=0 au centre
                    const targetX = -(normalizedX - 0.5) * this.fieldRangeX * 2.5; 
                    const targetY = -(normalizedY - 0.5) * this.fieldRangeY * 2.5;

                    // Lissage du mouvement (Lerp)
                    glove.position.x += (targetX - glove.position.x) * 15 * dt;
                    glove.position.y += (targetY - glove.position.y) * 15 * dt;
                }
            });
        }

        // --- 2. GESTION DES BALLES ---
        
        // Spawning
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnBall();
            this.spawnTimer = this.spawnRate;
            if (this.spawnRate > 0.4) this.spawnRate -= 0.01; // Accélération
        }

        // Physique & Collision
        // On itère à l'envers pour pouvoir supprimer des éléments du tableau
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ballObj = this.balls[i];
            const mesh = ballObj.mesh;

            // La balle avance vers la caméra (Z positif)
            mesh.position.z += (20 + (this.score * 0.5)) * dt; 
            mesh.rotation.x += dt * 5;

            let ballRemoved = false;

            // A. CHECK COLLISION GANTS
            // On ne check que si la balle est proche du plan Z des gants (-2)
            if (Math.abs(mesh.position.z - (-2)) < 3) {
                for (let glove of this.gloves) {
                    if (glove.visible) {
                        // Distance simple Sphere/Box
                        const dist = glove.position.distanceTo(mesh.position);
                        if (dist < 3.0) { // Hitbox généreuse
                            this.score += 10;
                            this.removeBall(i);
                            ballRemoved = true;
                            break; // Sortir de la boucle gants
                        }
                    }
                }
            }

            if (ballRemoved) continue;

            // B. CHECK PERDU (Balle passe derrière la caméra)
            if (mesh.position.z > 5) {
                this.lives--;
                this.removeBall(i);
                if (this.lives <= 0) {
                    this.score = 0;
                    this.lives = 5;
                    this.spawnRate = 1.2;
                }
            }
        }
    }

    removeBall(index) {
        const ball = this.balls[index];
        this.game.display.scene.remove(ball.mesh);
        // Nettoyage géométrie/matériel pour éviter fuites mémoire
        ball.mesh.geometry.dispose(); 
        ball.mesh.material.dispose();
        this.balls.splice(index, 1);
    }

    render(display) {
        const ctx = display.ctx;

        // HUD
        ctx.fillStyle = "#00ff00"; // Vert Matrix
        ctx.font = "bold 40px 'Orbitron', sans-serif";
        
        ctx.textAlign = "left";
        ctx.fillText(`ARRET: ${this.score}`, 50, 80);

        ctx.textAlign = "right";
        ctx.fillText(`BUTS ENCAISSÉS: ${5 - this.lives}/5`, display.virtW - 50, 80);

        if (!this.game.inputs.players.length) {
            ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
            ctx.textAlign = "center";
            ctx.fillText("UTILISEZ VOS MAINS", display.virtW / 2, display.virtH / 2);
        }
    }

    exit() {
        console.log("⚽ GOALKEEPER: Nettoyage scène");
        const s = this.game.display.scene;
        
        // 1. Supprimer l'environnement
        s.remove(this.grid);
        s.remove(this.goalFrame);

        // 2. Supprimer les gants
        this.gloves.forEach(g => s.remove(g));
        this.gloves = [];

        // 3. Supprimer toutes les balles restantes
        this.balls.forEach(b => {
            s.remove(b.mesh);
            b.mesh.geometry.dispose();
            b.mesh.material.dispose();
        });
        this.balls = [];
    }
}

Registry.register("SUPER GOALIE", GoalkeeperGame, "#00ff00");