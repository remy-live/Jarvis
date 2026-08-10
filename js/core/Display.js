import * as THREE from 'three';

/**
 * AFFICHAGE
 *
 * Empile quatre couches :
 *   1. #background-picture : fond CSS
 *   2. #three-canvas       : rendu 3D (Three.js)
 *   3. #layer-2d           : éléments DOM/CSS (masques, menus HTML)
 *   4. #ui-canvas          : rendu 2D (HUD, jeux canvas)
 */
export class Display {
    constructor() {
        this.threeCanvas = document.getElementById('three-canvas');
        this.uiCanvas = document.getElementById('ui-canvas');
        this.ctx = this.uiCanvas.getContext('2d');
        this.gameLayer = document.getElementById('layer-2d');
        this.bgLayer = document.getElementById('background-picture');

        this.feedbackCanvas = document.getElementById('feedback-canvas');
        this.feedbackCtx = this.feedbackCanvas.getContext('2d');

        // --- Three.js ---
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.threeCanvas,
            antialias: true,
            alpha: true // indispensable : on voit la webcam derrière
        });
        // Au-delà de 2, le gain visuel est nul et le coût GPU double
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.virtW = 0;
        this.virtH = 0;
        this.onResize();

        this._onResize = () => this.onResize();
        window.addEventListener('resize', this._onResize);
    }

    setBackground(cssValue) {
        if (this.bgLayer) this.bgLayer.style.background = cssValue;
    }

    /** Remet l'affichage à zéro entre deux jeux (et libère la mémoire GPU). */
    reset() {
        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const object = this.scene.children[i];
            this.scene.remove(object);
            disposeObject(object);
        }

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;

        if (this.gameLayer) {
            this.gameLayer.innerHTML = '';
            this.gameLayer.removeAttribute('style');
        }

        // Certains jeux bidouillent le canvas UI : on le remet d'aplomb
        this.uiCanvas.removeAttribute('style');

        this.setBackground('radial-gradient(circle, #222 0%, #000 100%)');
        this.clear();
    }

    onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        this.renderer.setSize(w, h);
        if (this.camera.isPerspectiveCamera) {
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        } else if (this.camera.isOrthographicCamera) {
            // On conserve la hauteur visible et on élargit selon le ratio
            const halfHeight = (this.camera.top - this.camera.bottom) / 2;
            this.camera.left = -halfHeight * (w / h);
            this.camera.right = halfHeight * (w / h);
            this.camera.updateProjectionMatrix();
        }

        this.uiCanvas.width = w;
        this.uiCanvas.height = h;

        this.virtW = w;
        this.virtH = h;
    }

    /** Coordonnées normalisées (0..1) -> pixels écran. */
    toVirtual(x, y) {
        return { x: x * this.virtW, y: y * this.virtH };
    }

    /** Coordonnées normalisées (0..1) -> pixels de la vignette de debug. */
    toFeedback(x, y, canvas) {
        return { x: x * canvas.width, y: y * canvas.height };
    }

    /**
     * Début de frame : on efface le canvas 2D.
     * Sans ça, un jeu qui ne nettoie pas lui-même empile ses HUD
     * (le score d'avant reste visible sous le nouveau).
     */
    beginFrame() {
        this.ctx.clearRect(0, 0, this.virtW, this.virtH);
    }

    /** Rendu 3D + nettoyage 2D (utilisé lors des changements de scène). */
    clear() {
        this.renderer.render(this.scene, this.camera);
        this.beginFrame();
    }

    /** Fin de frame (point d'accroche pour de futurs effets globaux). */
    done() {}

    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.renderer.dispose();
    }
}

/** Libère récursivement géométries, matériaux et textures d'un objet 3D. */
function disposeObject(object) {
    object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
            if (!material) continue;
            // Les textures ne sont pas libérées par material.dispose()
            for (const value of Object.values(material)) {
                if (value && value.isTexture) value.dispose();
            }
            material.dispose();
        }
    });
}
