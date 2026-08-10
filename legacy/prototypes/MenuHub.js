import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class MenuHub {
    constructor(game) {
        this.id = 'menu_hub';
        this.name = 'ARCADE HUB';
        this.game = game;

        this.gamesList = [];
        this.cards = [];
        this.selectedIndex = 0;
        this.rotationTarget = 0;
        this.rotationCurrent = 0;
        
        this.selectionTimer = 0;
        this.selectionDuration = 2.0;
        this.isSelecting = false;
        
        this.carouselGroup = new THREE.Group();
    }

    enter() {
        console.log("💿 HUB: Démarrage");
        this.game.inputs.setSmoothing(0.1); 

        // 1. Caméra
        const aspect = window.innerWidth / window.innerHeight;
        this.game.display.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.game.display.camera.position.set(0, 0, 25);
        this.game.display.camera.lookAt(0, 0, 0);

        // 2. Lumière
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        this.game.display.scene.add(ambient);

        // --- 3. RÉCUPÉRATION DES JEUX (ADAPTÉ À TON REGISTRY ARRAY) ---
        this.gamesList = [];
        
        // On récupère le tableau via .getAll()
        const allGames = Registry.getAll();

        allGames.forEach(gameData => {
            // gameData ressemble à : { name: "...", class: Class, color: "..." }
            
            // On ne met pas le Menu dans le Menu
            if (gameData.name !== 'ARCADE HUB') {
                this.gamesList.push(gameData);
            }
        });
        
        this.createCarousel();
        this.selectionTimer = 0;
    }

    createCarousel() {
        this.carouselGroup = new THREE.Group();
        this.cards = [];

        const radius = 12; 
        const count = this.gamesList.length;

        if (count === 0) {
            console.warn("⚠️ AUCUN JEU TROUVÉ (Liste vide).");
            return;
        }

        const angleStep = (Math.PI * 2) / count;

        this.gamesList.forEach((gameData, i) => {
            // --- CORRECTION D'ACCÈS AUX PROPRIÉTÉS ---
            // Ton Registry utilise .name, .class, .color
            const GameClass = gameData.class; 
            const gameName = gameData.name;
            const gameColor = gameData.color || '#444';

            try {
                // Instanciation temporaire (juste pour vérifier que la classe est valide)
                // Si GameClass n'est pas un constructeur, ça plantera ici et ira dans le catch
                new GameClass(this.game);
                
                // Carte 3D
                const geo = new THREE.PlaneGeometry(8, 5);
                const canvas = document.createElement('canvas');
                canvas.width = 256; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                
                // Fond
                ctx.fillStyle = gameColor;
                ctx.fillRect(0, 0, 256, 128);
                // Bordure
                ctx.strokeStyle = "white"; ctx.lineWidth = 10;
                ctx.strokeRect(0, 0, 256, 128);
                // Texte
                ctx.fillStyle = "white"; ctx.font = "bold 30px Arial"; ctx.textAlign = "center";
                
                const words = gameName.split(" ");
                words.forEach((w, wi) => {
                    ctx.fillText(w, 128, 64 - ((words.length-1)*15) + (wi*35));
                });
                
                const tex = new THREE.CanvasTexture(canvas);
                const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
                const mesh = new THREE.Mesh(geo, mat);
                
                // Positionnement
                const angle = i * angleStep;
                mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
                mesh.lookAt(0, 0, 0); 
                mesh.rotation.y += Math.PI; 

                this.carouselGroup.add(mesh);
                
                // On stocke la réf pour pouvoir lancer le jeu
                this.cards.push({ mesh, GameClass, angle });

            } catch (err) {
                console.error(`❌ HUB: Impossible de créer la carte pour '${gameName}'`, err);
            }
        });

        this.game.display.scene.add(this.carouselGroup);
    }

    update(dt) {
        const inputs = this.game.inputs;
        const screenW = this.game.display.virtW || window.innerWidth;

        if (inputs.players.length > 0) {
            const p = inputs.players[0];
            const normX = p.x / screenW; 

            // Navigation
            if (normX < 0.3) {
                this.rotationTarget -= dt * 2; 
                this.isSelecting = false; this.selectionTimer = 0;
            } else if (normX > 0.7) {
                this.rotationTarget += dt * 2; 
                this.isSelecting = false; this.selectionTimer = 0;
            } else {
                // Sélection
                const count = this.cards.length; // Utiliser this.cards.length car certains jeux ont pu échouer
                if (count > 0) {
                    const step = (Math.PI * 2) / count;
                    const snapIndex = Math.round(this.rotationTarget / step);
                    this.rotationTarget += (snapIndex * step - this.rotationTarget) * 5 * dt;

                    let actualIndex = (-snapIndex) % count;
                    if (actualIndex < 0) actualIndex += count;
                    this.selectedIndex = actualIndex;

                    this.isSelecting = true;
                    this.selectionTimer += dt;

                    if (this.selectionTimer >= this.selectionDuration) {
                        const selectedGame = this.cards[this.selectedIndex].GameClass;
                        console.log("🚀 HUB: Lancement de", selectedGame.name);
                        this.game.loadGame(selectedGame);
                    }
                }
            }
        }

        // Animation
        this.rotationCurrent += (this.rotationTarget - this.rotationCurrent) * 5 * dt;
        this.carouselGroup.rotation.y = this.rotationCurrent;

        // Highlight
        this.cards.forEach((c, i) => {
            if (i === this.selectedIndex && this.isSelecting) {
                c.mesh.scale.setScalar(1.2);
                c.mesh.material.color.setHex(0xffffff);
            } else {
                c.mesh.scale.setScalar(1.0);
                c.mesh.material.color.setHex(0xaaaaaa);
            }
        });
    }

    render(display) {
        display.renderer.render(this.game.display.scene, this.game.display.camera);
        
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.save();
        ctx.textAlign = "center";
        
        if (this.isSelecting) {
            const progress = this.selectionTimer / this.selectionDuration;
            ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(w/2 - 100, h/2 + 100, 200, 20);
            ctx.fillStyle = "#00ffff"; ctx.fillRect(w/2 - 100, h/2 + 100, 200 * progress, 20);
            ctx.fillStyle = "white"; ctx.font = "20px Arial"; ctx.fillText("Lancement...", w/2, h/2 + 140);
        } else {
            ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "30px Arial";
            ctx.fillText("👋 GAUCHE / DROITE pour tourner", w/2, h - 50);
            ctx.fillText("✋ RESTEZ AU CENTRE pour choisir", w/2, h - 90);
        }
        ctx.restore();
    }

    exit() {
        this.game.display.scene.remove(this.carouselGroup);
    }
}

// L'enregistrement doit matcher la signature de ton Registry.register(name, class, color)
Registry.register("ARCADE HUB", MenuHub, "#222");