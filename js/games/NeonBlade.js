import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class NeonBlade {
    constructor(game) {
        this.id = 'neon_blade';
        this.name = 'NEON BLADE';
        this.game = game;
        this.isMenu = false;
        // Config Gameplay
        this.gravity = -25;
        this.spawnRate = 0.8; 
        
        // État
        this.score = 0;
        this.spawnTimer = 0;
        this.targets = [];    // Les cubes à couper
        this.particles = [];  // Les explosions
        
        // Gestion de la Lame (Blade)
        this.blade = {
            active: false,
            points: [], // Historique des positions pour le tracé
            maxPoints: 8,
            mesh: null,
            lastPos: new THREE.Vector3()
        };
    }

    enter() {
        console.log("⚔️ NEON BLADE: Ready");
        
        // 1. CAMÉRA 2D (Fixe)
        const aspect = window.innerWidth / window.innerHeight;
        this.game.display.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.game.display.camera.position.set(0, 0, 30);
        this.game.display.camera.lookAt(0, 0, 0);

        // 2. LUMIÈRES
        const ambient = new THREE.AmbientLight(0xffffff, 0.2);
        this.game.display.scene.add(ambient);
        const light = new THREE.PointLight(0xffffff, 1, 50);
        light.position.set(0, 10, 20);
        this.game.display.scene.add(light);

        // 3. CRÉATION DU VISUEL DE LA LAME (Trail)
        // On utilise une ligne simple qui se mettra à jour dynamiquement
        const geometry = new THREE.BufferGeometry();
        // Pré-allocation de vertices (3 coord * maxPoints)
        const positions = new Float32Array(this.blade.maxPoints * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.LineBasicMaterial({ 
            color: 0x00ffff, 
            linewidth: 5, // Note: linewidth ne marche pas toujours sur WebGL Windows, mais c'est un bon fallback
            opacity: 0.8,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        
        this.blade.mesh = new THREE.Line(geometry, material);
        // On s'assure que la lame est toujours rendue devant tout
        this.blade.mesh.frustumCulled = false; 
        this.game.display.scene.add(this.blade.mesh);

        // Reset
        this.score = 0;
        this.targets = [];
        this.particles = [];
    }

    update(dt) {
        const inputs = this.game.inputs;
        const screenW = this.game.display.virtW || window.innerWidth;
        const screenH = this.game.display.virtH || window.innerHeight;

        // --- 1. GESTION DE LA LAME (INPUT) ---
        if (inputs.players && inputs.players.length > 0) {
            const p = inputs.players[0];
            // On utilise l'index pour la précision (ou le centre si tu préfères)
            const source = p.indexTip || p;

            // Conversion 2D -> 3D (Z=0)
            // L'écran fait environ 30 unités de large à cette distance Z=30
            // On re-map grossièrement pour que ça colle visuellement
            const worldW = 35; 
            const worldH = 20;

            const targetX = (source.x / screenW - 0.5) * worldW;
            const targetY = -(source.y / screenH - 0.5) * worldH;
            const currentPos = new THREE.Vector3(targetX, targetY, 0);

            this.blade.active = true;
            this._updateBladeTrail(currentPos);
            
            // DETECTION DE COUPE (Collision Continue)
            // On vérifie le segment entre l'ancienne position et la nouvelle
            // C'est ça qui permet de couper "vite" sans rater l'objet
            this._checkSlicing(this.blade.lastPos, currentPos);

            this.blade.lastPos.copy(currentPos);
        } else {
            this.blade.active = false;
            // Si pas de main, on vide le trail progressivement
            if (this.blade.points.length > 0) {
                this.blade.points.shift();
                this._updateBladeGeometry();
            }
        }

        // --- 2. GESTION DES CIBLES (TARGETS) ---
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this._spawnTarget();
            this.spawnTimer = this.spawnRate;
            // Accélération progressive
            if (this.spawnRate > 0.3) this.spawnRate -= 0.01;
        }

        for (let i = this.targets.length - 1; i >= 0; i--) {
            const t = this.targets[i];
            
            // Physique
            t.velocity.y += this.gravity * dt;
            t.mesh.position.add(t.velocity.clone().multiplyScalar(dt));
            
            // Rotation pour le style
            t.mesh.rotation.x += t.rotSpeed.x * dt;
            t.mesh.rotation.y += t.rotSpeed.y * dt;

            // Nettoyage (Tombé trop bas)
            if (t.mesh.position.y < -15) {
                this.game.display.scene.remove(t.mesh);
                t.mesh.geometry.dispose();
                this.targets.splice(i, 1);
            }
        }

        // --- 3. GESTION PARTICULES (FX) ---
        this._updateParticles(dt);
    }

    _updateBladeTrail(newPos) {
        // Ajout du point
        this.blade.points.push(newPos.clone());
        if (this.blade.points.length > this.blade.maxPoints) {
            this.blade.points.shift();
        }
        this._updateBladeGeometry();
    }

    _updateBladeGeometry() {
        const positions = this.blade.mesh.geometry.attributes.position.array;
        let index = 0;
        
        // On remplit le buffer
        for (let i = 0; i < this.blade.points.length; i++) {
            const p = this.blade.points[i];
            positions[index++] = p.x;
            positions[index++] = p.y;
            positions[index++] = p.z;
        }
        
        // Si on a moins de points que le max, on replie les derniers points sur eux-mêmes
        // pour éviter des traits qui partent vers 0,0,0
        const lastP = this.blade.points[this.blade.points.length-1];
        while (index < positions.length && lastP) {
            positions[index++] = lastP.x;
            positions[index++] = lastP.y;
            positions[index++] = lastP.z;
        }

        this.blade.mesh.geometry.attributes.position.needsUpdate = true;
    }

    _spawnTarget() {
        // Forme aléatoire (Cube ou Ico)
        const isBonus = Math.random() > 0.8;
        const geo = isBonus ? new THREE.IcosahedronGeometry(1.2) : new THREE.BoxGeometry(2, 2, 2);
        
        const color = isBonus ? 0xff00ff : (Math.random() > 0.5 ? 0x00ff00 : 0xffff00);
        const mat = new THREE.MeshPhongMaterial({ color: color, emissive: 0x222222 });
        
        const mesh = new THREE.Mesh(geo, mat);

        // Position départ (en bas, un peu aléatoire en X)
        const startX = (Math.random() - 0.5) * 20;
        mesh.position.set(startX, -12, 0);

        // Vélocité (Vers le haut, et un peu vers le centre)
        const velX = -startX * (0.5 + Math.random()); // Revient vers le centre
        const velY = 18 + Math.random() * 5; // Hauteur saut

        this.game.display.scene.add(mesh);

        this.targets.push({
            mesh: mesh,
            velocity: new THREE.Vector3(velX, velY, 0),
            rotSpeed: { x: Math.random()*2, y: Math.random()*2 },
            radius: 1.5, // Hitbox radius
            isBonus: isBonus
        });
    }

    _checkSlicing(p1, p2) {
        // p1 = position main frame précédente
        // p2 = position main frame actuelle
        
        // Rayon 2D pour collision segment-cercle simplifiée
        const segmentDir = new THREE.Vector3().subVectors(p2, p1);
        const segmentLen = segmentDir.length();
        
        if (segmentLen < 0.1) return; // Mouvement trop petit, pas de coupe

        const segmentDirNorm = segmentDir.clone().normalize();

        for (let i = this.targets.length - 1; i >= 0; i--) {
            const t = this.targets[i];
            const toTarget = new THREE.Vector3().subVectors(t.mesh.position, p1);
            
            // Projection du centre de l'objet sur la ligne de coupe
            const projection = toTarget.dot(segmentDirNorm);
            
            // Vérifier si la projection tombe SUR le segment
            let closestPoint;
            if (projection < 0) closestPoint = p1;
            else if (projection > segmentLen) closestPoint = p2;
            else closestPoint = p1.clone().add(segmentDirNorm.multiplyScalar(projection));

            // Distance finale
            const dist = closestPoint.distanceTo(t.mesh.position);

            if (dist < t.radius) {
                // COUPÉ !
                this._sliceTarget(i, closestPoint);
            }
        }
    }

    _sliceTarget(index, hitPos) {
        const t = this.targets[index];
        
        // Effet particules
        this._spawnExplosion(t.mesh.position, t.mesh.material.color);

        // Score
        this.score += t.isBonus ? 5 : 1;
        console.log("SLICE! Score:", this.score);

        // Suppression
        this.game.display.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.targets.splice(index, 1);
    }

    _spawnExplosion(pos, color) {
        // Création simple de particules (triangles)
        const count = 8;
        const geo = new THREE.TetrahedronGeometry(0.3);
        const mat = new THREE.MeshBasicMaterial({ color: color });

        for(let i=0; i<count; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            
            // Vitesse explosion
            const vel = new THREE.Vector3(
                (Math.random()-0.5) * 10,
                (Math.random()-0.5) * 10,
                (Math.random()-0.5) * 10
            );

            this.game.display.scene.add(mesh);
            this.particles.push({ mesh: mesh, velocity: vel, life: 1.0 });
        }
    }

    _updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt * 2; // Disparaît vite
            
            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
            p.mesh.rotation.x += dt * 5;
            p.mesh.scale.setScalar(p.life);

            if (p.life <= 0) {
                this.game.display.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }
    }

    render(display) {
        display.renderer.render(this.game.display.scene, this.game.display.camera);

        // HUD
        const ctx = display.ctx;
        ctx.save();
        ctx.font = "bold 60px 'Orbitron'";
        ctx.fillStyle = "#00ffff";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 4;
        ctx.textAlign = "center";
        
        ctx.strokeText(this.score, display.virtW / 2, 80);
        ctx.fillText(this.score, display.virtW / 2, 80);
        
        if (this.targets.length === 0 && this.spawnTimer > 0.5) {
             ctx.font = "20px Arial";
             ctx.fillStyle = "rgba(255,255,255,0.5)";
             ctx.fillText("READY?", display.virtW / 2, display.virtH / 2);
        }
        ctx.restore();
    }

    exit() {
        const s = this.game.display.scene;
        s.remove(this.blade.mesh);
        this.targets.forEach(t => s.remove(t.mesh));
        this.particles.forEach(p => s.remove(p.mesh));
        this.targets = [];
        this.particles = [];
    }
}

Registry.register("NEON BLADE", NeonBlade, "#00ffff");