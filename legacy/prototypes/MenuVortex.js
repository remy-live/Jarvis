import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class MenuVortex {
    constructor(game) {
        this.id = 'menu_vortex';
        this.name = 'ARCADE VORTEX';
        this.game = game;

        this.gamesList = [];
        this.cards = [];
        
        // Navigation
        this.selectedIndex = 0;
        this.rotY = 0; // Rotation du carrousel
        this.targetRotY = 0;
        this.tiltX = 0; // Inclinaison caméra (Regarder haut/bas)
        
        // Sélection
        this.selectionTimer = 0;
        this.selectionDuration = 1.5;
        this.isTransitioning = false; // Quand on a choisi, on zoom !

        // Groupes 3D
        this.sceneGroup = new THREE.Group(); // Contient tout
        this.carouselGroup = new THREE.Group();
        this.particles = null; // Le champ d'étoiles
        this.cursorParticles = null; // L'essaim qui suit la main
    }

    enter() {
        console.log("🌌 VORTEX: Initialisation");
        this.game.inputs.setSmoothing(0.12); // Lissage "cinématique"

        // 1. Caméra (Grand angle pour l'immersion)
        const aspect = window.innerWidth / window.innerHeight;
        this.game.display.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
        this.game.display.camera.position.set(0, 0, 18);

        // 2. Lumières (Ambiance Cyberpunk sombre)
        const ambient = new THREE.AmbientLight(0xffffff, 0.2);
        this.game.display.scene.add(ambient);
        
        // Spot qui éclaire la carte active
        this.spotLight = new THREE.SpotLight(0x00ffff, 10, 50, Math.PI/4, 0.5, 1);
        this.spotLight.position.set(0, 10, 10);
        this.spotLight.target.position.set(0, 0, 0);
        this.game.display.scene.add(this.spotLight);
        this.game.display.scene.add(this.spotLight.target);

        // 3. Création des éléments
        this.createStarField();
        this.createHandCursor();
        this.buildCarousel();

        this.game.display.scene.add(this.sceneGroup);
        this.sceneGroup.add(this.carouselGroup);
    }

    // --- A. LE CHAMP D'ÉTOILES (Particules d'ambiance) ---
    createStarField() {
        const count = 1000;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Position aléatoire dans un grand cube
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100 - 20; // Surtout au fond
            sizes[i] = Math.random() * 2;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Shader simple pour des points brillants
        const mat = new THREE.PointsMaterial({
            color: 0x88ccff,
            size: 0.5,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geo, mat);
        this.sceneGroup.add(this.particles);
    }

    // --- B. L'ESSAIM (Curseur Main) ---
    createHandCursor() {
        // Un petit nuage de particules qui suivra la main
        const count = 50;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        
        for(let i=0; i<count; i++) {
            positions[i*3] = (Math.random()-0.5);
            positions[i*3+1] = (Math.random()-0.5);
            positions[i*3+2] = (Math.random()-0.5);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const mat = new THREE.PointsMaterial({
            color: 0xff00ff, // Magenta
            size: 0.3,
            blending: THREE.AdditiveBlending,
            transparent: true
        });

        this.cursorParticles = new THREE.Points(geo, mat);
        this.sceneGroup.add(this.cursorParticles);
    }

    // --- C. LES CARTES DE JEU (Style Verre) ---
    buildCarousel() {
        this.gamesList = Registry.getAll().filter(g => g.name !== 'ARCADE VORTEX'); // On s'exclut soi-même
        this.cards = [];
        
        const radius = 9;
        const count = this.gamesList.length;
        if(count === 0) return;
        const angleStep = (Math.PI * 2) / count;

        this.gamesList.forEach((data, i) => {
            const GameClass = data.class;
            
            // 1. Cadre (Mesh)
            const geo = new THREE.PlaneGeometry(6, 4);
            
            // 2. Texture Texte
            const canvas = document.createElement('canvas');
            canvas.width = 512; canvas.height = 340;
            const ctx = canvas.getContext('2d');
            
            // Fond semi-transparent (Effet Verre)
            ctx.fillStyle = "rgba(0, 20, 40, 0.8)";
            ctx.fillRect(0,0,512,340);
            
            // Bordure Néon
            ctx.lineWidth = 15;
            ctx.strokeStyle = data.color || "#00ffff";
            ctx.strokeRect(0,0,512,340);
            
            // Texte
            ctx.font = "bold 60px 'Orbitron', sans-serif";
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.shadowColor = data.color; ctx.shadowBlur = 20;
            
            const words = data.name.split(" ");
            words.forEach((w, idx) => {
                ctx.fillText(w, 256, 170 - ((words.length-1)*35) + (idx*70));
            });

            const tex = new THREE.CanvasTexture(canvas);
            
            // Matériau "Standard" pour réagir à la lumière
            const mat = new THREE.MeshStandardMaterial({
                map: tex,
                transparent: true,
                opacity: 0.9,
                roughness: 0.2,
                metalness: 0.8,
                emissive: new THREE.Color(data.color),
                emissiveIntensity: 0.2, // Faible lueur par défaut
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geo, mat);
            
            // Position cylindrique
            const angle = i * angleStep;
            mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
            mesh.rotation.y = angle + Math.PI; // Face au centre
            
            this.carouselGroup.add(mesh);
            this.cards.push({ mesh, GameClass, angle, color: data.color });
        });
    }

    update(dt) {
        const inputs = this.game.inputs;
        
        // --- 1. ANIMATION AMBIANCE ---
        // Les étoiles avancent vers nous (Warp)
        const starPos = this.particles.geometry.attributes.position.array;
        for(let i=1; i<starPos.length; i+=3) {
            starPos[i+2] += dt * 10; // Vitesse Z
            if(starPos[i+2] > 20) starPos[i+2] -= 100; // Reset au fond
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
        this.particles.rotation.z += dt * 0.05; // Le ciel tourne doucement


        // --- 2. INPUT & INTERACTION ---
        if (inputs.players.length > 0 && !this.isTransitioning) {
            const p = inputs.players[0];
            const screenW = this.game.display.virtW || window.innerWidth;
            const screenH = this.game.display.virtH || window.innerHeight;

            // Mapping Position Main
            const normX = (p.x / screenW - 0.5) * 2; // -1 (Gauche) à +1 (Droite)
            const normY = -(p.y / screenH - 0.5) * 2; // -1 (Bas) à +1 (Haut)

            // A. Curseur "Essaim"
            // Le curseur suit la main en 3D
            this.cursorParticles.position.set(normX * 8, normY * 5, 10);
            this.cursorParticles.rotation.x += dt * 2;
            this.cursorParticles.rotation.y += dt * 2;

            // B. Rotation Carrousel (Navigation)
            // Si main à gauche/droite, on tourne
            if (Math.abs(normX) > 0.3) {
                this.targetRotY -= normX * dt * 2.5; 
                this.selectionTimer = 0;
            } else {
                // Centre -> Snap
                const count = this.cards.length;
                if(count > 0) {
                    const step = (Math.PI * 2) / count;
                    const snapIndex = Math.round(this.targetRotY / step);
                    // Force douce vers le slot
                    this.targetRotY += (snapIndex * step - this.targetRotY) * 5 * dt;

                    // Calcul Index sélectionné
                    let idx = (-snapIndex) % count;
                    if (idx < 0) idx += count;
                    this.selectedIndex = idx;
                    
                    this.selectionTimer += dt;
                }
            }

            // C. Parallaxe (Inclinaison tête)
            // Si on lève la main, on regarde vers le haut
            this.tiltX += (normY * 0.2 - this.tiltX) * 2 * dt;
        }

        // --- 3. APPLICATION MOUVEMENTS ---
        // Lissage de la rotation
        this.rotY += (this.targetRotY - this.rotY) * 6 * dt;
        this.carouselGroup.rotation.y = this.rotY;
        
        // Inclinaison du groupe entier
        this.sceneGroup.rotation.x = this.tiltX;
        this.sceneGroup.rotation.z = -this.tiltX * 0.5; // Petit roll pour le style


        // --- 4. EFFETS VISUELS CARTES ---
        this.cards.forEach((c, i) => {
            const isSelected = (i === this.selectedIndex);
            
            // Scale : La carte active grossit
            const targetScale = isSelected ? 1.3 : 0.9;
            c.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), dt * 5);
            
            // Glow : La carte active brille fort
            const targetEmissive = isSelected ? 2.5 : 0.2;
            c.mesh.material.emissiveIntensity += (targetEmissive - c.mesh.material.emissiveIntensity) * 5 * dt;

            // Feedback Selection (Tremblement avant lancement)
            if (isSelected && this.selectionTimer > 0) {
                const shake = (this.selectionTimer / this.selectionDuration) * 0.1;
                c.mesh.position.x += (Math.random()-0.5)*shake;
                c.mesh.position.y += (Math.random()-0.5)*shake;
                
                // Barre de chargement via couleur
                // On vire au blanc pur quand c'est presque bon
                if (this.selectionTimer > 1.0) c.mesh.material.emissive.setHex(0xffffff);
                else c.mesh.material.emissive.setHex(parseInt(c.color.replace('#','0x')));
            } else {
                // Reset position (car on l'a fait trembler)
                const angle = c.angle; 
                const radius = 9;
                c.mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
                // Reset couleur
                c.mesh.material.emissive.setHex(parseInt(c.color.replace('#','0x')));
            }
        });

        // --- 5. TRANSITION DE LANCEMENT ---
        if (this.selectionTimer >= this.selectionDuration && !this.isTransitioning) {
            this.isTransitioning = true;
            console.log("🚀 VORTEX: WARP ENGAGED!");
            
            // Effet Zoom Avant (On fonce dans la carte)
            const targetGame = this.cards[this.selectedIndex].GameClass;
            
            // Animation manuelle avant de changer l'état
            const zoomInterval = setInterval(() => {
                this.game.display.camera.position.z -= 1;
                if(this.game.display.camera.position.z < 2) {
                    clearInterval(zoomInterval);
                    this.game.loadGame(targetGame);
                }
            }, 16);
        }
    }

    render(display) {
        display.renderer.render(this.game.display.scene, this.game.display.camera);
        
        // HUD Minimaliste
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.save();
        ctx.textAlign = "center";
        
        if (this.selectionTimer > 0 && !this.isTransitioning) {
            // Cercle de chargement autour de la main
            const inputs = this.game.inputs;
            if(inputs.players.length > 0) {
                const p = inputs.players[0];
                const progress = this.selectionTimer / this.selectionDuration;
                
                ctx.beginPath();
                ctx.arc(p.x, p.y, 40, 0, Math.PI * 2 * progress);
                ctx.strokeStyle = "#00ffff";
                ctx.lineWidth = 5;
                ctx.stroke();
            }
        }
        
        // Instructions discrètes
        ctx.font = "20px 'Orbitron'";
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillText("👋 BALAYER POUR TOURNER  •  ✋ VISER POUR CHOISIR", w/2, h - 30);
        
        ctx.restore();
    }

    exit() {
        // Nettoyage
        this.game.display.scene.remove(this.sceneGroup);
        this.game.display.scene.remove(this.spotLight);
        this.game.display.scene.remove(this.spotLight.target);
        this.cards.forEach(c => {
            c.mesh.geometry.dispose();
            c.mesh.material.map.dispose();
            c.mesh.material.dispose();
        });
    }
}

Registry.register("ARCADE VORTEX", MenuVortex, "#8800ff");