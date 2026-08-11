import * as THREE from 'three';

export class TestState {
    constructor(game) {
        this.game = game;
        
        // Définition de notre bouton (en pixels)
        // On le met un peu décalé pour bien le voir
        this.button = {
            x: 200,
            y: 200,
            w: 300,
            h: 150,
            color: 'red',
            hover: false
        };
    }

    /**
     * Initialisation : On crée le Cube 3D ici
     */
    enter() {
        console.log("🛠️ TEST STATE : Initialisation...");

        // 1. Création du Cube Three.js
        const geometry = new THREE.BoxGeometry(3, 3, 3); // Taille 3x3x3
        // MeshNormalMaterial est génial pour le debug : il change de couleur selon l'angle
        const material = new THREE.MeshNormalMaterial(); 
        
        this.cube = new THREE.Mesh(geometry, material);
        
        // 2. On le cache par défaut
        this.cube.visible = false;

        // 3. On l'ajoute à la scène du Display
        this.game.display.scene.add(this.cube);
        
        // 4. On recule un peu la caméra pour bien voir le cube
        // (Par défaut elle est en Z=1, on la met en Z=10)
        this.game.display.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 100);
        this.game.display.camera.position.z = 10;
    }

    /**
     * Logique : On vérifie si la main touche le bouton
     */
    update(dt) {
        // A. Animation du cube (qu'il soit visible ou non)
        this.cube.rotation.x += 2 * dt;
        this.cube.rotation.y += 1 * dt;

        // B. Gestion de l'Input (Main)
        const input = this.game.inputs;
        
        // On récupère la première main détectée
        // input.players contient des objets {x, y, id} en coordonnées écran
        let hand = null;
        input.players.forEach(p => { if (p) hand = p; });

        this.handPos = hand; // On stocke pour le render

        // C. Test de Collision (Point vs Rectangle)
        if (hand) {
            if (hand.x > this.button.x && 
                hand.x < this.button.x + this.button.w &&
                hand.y > this.button.y && 
                hand.y < this.button.y + this.button.h) {
                
                // TOUCHÉ !
                this.button.hover = true;
                this.cube.visible = true; // Affiche le cube
            } else {
                // PAS TOUCHÉ
                this.button.hover = false;
                this.cube.visible = false; // Cache le cube
            }
        } else {
            // Pas de main détectée
            this.button.hover = false;
            this.cube.visible = false;
        }
    }

    /**
     * Dessin : L'interface 2D
     */
    render(display) {
        const ctx = display.ctx;

        // 1. Dessiner le BOUTON
        // Vert si survolé, Rouge sinon
        ctx.fillStyle = this.button.hover ? '#00ff00' : '#ff0000';
        ctx.fillRect(this.button.x, this.button.y, this.button.w, this.button.h);

        // Texte du bouton
        ctx.fillStyle = 'white';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
            this.button.hover ? "CUBE ACTIF !" : "TOUCH ME", 
            this.button.x + this.button.w / 2, 
            this.button.y + this.button.h / 2 + 10
        );

        // 2. Dessiner le CURSEUR (La main)
        // Indispensable pour savoir où on vise
        if (this.handPos) {
            ctx.beginPath();
            ctx.arc(this.handPos.x, this.handPos.y, 20, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // Message si pas de main
            ctx.fillStyle = 'white';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText("Levez une main...", display.virtW / 2, display.virtH - 50);
        }
    }

    /**
     * Nettoyage quand on quitte l'état
     */
    exit() {
        // On retire le cube de la scène pour ne pas polluer
        this.game.display.scene.remove(this.cube);
    }
}