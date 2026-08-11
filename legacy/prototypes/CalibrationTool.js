import * as THREE from 'three';
import { Registry } from '../core/GameRegistry.js';

export class CalibrationTool {
    constructor(game) {
        this.id = 'calibration';
        this.name = '🔧 CALIBRATION PRO';
        this.game = game;
        
        this.config = {
            scaleX: 35, 
            scaleY: 25, 
            scaleZ: 50,  
        };

        this.calibState = 'WAITING_CENTER'; 
        this.captureTimer = 0;
        this.captureDuration = 1.0; // Plus rapide

        // Données de référence (Le Zéro)
        this.refData = { size: 0, x: 0, y: 0 };

        // Lissage indépendant par axe
        this.smoothed = { x: 0, y: 0, z: 0 };
        
        // Pour le lissage dynamique
        this.lastTarget = { x:0, y:0, z:0 };

        this.cube = null;
        this.room = null;
        this.targetRing = null;
        this.debugLine = null; // Pour voir ce qu'on mesure
    }

    enter() {
        console.log("🔧 CALIBRATION: Mode Ossature Rigide");
        
        const aspect = window.innerWidth / window.innerHeight;
        this.game.display.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        this.game.display.camera.position.set(0, 0, 45);
        this.game.display.camera.lookAt(0, 0, 0);

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.game.display.scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(0, 10, 20);
        this.game.display.scene.add(dir);

        this.createReferenceRoom();
        this.createCursorCube();
        
        this.calibState = 'WAITING_CENTER';
        this.captureTimer = 0;
    }

