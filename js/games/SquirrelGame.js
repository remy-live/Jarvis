import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class SquirrelGame {
    constructor(game) {
        this.id = 'squirrel_nuts';
        this.name = 'LA MÂCHOIRE DE L\'ÉCUREUIL';
        this.game = game;
        this.color = '#8B4513'; // Marron écureuil

        // --- Config ---
        this.worldW = 32; // Largeur du monde 3D visible
        this.worldH = 24; // Hauteur du monde 3D visible
        this.spawnRate = 1.0; // Une noisette toutes les secondes au début
        this.nutSpeed = 10;   // Vitesse de chute
        this.mouthRadius = 1.5; // Taille de la zone de détection de la bouche

        // --- État ---
        this.score = 0;
        this.spawnTimer = 0;
        this.isPlaying = false;

        // --- Objets 3D ---
        this.playerMesh = null; // La tête de l'écureuil
        this.nuts = []; // Liste des noisettes actives
        
        // Ressources réutilisables (pour optimiser)
        this.nutGeo = new THREE.IcosahedronGeometry(0.8, 0); // Forme un peu anguleuse pour la noisette
        this.nutMat = new THREE.MeshStandardMaterial({ color: 0xCD853F, roughness: 0.8 });
    }

    enter() {
        console.log("🐿️ SQUIRREL: Démarrage !");
        
        // On veut un lissage moyen : assez réactif, mais pas trop tremblant
        this.game.inputs.setSmoothing(0.2);

        // 1. Caméra 2D (Vue de face fixe)
        const aspect = window.innerWidth / window.innerHeight;
        this.game.display.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.game.display.camera.position.set(0, 0, 30);
        this.game.display.camera.lookAt(0, 0, 0);

        // 2. Lumières (Ambiance forêt)
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.game.display.scene.add(ambient);
        const sun = new THREE.DirectionalLight(0xffd700, 1.0); // Lumière dorée
        sun.position.set(10, 20, 10);
        this.game.display.scene.add(sun);
        // Ajoutons une lumière d'appoint pour déboucher les ombres
        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
        fillLight.position.set(-10, -10, 10);
        this.game.display.scene.add(fillLight);

        // 3. Création du Joueur (L'écureuil)
        this.createPlayer();

        // 4. Reset
        this.score = 0;
        this.spawnRate = 1.0;
        this.spawnTimer = 0;
        this.nuts = [];
        this.isPlaying = true;
    }

    createPlayer() {
        // Une simple sphère brune pour représenter la tête/bouche
        const geo = new THREE.SphereGeometry(this.mouthRadius, 32, 32);
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513, // Marron foncé
            roughness: 0.6,
            metalness: 0.1
        });
        this.playerMesh = new THREE.Mesh(geo, mat);
        
        // Petit détail : un nez plus foncé pour l'orientation
        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0x3d1e0a })
        );
        nose.position.set(0, -0.5, 1.2); // Devant et un peu plus bas
        this.playerMesh.add(nose);

        this.game.display.scene.add(this.playerMesh);
    }

    spawnNut() {
        const nut = new THREE.Mesh(this.nutGeo, this.nutMat);
        
        // Position de départ aléatoire en haut de l'écran
        const startX = (Math.random() - 0.5) * (this.worldW - 2);
        nut.position.set(startX, this.worldH / 2 + 2, 0);
        
        // Rotation aléatoire initiale
        nut.rotation.set(Math.random(), Math.random(), Math.random());

        this.game.display.scene.add(nut);
        this.nuts.push({ mesh: nut, active: true });
    }

    update(dt) {
        if (!this.isPlaying) return;

        const inputs = this.game.inputs;
        const screenW = this.game.display.virtW || window.innerWidth;
        const screenH = this.game.display.virtH || window.innerHeight;

        // --- 1. GESTION DU JOUEUR (Via la BOUCHE) ---
        if (inputs.players.length > 0) {
            const p = inputs.players[0];
            
            // On vérifie si le tracking du visage est actif et a trouvé la bouche
            if (p.face && p.face.mouth) {
                const source = p.face.mouth;

                // Mapping des coordonnées 2D (0..1) vers le monde 3D
                // X : 0 (gauche) -> -worldW/2, 1 (droite) -> +worldW/2
                // Y : 0 (haut) -> +worldH/2, 1 (bas) -> -worldH/2 (Attention inversion Y)
                
                const targetX = (source.x / screenW - 0.5) * this.worldW;
                const targetY = -(source.y / screenH - 0.5) * this.worldH;

                // Application directe (le lissage est déjà fait par InputSystem V2)
                this.playerMesh.position.set(targetX, targetY, 0);
                
                // Petite rotation pour le fun quand on va sur les côtés
                this.playerMesh.rotation.z = -targetX * 0.02;
                this.playerMesh.rotation.x = targetY * 0.02;
            }
        }

        // --- 2. GESTION DES NOISETTES ---
        
        // Spawner
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnNut();
            this.spawnTimer = this.spawnRate;
            // Accélération progressive du jeu
            this.spawnRate = Math.max(0.3, this.spawnRate - 0.01);
            this.nutSpeed = Math.min(20, this.nutSpeed + 0.05);
        }

        // Mise à jour des noisettes existantes
        const playerSphere = new THREE.Sphere(this.playerMesh.position, this.mouthRadius);

        for (let i = this.nuts.length - 1; i >= 0; i--) {
            const nutData = this.nuts[i];
            const nutMesh = nutData.mesh;

            // Physique : chute
            nutMesh.position.y -= this.nutSpeed * dt;
            // Rotation pendant la chute
            nutMesh.rotation.x += dt * 2;
            nutMesh.rotation.y += dt;

            // Collision avec la bouche (MIAM !)
            // On utilise une sphère de collision simple autour de la noisette (rayon ~0.8)
            const nutSphere = new THREE.Sphere(nutMesh.position, 0.8);
            
            if (playerSphere.intersectsSphere(nutSphere)) {
                // MANGÉ !
                this.score++;
                this.game.display.scene.remove(nutMesh);
                this.nuts.splice(i, 1);
                // TODO: Ajouter un petit effet de particules ou un son ici
                console.log("Miam ! Score:", this.score);
                continue;
            }

            // Nettoyage si tombé trop bas
            if (nutMesh.position.y < -this.worldH / 2 - 5) {
                this.game.display.scene.remove(nutMesh);
                this.nuts.splice(i, 1);
                // Pas de pénalité pour l'instant, juste du score attack
            }
        }
    }

    render(display) {
        display.renderer.render(this.game.display.scene, this.game.display.camera);

        // HUD 2D
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.save();
        ctx.textAlign = "left";
        ctx.font = "bold 40px 'Orbitron', sans-serif";
        
        // Ombre pour le texte
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillText(`🌰 NOISETTES: ${this.score}`, 32, 62);
        
        // Texte couleur noisette
        ctx.fillStyle = "#CD853F";
        ctx.fillText(`🌰 NOISETTES: ${this.score}`, 30, 60);

        // Instructions si le score est faible
        if (this.score < 3) {
            ctx.textAlign = "center";
            ctx.font = "25px Arial";
            ctx.fillStyle = "white";
            ctx.fillText("Bougez votre tête pour manger avec la bouche !", w/2, h - 50);
        }
        
        ctx.restore();
    }

    exit() {
        // Nettoyage de la scène
        const s = this.game.display.scene;
        s.remove(this.playerMesh);
        this.nuts.forEach(n => {
            s.remove(n.mesh);
            // Pas besoin de dispose la géométrie/matériau ici car ils sont partagés et créés dans le constructeur
        });
        this.nuts = [];
        
        // On pense à nettoyer les lumières qu'on a ajoutées
        s.children.forEach(child => {
            if (child.isLight) s.remove(child);
        });
    }
}

Registry.register('squirrel_nuts',"LA MÂCHOIRE DE L'ÉCUREUIL", SquirrelGame, "#8B4513");