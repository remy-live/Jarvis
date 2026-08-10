import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class SkyAviator {
    constructor(engine) {
        this.engine = engine;
        
        // État du jeu
        this.score = 0;
        this.isGameOver = false;
        this.speed = 8; // Vitesse initiale un peu plus douce
        this.spawnTimer = 0;
        
        // Configuration
        this.pipeGap = 7;         // Espace vertical un peu plus large (plus facile)
        this.pipeFrequency = 1.8; // Temps entre les tuyaux
        
        this.meshes = [];
        this.pipes = [];
    }

    enter() {
        console.log("✈️ SKY AVIATOR: Démarrage...");

        // 1. Caméra (Vue de côté bien cadrée)
        const aspect = window.innerWidth / window.innerHeight;
        this.engine.display.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.engine.display.camera.position.set(0, 0, 25); // On recule un peu pour bien voir

        // 2. Lumières
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(5, 10, 7);
        this.addObj(sun);
        this.addObj(new THREE.AmbientLight(0x606060));

        // 3. L'Avion (Plus visible)
        // Corps
        const bodyGeo = new THREE.ConeGeometry(1, 3, 8);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xffaa00, flatShading: true });
        this.plane = new THREE.Mesh(bodyGeo, bodyMat);
        this.plane.rotation.z = -Math.PI / 2; // Pointe vers la droite
        
        // Hélice (pour le style)
        const propGeo = new THREE.BoxGeometry(0.2, 2.5, 0.1);
        const propMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
        this.propeller = new THREE.Mesh(propGeo, propMat);
        this.propeller.position.y = 1.5; // Au bout du nez
        this.plane.add(this.propeller); // On attache l'hélice à l'avion

        this.plane.position.x = -8; // Gauche de l'écran
        this.addObj(this.plane);

        // 4. Sol
        this.createGround();
    }

    update(dt) {
        // Faire tourner l'hélice
        if (this.plane && !this.isGameOver) {
            this.propeller.rotation.y += dt * 15;
        }

        if (this.isGameOver) {
            // Relance si on détecte une main qui bouge
            if (this.engine.inputs.players.length > 0) {
                 // Petite tempo pour pas relancer instantanément
                 if (Math.random() < 0.05) this.restart(); 
            }
            return;
        }

        // --- A. CONTRÔLE (INDEX / MAIN) ---
        this.handleInput(dt);

        // --- B. GÉNÉRATION OBSTACLES ---
        this.spawnTimer += dt;
        if (this.spawnTimer > this.pipeFrequency) {
            this.spawnPipe();
            this.spawnTimer = 0;
            this.speed += 0.05; // Accélération très progressive
        }

        // --- C. DÉPLACEMENT & COLLISIONS ---
        this.updatePipes(dt);
    }

    handleInput(dt) {
        const inputs = this.engine.inputs;
        let detected = false;
        let handY = 0.5; // Valeur par défaut (milieu)

        // Récupération de la main
        if (inputs && inputs.players && inputs.players.length > 0) {
            const p = inputs.players[0];
            if (p) {
                handY = p.y;
                detected = true;
            }
        }

        if (detected) {
            // --- C'EST ICI QUE TOUT SE JOUE ---
            // Mapping de l'écran (0..1) vers le Monde 3D (-10..10)
            
            // 1. On inverse : (1 - y) car MediaPipe 0 = Haut, ThreeJS +Y = Haut
            // 2. On décale : (0.5 - handY) pour que 0.5 soit le centre (0)
            // 3. On multiplie : 22 est l'amplitude verticale visible par la caméra
            const amplitude = 22; 
            const targetY = (0.5 - handY) * amplitude;

            // Lissage (Lerp) : 
            // 8.0 = Vitesse de réaction. 
            // Plus c'est haut, plus ça colle au doigt (mais ça tremble un peu).
            // Plus c'est bas, plus c'est fluide (mais un peu de retard).
            this.plane.position.y += (targetY - this.plane.position.y) * 8.0 * dt;
            
            // Limites (Plafond et Sol)
            this.plane.position.y = Math.max(-9, Math.min(9, this.plane.position.y));

            // Pencher l'avion selon la montée/descente
            const delta = targetY - this.plane.position.y;
            this.plane.rotation.z = -Math.PI / 2 + (delta * 0.1);

        } else {
            // Auto-pilote au centre si pas de main
            this.plane.position.y += (0 - this.plane.position.y) * 2 * dt;
            this.plane.rotation.z = -Math.PI / 2;
        }
    }

    spawnPipe() {
        // Hauteur du trou aléatoire
        // Amplitude réduite (-6 à 6) pour éviter des trous impossibles
        const gapY = (Math.random() - 0.5) * 12; 
        
        const pipeWidth = 3;
        const pipeGeo = new THREE.BoxGeometry(pipeWidth, 30, 2); // 30 de haut pour être sûr
        const pipeMat = new THREE.MeshPhongMaterial({ color: 0x22cc22 });

        // Tuyau du HAUT
        const topPipe = new THREE.Mesh(pipeGeo, pipeMat);
        // Position Y : Centre du trou + moitié hauteur tuyau + moitié gap
        topPipe.position.set(18, gapY + 15 + this.pipeGap/2, 0); 
        this.addObj(topPipe);
        
        // Tuyau du BAS
        const botPipe = new THREE.Mesh(pipeGeo, pipeMat);
        botPipe.position.set(18, gapY - 15 - this.pipeGap/2, 0);
        this.addObj(botPipe);

        this.pipes.push({ top: topPipe, bot: botPipe, passed: false });
    }

    updatePipes(dt) {
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const p = this.pipes[i];
            
            // Déplacement vers la gauche
            const move = this.speed * dt;
            p.top.position.x -= move;
            p.bot.position.x -= move;

            // --- COLLISIONS ---
            // On calcule les boîtes englobantes pour être précis
            const planeBox = new THREE.Box3().setFromObject(this.plane);
            // On réduit un peu la hitbox de l'avion pour être gentil (margin)
            planeBox.expandByScalar(-0.2); 

            const topBox = new THREE.Box3().setFromObject(p.top);
            const botBox = new THREE.Box3().setFromObject(p.bot);

            if (planeBox.intersectsBox(topBox) || planeBox.intersectsBox(botBox)) {
                this.gameOver();
            }

            // Score
            if (!p.passed && p.top.position.x < this.plane.position.x) {
                this.score++;
                p.passed = true;
                // Petit effet visuel ?
            }

            // Nettoyage hors écran
            if (p.top.position.x < -20) {
                this.removeObj(p.top);
                this.removeObj(p.bot);
                this.pipes.splice(i, 1);
            }
        }
    }

    createGround() {
        // Ligne d'horizon
        const geo = new THREE.PlaneGeometry(100, 5);
        const mat = new THREE.MeshBasicMaterial({ color: 0x114411 });
        this.ground = new THREE.Mesh(geo, mat);
        this.ground.position.y = -11;
        this.addObj(this.ground);
    }

    gameOver() {
        if (this.isGameOver) return;
        console.log("💥 CRASH !");
        this.isGameOver = true;
        this.plane.material.color.setHex(0xff0000);
        this.propeller.visible = false; // Hélice cassée
    }

    restart() {
        this.isGameOver = false;
        this.score = 0;
        this.speed = 8;
        
        // Nettoyer les tuyaux existants
        this.pipes.forEach(p => {
            this.removeObj(p.top);
            this.removeObj(p.bot);
        });
        this.pipes = [];
        
        // Reset Avion
        this.plane.position.set(-8, 0, 0);
        this.plane.material.color.setHex(0xffaa00);
        this.propeller.visible = true;
    }

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;
        
        // Score
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 4;
        ctx.font = "bold 50px 'Orbitron', sans-serif";
        ctx.textAlign = "center";
        
        const text = `${this.score}`;
        ctx.strokeText(text, w / 2, 80);
        ctx.fillText(text, w / 2, 80);

        if (this.isGameOver) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.fillRect(0, h/2 - 60, w, 120);
            
            ctx.fillStyle = "#ff5555";
            ctx.font = "bold 40px Arial";
            ctx.fillText("CRASH !", w / 2, h / 2 + 10);
            
            ctx.fillStyle = "white";
            ctx.font = "20px Arial";
            ctx.fillText("Bougez la main pour rejouer", w / 2, h / 2 + 40);
        }
    }

    // --- UTILS ---
    addObj(obj) {
        this.engine.display.scene.add(obj);
        this.meshes.push(obj);
    }
    
    removeObj(obj) {
        this.engine.display.scene.remove(obj);
        if(obj.geometry) obj.geometry.dispose();
        if(obj.material) obj.material.dispose();
    }

    exit() {
        this.meshes.forEach(m => this.removeObj(m));
        this.pipes.forEach(p => {
            this.removeObj(p.top);
            this.removeObj(p.bot);
        });
        this.meshes = [];
        this.pipes = [];
    }
}

// Enregistrement
Registry.register("SKY AVIATOR", SkyAviator, "#ffaa00");