    createReferenceRoom() {
        const w = this.config.scaleX;
        const h = this.config.scaleY;
        const d = 30;

        // Boite
        const geo = new THREE.BoxGeometry(w, h, d);
        geo.translate(0, 0, -d/2);
        const edges = new THREE.EdgesGeometry(geo);
        this.room = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x333333 }));
        this.game.display.scene.add(this.room);

        // Cible
        const ringGeo = new THREE.RingGeometry(0.5, 0.7, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide });
        this.targetRing = new THREE.Mesh(ringGeo, ringMat);
        this.game.display.scene.add(this.targetRing);
        
        // Ligne de debug (visualise la mesure de la main)
        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0)]);
        this.debugLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffff00 }));
        this.game.display.scene.add(this.debugLine);
    }

    createCursorCube() {
        this.cube = new THREE.Mesh(
            new THREE.BoxGeometry(2, 2, 2),
            new THREE.MeshPhongMaterial({ color: 0x555555 })
        );
        this.game.display.scene.add(this.cube);
    }

    // --- CŒUR DU SYSTÈME ---
    // Calcule une taille de main qui ne change pas quand on bouge les doigts
    getRigidHandSize(player, display) {
        // On a besoin des raw landmarks pour être précis
        // On suppose que InputSystem les stocke dans player.poseLandmarks (corps) 
        // OU qu'on a accès aux landmarks mains.
        // Comme ton InputSystem dessine la main, il a les données.
        // Si tu n'as pas stocké les 'landmarks' bruts de la main dans 'player',
        // on va utiliser une approximation via handCenter (paume) et wrist (poignet).
        
        // Méthode de secours robuste : Distance (Centre Paume) <-> (Index Tip)
        // MAIS on ne prend que la distance projetée si possible.
        
        // Le mieux : Si ton InputSystem a accès au landmark 0 (Wrist) et 9 (Middle MCP).
        // Si tu ne peux pas modifier InputSystem, on utilise la méthode visuelle
        
        if (player.handCenter && player.indexTip) {
             // On utilise Paume <-> Index mais on divise par 2 pour simuler l'os
             // C'est moins bon que l'os rigide, mais ça marchera avec ton code actuel.
             const dx = player.handCenter.x - player.indexTip.x;
             const dy = player.handCenter.y - player.indexTip.y;
             return Math.sqrt(dx*dx + dy*dy);
        }
        return 0;
    }

    update(dt) {
        const inputs = this.game.inputs;
        const screenW = this.game.display.virtW || window.innerWidth;
        const screenH = this.game.display.virtH || window.innerHeight;

        if (inputs.players && inputs.players.length > 0) {
            const p = inputs.players[0];
            const source = (p.face) ? p.face.nose : (p.handCenter || p);
            
            // 1. DATA BRUTES
            const rawX = source.x / screenW; 
            const rawY = source.y / screenH; 

            // Calcul Taille Rigide (Z)
            let currentSize = 0;
            
            // TENTATIVE D'ACCÈS AUX LANDMARKS BRUTS (Si dispo dans ton InputSystem modifié)
            // C'est la clé de la fiabilité.
            // Si tu n'as pas 'rawHand', utilise la méthode fallback
            if (p.handCenter && p.indexTip) {
                // Fallback : Centre Paume -> Index
                const dx = p.handCenter.x - p.indexTip.x;
                const dy = p.handCenter.y - p.indexTip.y;
                currentSize = Math.sqrt(dx*dx + dy*dy);
                
                // Debug visuel de la mesure
                const vecA = new THREE.Vector3( (p.handCenter.x/screenW -0.5)*30, -(p.handCenter.y/screenH -0.5)*20, 0);
                const vecB = new THREE.Vector3( (p.indexTip.x/screenW -0.5)*30, -(p.indexTip.y/screenH -0.5)*20, 0);
                this.debugLine.geometry.setFromPoints([vecA, vecB]);
            }

            // 2. LOGIQUE CALIBRATION
            if (this.calibState === 'WAITING_CENTER') {
                // Visualisation X/Y
                const visX = (rawX - 0.5) * this.config.scaleX;
                const visY = -(rawY - 0.5) * this.config.scaleY;
                this.cube.position.set(visX, visY, 0);

                // Est-ce centré ?
                const dist = Math.sqrt(Math.pow(rawX - 0.5, 2) + Math.pow(rawY - 0.5, 2));
                
                if (dist < 0.1 && currentSize > 10) {
                    this.captureTimer += dt;
                    // Feedback visuel
                    const progress = this.captureTimer / this.captureDuration;
                    this.targetRing.scale.setScalar(1 + progress * 0.5);
                    this.targetRing.material.color.setHSL(0.3 * progress, 1, 0.5);

                    if (this.captureTimer >= this.captureDuration) {
                        // VALIDATION
                        this.refData.size = currentSize;
                        this.refData.x = rawX;
                        this.refData.y = rawY;
                        this.calibState = 'CALIBRATED';
                        this.targetRing.visible = false;
                        this.debugLine.visible = false; // On cache la ligne
                    }
                } else {
                    this.captureTimer = 0;
                    this.targetRing.scale.setScalar(1);
                    this.targetRing.material.color.setHex(0x00ffff);
                }
            } 

            // 3. MODE JEU
            else if (this.calibState === 'CALIBRATED') {
                
                // Delta X/Y
                const deltaX = rawX - this.refData.x;
                const deltaY = rawY - this.refData.y;
                let targetX = deltaX * this.config.scaleX;
                let targetY = -(deltaY) * this.config.scaleY;

                // Delta Z (Scale)
                // On ajoute une "Deadzone" (Zone morte) : Si ça change peu, on ne bouge pas Z
                const ratio = currentSize / this.refData.size;
                let rawZ = (ratio - 1); 

                // DEADZONE Z : Si le changement est inférieur à 10%, on reste à 0
                if (Math.abs(rawZ) < 0.1) rawZ = 0;
                else rawZ = (rawZ > 0) ? rawZ - 0.1 : rawZ + 0.1; // On lisse la reprise

                let targetZ = rawZ * this.config.scaleZ;

                // CLAMP (Limites)
                const limX = this.config.scaleX / 2;
                const limY = this.config.scaleY / 2;
                targetX = Math.max(-limX, Math.min(limX, targetX));
                targetY = Math.max(-limY, Math.min(limY, targetY));
                targetZ = Math.max(-this.config.scaleZ, Math.min(5, targetZ));

                // --- LISSAGE DYNAMIQUE (LE SECRET) ---
                // Calcul de la distance entre cible et position actuelle
                const distMove = Math.sqrt(
                    Math.pow(targetX - this.smoothed.x, 2) + 
                    Math.pow(targetY - this.smoothed.y, 2) +
                    Math.pow(targetZ - this.smoothed.z, 2)
                );

                // Si on bouge beaucoup -> Smoothing faible (0.3) -> Réactif
                // Si on bouge peu -> Smoothing fort (0.05) -> Stable
                // C'est ça qui enlève le tremblement quand on essaie d'être immobile
                let dynamicSmooth = 0.05 + (Math.min(distMove, 5) / 5) * 0.25;
                
                this.smoothed.x += (targetX - this.smoothed.x) * dynamicSmooth;
                this.smoothed.y += (targetY - this.smoothed.y) * dynamicSmooth;
                this.smoothed.z += (targetZ - this.smoothed.z) * dynamicSmooth;

                this.cube.position.set(this.smoothed.x, this.smoothed.y, this.smoothed.z);
                
                // Couleur
                const depthColor = (this.smoothed.z + 20) / 40; 
                this.cube.material.color.setHSL(depthColor, 1, 0.5);
            }
        }
        
        if(this.cube) {
            this.cube.rotation.x += dt;
            this.cube.rotation.y += dt;
        }
    }

    render(display) {
        display.renderer.render(this.game.display.scene, this.game.display.camera);
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.save();
        ctx.textAlign = "center";
        
        if (this.calibState === 'WAITING_CENTER') {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, h/2 - 60, w, 120);
            ctx.font = "bold 30px 'Orbitron'";
            ctx.fillStyle = "white";
            ctx.fillText("PLACEZ LA MAIN AU CENTRE", w/2, h/2 - 10);
            
            // Barre jaune debug taille
            // ctx.fillStyle = "yellow";
            // ctx.fillRect(w/2 - 50, h/2 + 40, 100, 5);
        } else {
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(10, 10, 200, 60);
            ctx.textAlign = "left";
            ctx.font = "16px monospace";
            ctx.fillStyle = "#00ff00";
            ctx.fillText("✅ CALIBRÉ STABLE", 20, 30);
            ctx.fillStyle = "white";
            ctx.fillText(`Z: ${this.smoothed.z.toFixed(1)}`, 20, 50);
        }
        ctx.restore();
    }

    exit() {
        const s = this.game.display.scene;
        s.remove(this.cube);
        s.remove(this.room);
        if(this.targetRing) s.remove(this.targetRing);
        if(this.debugLine) s.remove(this.debugLine);
    }
}

Registry.register("CALIB PRO STABLE", CalibrationTool, "#ff00ff");