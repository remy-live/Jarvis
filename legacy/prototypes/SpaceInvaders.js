import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class SpaceInvaders {
    constructor(engine) {
        this.engine = engine;
    }

    enter() {
        console.log("👾 INVADERS: Démarrage...");
        
        // Setup Caméra
        const aspect = window.innerWidth / window.innerHeight;
        this.engine.display.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
        this.engine.display.camera.position.z = 10;

        // Un simple Cube Vert pour dire "C'est moi l'alien"
        const geo = new THREE.BoxGeometry(2, 2, 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        this.alien = new THREE.Mesh(geo, mat);
        this.engine.display.scene.add(this.alien);
    }

    update(dt) {
        // Il tourne juste sur lui-même
        if (this.alien) {
            this.alien.rotation.x += dt;
            this.alien.rotation.y += dt;
        }
    }

    render(display) {
        const ctx = display.ctx;
        ctx.fillStyle = "#00ff00";
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.fillText("SPACE INVADERS (WIP)", display.virtW / 2, 100);
        ctx.font = "20px Arial";
        ctx.fillText("Levez la main pour tirer (Bientôt...)", display.virtW / 2, display.virtH - 50);
    }

    exit() {
        this.engine.display.scene.remove(this.alien);
    }
}

// ✨ LA MAGIE DU REGISTRE ✨
// On l'enregistre avec une couleur Verte (#00ff00)
Registry.register("SPACE INVADERS", SpaceInvaders, "#00ff00");