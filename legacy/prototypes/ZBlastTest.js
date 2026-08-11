import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class ZBlastTest {
    constructor(game) {
        this.id = 'z_blast';
        this.name = 'Z-Blast Test';
        this.game = game;
        this.state = 'WAITING'; // WAITING, CHARGING, FIRING

        // Configuration du geste
        this.handsTogetherThreshold = 0.15; // Distance max entre les poignets pour considérer qu'ils sont ensemble
        this.fireVelocityThreshold = -0.04; // Vitesse Z négative (vers l'avant) pour déclencher

        // État du geste
        this.previousZ = null;
        this.chargeLevel = 0; // 0 à 1

        // Objets 3D
        this.fireballs = [];
        this.debugHands = []; // Sphères pour visualiser les mains en 3D
        this.lights = [];
        this.environment = [];
    }

    enter() {
        console.log("💥 Z-BLAST: Initialisation...");
        
        // 1. CAMÉRA
        const aspect = window.innerWidth / window.innerHeight;
        this.game.display.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
        // Caméra un peu plus haute pour bien voir la profondeur
        this.game.display.camera.position.set(0, 2, 15); 
        this.game.display.camera.lookAt(0, 0, -10);

        // 2. LUMIÈRES
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.lights.push(ambient);
        this.game.display.scene.add(ambient);

        const point = new THREE.PointLight(0xff6600, 1.5, 50);
        point.position.set(0, 5, 5);
        this.lights.push(point);
        this.game.display.scene.add(point);

        // 3. ENVIRONNEMENT (Pour référence de profondeur)
        this.createEnvironment();
        this.createDebugHands();

        this.fireballs = [];
        this.state = 'WAITING';
        this.chargeLevel = 0;
    }

    createEnvironment() {
        // Sol grille
        const grid = new THREE.GridHelper(100, 50, 0xff0000, 0x440000);
        grid.position.y = -5;
        this.game.display.scene.add(grid);
        this.environment.push(grid);

        // Mur du fond cible
        const geo = new THREE.PlaneGeometry(50, 30);
        const mat = new THREE.MeshPhongMaterial({ color: 0x222222, side: THREE.DoubleSide });
        const wall = new THREE.Mesh(geo, mat);
        wall.position.z = -50;
        this.game.display.scene.add(wall);
        this.environment.push(wall);
    }

    createDebugHands() {
        // Deux sphères rouges pour voir où le système pense que sont nos mains
        const geo = new THREE.SphereGeometry(0.5, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        
        for (let i = 0; i < 2; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            this.game.display.scene.add(mesh);
            this.debugHands.push(mesh);
        }
    }

    update(dt) {
        const inputs = this.game.inputs;
        let pose = null;

        // 1. Récupération du POSE (Corps entier)
        if (inputs.players && inputs.players.length > 0) {
             // Grâce à ta correction d'InputSystem, poseLandmarks est dispo !
            pose = inputs.players[0].poseLandmarks;
        }

        // Reset debug visuals
        this.debugHands.forEach(h => h.visible = false);

        if (pose && pose[15] && pose[16]) {
            const leftWrist = pose[15];
            const rightWrist = pose[16];

            // --- A. VISUALISATION DEBUG (Crucial pour comprendre Z) ---
            // On projette les coordonnées normalisées de MP vers le monde 3D
            // X: -15 à +15, Y: -10 à +10, Z: C'est le plus dur. MP donne un Z relatif.
            // On multiplie le Z brut par un facteur arbitraire pour le rendre visible dans notre scène.
            
            const mapToWorld = (landmark) => {
                return new THREE.Vector3(
                    (landmark.x - 0.5) * -30, // Miroir X
                    (landmark.y - 0.5) * -20, // Inversion Y
                    landmark.z * -30 // Z brut * facteur d'échelle
                );
            };

            const leftPos = mapToWorld(leftWrist);
            const rightPos = mapToWorld(rightWrist);

            this.debugHands[0].position.copy(leftPos); this.debugHands[0].visible = true;
            this.debugHands[1].position.copy(rightPos); this.debugHands[1].visible = true;


            // --- B. LOGIQUE GESTUELLE ---
            
            // 1. Distance entre les mains
            // On utilise la distance 3D brute fournie par les landmarks
            const dx = leftWrist.x - rightWrist.x;
            const dy = leftWrist.y - rightWrist.y;
            const dz = leftWrist.z - rightWrist.z;
            const handsDistance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Position Z moyenne actuelle
            const currentAvgZ = (leftWrist.z + rightWrist.z) / 2;

            // Calcul de la vélocité Z (si on a une frame précédente)
            let zVelocity = 0;
            if (this.previousZ !== null) {
                zVelocity = (currentAvgZ - this.previousZ) / dt; // Vitesse par seconde
            }
            this.previousZ = currentAvgZ;


            // MACHINE À ÉTATS DU GESTE
            if (handsDistance < this.handsTogetherThreshold) {
                // Les mains sont jointes
                if (zVelocity < this.fireVelocityThreshold) {
                    // Mouvement RAPIDE vers l'avant (Z négatif)
                    if (this.state !== 'FIRING' && this.chargeLevel > 0.5) {
                        this.fire((leftPos.x + rightPos.x)/2, (leftPos.y + rightPos.y)/2);
                        this.state = 'FIRING';
                        this.chargeLevel = 0;
                    }
                } else {
                    // Mains jointes mais stables ou reculant -> CHARGE
                    this.state = 'CHARGING';
                    this.chargeLevel = Math.min(1, this.chargeLevel + dt * 2); // Charge en 0.5s
                }
            } else {
                // Mains séparées
                this.state = 'WAITING';
                this.chargeLevel = Math.max(0, this.chargeLevel - dt * 3); // Décharge rapide
            }
        }

        // --- C. GESTION DES BOULES DE FEU ---
        for (let i = this.fireballs.length - 1; i >= 0; i--) {
            const fb = this.fireballs[i];
            // Avance tout droit
            fb.mesh.position.z -= 50 * dt; // Vitesse rapide
            
            // Rotation pour l'effet
            fb.mesh.rotation.x += dt * 10;
            fb.mesh.rotation.y += dt * 15;

            // Nettoyage si trop loin
            if (fb.mesh.position.z < -100) {
                this.game.display.scene.remove(fb.mesh);
                this.game.display.scene.remove(fb.light);
                fb.mesh.geometry.dispose();
                fb.mesh.material.dispose();
                this.fireballs.splice(i, 1);
            }
        }
    }

    fire(x, y) {
        console.log("🔥 HADOUKEN !!!");
        
        // Mesh central (noyau blanc chaud)
        const geo = new THREE.SphereGeometry(1, 32, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
        const mesh = new THREE.Mesh(geo, mat);
        
        // Aura externe (orange transparent)
        const auraGeo = new THREE.SphereGeometry(1.8, 32, 32);
        const auraMat = new THREE.MeshPhongMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.6,
            emissive: 0xff4400
        });
        const aura = new THREE.Mesh(auraGeo, auraMat);
        mesh.add(aura);

        // Lumière attachée au projectile
        const light = new THREE.PointLight(0xff6600, 2, 20);
        light.position.set(0, 0, 0);
        mesh.add(light);

        // Position de départ (entre les mains, légèrement devant)
        mesh.position.set(x, y, -5); 

        this.game.display.scene.add(mesh);
        this.fireballs.push({ mesh: mesh, light: light });
    }

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        // HUD Debug Z
        ctx.save();
        ctx.fillStyle = "white";
        ctx.font = "20px monospace";
        ctx.textAlign = "left";
        
        ctx.fillText(`ETAT: ${this.state}`, 20, 50);
        
        // Barre de charge
        ctx.fillStyle = "#444";
        ctx.fillRect(20, 70, 200, 20);
        ctx.fillStyle = this.chargeLevel > 0.9 ? "#ffff00" : "#ff6600";
        ctx.fillRect(20, 70, 200 * this.chargeLevel, 20);
        ctx.strokeStyle = "white";
        ctx.strokeRect(20, 70, 200, 20);

        if (this.state === 'FIRING') {
             ctx.fillStyle = "#ffff00";
             ctx.font = "bold 60px 'Orbitron'";
             ctx.textAlign = "center";
             ctx.fillText("KAMEHAMEHA!", w/2, h/2);
        }

        // Instructions
        if (this.state === 'WAITING' && this.chargeLevel === 0) {
             ctx.fillStyle = "rgba(255,255,255,0.7)";
             ctx.textAlign = "center";
             ctx.font = "30px Arial";
             ctx.fillText("Joignez les mains et poussez fort !", w/2, h - 50);
        }
        ctx.restore();
    }

    exit() {
        const s = this.game.display.scene;
        this.environment.forEach(o => s.remove(o));
        this.lights.forEach(l => s.remove(l));
        this.debugHands.forEach(h => s.remove(h));
        this.fireballs.forEach(fb => {
            s.remove(fb.mesh); s.remove(fb.light);
        });
        this.environment = []; this.lights = []; this.debugHands = []; this.fireballs = [];
    }
}

Registry.register("Z-BLAST TEST", ZBlastTest, "#ff6600");