import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class FlappySquat {
    constructor(game) {
        this.id = 'flappy_squat';
        this.name = 'Flappy Squat';
        this.game = game;
        
        // État du jeu
        this.score = 0;
        this.isPlaying = false;
        this.state = 'WAITING'; 
        
        // Configuration
        this.gameSpeed = 10;
        this.pipeSpawnTimer = 0;
        this.pipeSpawnRate = 2.0; 
        
        // Calibration SQUAT (Épaules)
        // 0.3 = Debout (Épaules en haut de l'écran)
        // 0.7 = Accroupi (Épaules en bas)
        this.squatMin = 0.3; 
        this.squatMax = 0.7; 

        // Objets 3D
        this.birdGroup = null;
        this.pipes = [];
        this.lights = [];
        this.environment = [];
        this.wingAngle = 0;
    }

    enter() {
        console.log("🐥 FLAPPY: Initialisation (Mode Épaules)...");

        // 1. CAMÉRA
        const aspect = window.innerWidth / window.innerHeight;
        this.game.display.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
        this.game.display.camera.position.set(0, 0, 25);
        this.game.display.camera.lookAt(0, 0, 0);

        // 2. LUMIÈRES
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.lights.push(ambient);
        this.game.display.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        this.lights.push(dirLight);
        this.game.display.scene.add(dirLight);

        // 3. MONDE
        this.createEnvironment();
        this.createBird();

        // 4. RESET
        this.score = 0;
        this.pipes = [];
        this.state = 'WAITING';
    }

    // ... (Les fonctions createEnvironment, createBird, createPipe restent identiques au code précédent) ...
    createEnvironment() {
        const geo = new THREE.PlaneGeometry(100, 20);
        const mat = new THREE.MeshLambertMaterial({ color: 0xded895 });
        this.floor = new THREE.Mesh(geo, mat);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.y = -15;
        this.game.display.scene.add(this.floor);
        this.environment.push(this.floor);
    }

    createBird() {
        this.birdGroup = new THREE.Group();
        this.birdGroup.position.x = -8;

        const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), new THREE.MeshPhongMaterial({ color: 0xffd700 }));
        body.scale.set(1, 0.9, 1);
        this.birdGroup.add(body);

        // Yeux
        const eyeGeo = new THREE.SphereGeometry(0.5, 10, 10);
        const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        const eyeL = new THREE.Mesh(eyeGeo, whiteMat); eyeL.position.set(0.8, 0.5, 0.6);
        const eyeR = new THREE.Mesh(eyeGeo, whiteMat); eyeR.position.set(0.8, 0.5, -0.6);
        const pupilL = new THREE.Mesh(pupilGeo, blackMat); pupilL.position.set(1.2, 0.5, 0.6);
        const pupilR = new THREE.Mesh(pupilGeo, blackMat); pupilR.position.set(1.2, 0.5, -0.6);
        this.birdGroup.add(eyeL, eyeR, pupilL, pupilR);

        // Bec
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 8), new THREE.MeshPhongMaterial({ color: 0xff6600 }));
        beak.rotation.z = -Math.PI / 2;
        beak.position.set(1.4, -0.2, 0);
        this.birdGroup.add(beak);

        // Ailes
        const wingGeo = new THREE.BoxGeometry(1.2, 0.2, 2.5);
        wingGeo.translate(0.6, 0, 0);
        this.wingL = new THREE.Mesh(wingGeo, whiteMat); this.wingL.position.set(-0.5, 0, 0.8);
        this.wingR = new THREE.Mesh(wingGeo, whiteMat); this.wingR.position.set(-0.5, 0, -0.8);
        this.birdGroup.add(this.wingL, this.wingR);

        this.game.display.scene.add(this.birdGroup);
    }

    createPipe() {
        const pipeGroup = new THREE.Group();
        const gapY = (Math.random() - 0.5) * 10; 
        const gapSize = 8; // Espace un peu plus large pour le squat

        const makeTube = (y, h) => {
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, h, 16), new THREE.MeshPhongMaterial({ color: 0x73bf2e }));
            mesh.position.y = y;
            return mesh;
        };
        const makeCap = (y) => {
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.5, 16), new THREE.MeshPhongMaterial({ color: 0x5a9e1e }));
            mesh.position.y = y;
            return mesh;
        };

        const topH = 20;
        pipeGroup.add(makeTube(gapY + (gapSize/2) + (topH/2), topH));
        pipeGroup.add(makeCap(gapY + (gapSize/2) + 0.75));

        const botH = 20;
        pipeGroup.add(makeTube(gapY - (gapSize/2) - (botH/2), botH));
        pipeGroup.add(makeCap(gapY - (gapSize/2) - 0.75));
        
        pipeGroup.position.x = 35; 
        this.game.display.scene.add(pipeGroup);
        
        this.pipes.push({ mesh: pipeGroup, passed: false, gapY: gapY, gapSize: gapSize });
    }
    // ... Fin des helpers ...

    update(dt) {
        // --- 1. DÉTECTION PRÉCISE DES ÉPAULES ---
        const inputs = this.game.inputs;
        let controlY = 0.5; // Valeur par défaut
        let hasPlayer = false;

        if (inputs.players && inputs.players.length > 0) {
            const p = inputs.players[0];
            hasPlayer = true;

            // LOGIQUE CLÉ : Utiliser les landmarks bruts si disponibles
            // p.raw.poseLandmarks ou p.poseLandmarks selon ton InputSystem
            // On vérifie la structure de tes données
            const landmarks = p.poseLandmarks || (p.raw ? p.raw.poseLandmarks : null);

            if (landmarks && landmarks[11] && landmarks[12]) {
                // 11 = Left Shoulder, 12 = Right Shoulder
                // On fait la moyenne des Y
                const shoulderY = (landmarks[11].y + landmarks[12].y) / 2;
                controlY = shoulderY;
                console.log(controlY);
            } else {
                // Fallback si pas de landmarks (ex: trop loin) : on prend le centre
                controlY = p.y;
            }

            if (this.state === 'WAITING') this.state = 'PLAYING';
        }

        if (this.state === 'PLAYING') {
            // MAPPING : Input Épaules -> Position Oiseau
            // Clamp (On limite l'entrée entre squatMin et squatMax)
            const inputClamped = Math.max(this.squatMin, Math.min(this.squatMax, controlY));
            
            // Normalisation 0..1 (0=Haut/Debout, 1=Bas/Accroupi)
            const factor = (inputClamped - this.squatMin) / (this.squatMax - this.squatMin);

            // Projection dans le monde 3D (+10 en haut, -10 en bas)
            // Note: factor 0 (debout) -> doit donner Y positif (haut)
            const targetY = (1 - factor) * 20 - 10;

            // Lissage du mouvement (Lerp)
            this.birdGroup.position.y += (targetY - this.birdGroup.position.y) * 10 * dt;
            
            // Rotation (Piqué)
            const delta = targetY - this.birdGroup.position.y;
            this.birdGroup.rotation.z = delta * 0.08;

            // Animation Ailes
            this.wingAngle += dt * 15;
            const flap = Math.sin(this.wingAngle) * 0.5;
            this.wingL.rotation.z = flap;
            this.wingR.rotation.z = -flap;

            // Gestion Tuyaux (Reste identique)
            this.pipeSpawnTimer -= dt;
            if (this.pipeSpawnTimer <= 0) {
                this.createPipe();
                this.pipeSpawnTimer = this.pipeSpawnRate;
            }

            // Collisions
            const birdBox = new THREE.Box3().setFromObject(this.birdGroup);
            birdBox.expandByScalar(-0.6); // Hitbox plus gentille

            for (let i = this.pipes.length - 1; i >= 0; i--) {
                const pipe = this.pipes[i];
                pipe.mesh.position.x -= this.gameSpeed * dt;

                if (!pipe.passed && pipe.mesh.position.x < this.birdGroup.position.x) {
                    pipe.passed = true;
                    this.score++;
                }

                if (pipe.mesh.position.x < -30) {
                    this.game.display.scene.remove(pipe.mesh);
                    pipe.mesh.traverse(c => { if(c.geometry) c.geometry.dispose(); });
                    this.pipes.splice(i, 1);
                    continue;
                }

                if (Math.abs(pipe.mesh.position.x - this.birdGroup.position.x) < 2) {
                    const upperLimit = pipe.gapY + (pipe.gapSize / 2) - 1.2;
                    const lowerLimit = pipe.gapY - (pipe.gapSize / 2) + 1.2;
                    if (this.birdGroup.position.y > upperLimit || this.birdGroup.position.y < lowerLimit) {
                        this.state = 'GAMEOVER';
                    }
                }
            }
        }
        else if (this.state === 'GAMEOVER') {
            if (this.birdGroup.position.y > -15) {
                this.birdGroup.position.y -= 25 * dt;
                this.birdGroup.rotation.z = -Math.PI / 2;
            }
             // Restart rapide en se levant (épaules hautes)
             if (hasPlayer && controlY < this.squatMin + 0.1) {
                this.exit(); // Nettoyage
                this.enter(); // Restart
            }
        }
    }

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;
        
        // HUD
        ctx.save();
        ctx.fillStyle = "white"; 
        ctx.strokeStyle = "black";
        ctx.lineWidth = 4;
        ctx.textAlign = "center";
        
        if (this.state === 'WAITING') {
            ctx.font = "bold 50px 'Orbitron'";
            ctx.strokeText("POSITIONNEZ-VOUS", w/2, h/2);
            ctx.fillText("POSITIONNEZ-VOUS", w/2, h/2);
            ctx.font = "30px Arial";
            ctx.fillStyle = "#ffff00";
            ctx.fillText("Le jeu démarre quand on voit vos épaules", w/2, h/2 + 60);
        } else if (this.state === 'PLAYING') {
            ctx.font = "bold 80px 'Orbitron'";
            ctx.strokeText(this.score, w/2, 100);
            ctx.fillText(this.score, w/2, 100);
        } else if (this.state === 'GAMEOVER') {
            ctx.fillStyle = "#ff4444";
            ctx.font = "bold 60px 'Orbitron'";
            ctx.strokeText("GAME OVER", w/2, h/2);
            ctx.fillText("GAME OVER", w/2, h/2);
            ctx.fillStyle = "white";
            ctx.font = "30px Arial";
            ctx.fillText("Levez-vous pour rejouer !", w/2, h/2 + 60);
        }
        ctx.restore();
    }

    exit() {
        const s = this.game.display.scene;
        if(this.birdGroup) s.remove(this.birdGroup);
        this.environment.forEach(o => s.remove(o));
        this.pipes.forEach(p => s.remove(p.mesh));
        this.lights.forEach(l => s.remove(l));
        this.pipes = []; this.environment = []; this.lights = [];
    }
}

// Enregistrement
Registry.register("FLAPPY SQUAT", FlappySquat, "#ffdd00");