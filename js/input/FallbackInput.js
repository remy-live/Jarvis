/**
 * ENTRÉES DE SECOURS (SOURIS / CLAVIER)
 *
 * Sert quand la webcam ou les modèles MediaPipe ne sont pas disponibles
 * (pas de caméra, `npm run setup` pas encore lancé, test rapide sur un
 * portable dans le train...).
 *
 * Elle fabrique de faux landmarks au même format que MediaPipe, ce qui
 * permet de jouer à TOUS les jeux sans rien changer dans leur code.
 *
 * Commandes :
 *   Joueur 1 : souris = position | clic gauche = pincer
 *              Espace = bras levés | E = bouche ouverte
 *   Joueur 2 : touche P pour l'activer, puis flèches = position
 *              Entrée = pincer | Maj droite = bras levés
 */

const POSE_POINTS = 33;
const FACE_POINTS = 478;
const HAND_POINTS = 21;

/** Crée un tableau de landmarks réutilisable (évite d'allouer à chaque frame). */
function makeLandmarkArray(count) {
    return Array.from({ length: count }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
}

function setPoint(list, index, x, y, z = 0) {
    const p = list[index];
    p.x = x;
    p.y = y;
    p.z = z;
}

export class FallbackInput {
    constructor() {
        // Position écran normalisée (0..1) de chaque joueur virtuel
        const slot = (active, x) => ({
            active, x, y: 0.5,
            pinch: false, handsUp: false,
            // Expressions du visage de synthèse, pilotées au clavier
            mouthOpen: false, eyesShut: false, wink: false,
            brows: false, smile: false, roll: 0
        });
        this.slots = [slot(true, 0.5), slot(false, 0.75)];

        // Buffers de landmarks (un jeu par joueur)
        this.buffers = this.slots.map(() => ({
            pose: makeLandmarkArray(POSE_POINTS),
            face: makeLandmarkArray(FACE_POINTS),
            hand: makeLandmarkArray(HAND_POINTS)
        }));

        this.keys = new Set();
        this._listeners = [];
        this._enabled = false;
    }

    enable() {
        if (this._enabled) return;
        this._enabled = true;

        const on = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            this._listeners.push([target, type, fn, opts]);
        };

        on(window, 'mousemove', (e) => {
            this.slots[0].x = e.clientX / window.innerWidth;
            this.slots[0].y = e.clientY / window.innerHeight;
        });
        on(window, 'mousedown', (e) => { if (e.button === 0) this.slots[0].pinch = true; });
        on(window, 'mouseup', (e) => { if (e.button === 0) this.slots[0].pinch = false; });

        // Support tactile (tablette / téléphone)
        const touch = (e) => {
            const t = e.touches[0];
            if (!t) return;
            this.slots[0].x = t.clientX / window.innerWidth;
            this.slots[0].y = t.clientY / window.innerHeight;
            this.slots[0].pinch = true;
        };
        on(window, 'touchstart', touch, { passive: true });
        on(window, 'touchmove', touch, { passive: true });
        on(window, 'touchend', () => { this.slots[0].pinch = false; }, { passive: true });

        on(window, 'keydown', (e) => {
            this.keys.add(e.code);
            if (e.code === 'KeyP') {
                this.slots[1].active = !this.slots[1].active;
                console.log(`🎮 Joueur 2 virtuel : ${this.slots[1].active ? 'ON' : 'OFF'}`);
            }
            // On empêche la page de scroller avec les flèches / espace
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        });
        on(window, 'keyup', (e) => this.keys.delete(e.code));
        on(window, 'blur', () => this.keys.clear());
    }

    disable() {
        for (const [target, type, fn, opts] of this._listeners) {
            target.removeEventListener(type, fn, opts);
        }
        this._listeners = [];
        this._enabled = false;
    }

    /**
     * Met à jour l'état des joueurs virtuels puis renvoie leurs "détections".
     * @param {number} dt - temps écoulé en secondes
     */
    sample(dt) {
        const k = this.keys;

        // Joueur 1 : souris, plus les expressions au clavier
        const p1 = this.slots[0];
        p1.handsUp = k.has('Space');
        p1.mouthOpen = k.has('KeyE');
        p1.eyesShut = k.has('KeyA');
        p1.wink = k.has('KeyZ');
        p1.brows = k.has('KeyS');
        p1.smile = k.has('KeyX');
        p1.roll = (k.has('KeyQ') ? 26 : 0) + (k.has('KeyD') ? -26 : 0);

        // Joueur 2 : flèches
        const p2 = this.slots[1];
        if (p2.active) {
            const speed = 0.6 * dt;
            if (k.has('ArrowLeft')) p2.x -= speed;
            if (k.has('ArrowRight')) p2.x += speed;
            if (k.has('ArrowUp')) p2.y -= speed;
            if (k.has('ArrowDown')) p2.y += speed;
            p2.x = Math.min(1, Math.max(0, p2.x));
            p2.y = Math.min(1, Math.max(0, p2.y));
            p2.pinch = k.has('Enter');
            p2.handsUp = k.has('ShiftRight');
            p2.mouthOpen = k.has('Numpad0');
            p2.eyesShut = k.has('Numpad1');
            p2.wink = k.has('Numpad2');
            p2.brows = k.has('Numpad3');
            p2.smile = k.has('Numpad4');
            p2.roll = (k.has('Numpad7') ? 26 : 0) + (k.has('Numpad9') ? -26 : 0);
        }

        return this.slots.map((slot, i) => this._buildDetection(slot, this.buffers[i]));
    }

    /** Fabrique des landmarks cohérents autour de la position du curseur. */
    _buildDetection(slot, buf) {
        if (!slot.active) return { active: false };

        // Les landmarks MediaPipe sont dans le repère caméra (non miroité) :
        // les jeux appliquent eux-mêmes `1 - x`. On inverse donc ici aussi.
        const cx = 1 - slot.x;
        const cy = slot.y;

        /* --- POSE (squelette simplifié mais complet) --- */
        const pose = buf.pose;
        setPoint(pose, 0, cx, cy);                                   // nez
        setPoint(pose, 11, cx + 0.10, cy + 0.13);                    // épaule gauche
        setPoint(pose, 12, cx - 0.10, cy + 0.13);                    // épaule droite
        setPoint(pose, 13, cx + 0.14, cy + 0.24);                    // coude gauche
        setPoint(pose, 14, cx - 0.14, cy + 0.24);                    // coude droit
        const wristY = slot.handsUp ? cy - 0.12 : cy + 0.34;
        setPoint(pose, 15, cx + 0.16, wristY);                       // poignet gauche
        setPoint(pose, 16, cx - 0.16, wristY);                       // poignet droit
        setPoint(pose, 23, cx + 0.07, cy + 0.42);                    // hanche gauche
        setPoint(pose, 24, cx - 0.07, cy + 0.42);                    // hanche droite
        setPoint(pose, 25, cx + 0.07, cy + 0.62);
        setPoint(pose, 26, cx - 0.07, cy + 0.62);
        setPoint(pose, 27, cx + 0.07, cy + 0.82);
        setPoint(pose, 28, cx - 0.07, cy + 0.82);

        /* --- VISAGE ---
           Les points sont posés dans un repère local (origine au nez),
           puis tournés selon l'inclinaison : ainsi le front, le menton et
           les yeux basculent ensemble, comme une vraie tête penchée. */
        const face = buf.face;
        const angle = (slot.roll || 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const place = (index, lx, ly) => setPoint(face, index, cx + lx * cos - ly * sin, cy + lx * sin + ly * cos);

        place(1, 0, 0);          // bout du nez
        place(10, 0, -0.11);     // haut du front
        place(152, 0, 0.11);     // menton

        const mouthGap = slot.mouthOpen ? 0.06 : 0.004;
        place(13, 0, 0.05);
        place(14, 0, 0.05 + mouthGap);

        // Coins de la bouche : ils s'écartent quand on sourit
        const mouthWidth = slot.smile ? 0.062 : 0.045;
        place(61, -mouthWidth, 0.05);
        place(291, mouthWidth, 0.05);

        // Paupières : fermées = fente, clin d'œil = un seul côté
        const rightShut = slot.eyesShut || slot.wink;
        const leftShut = slot.eyesShut;
        const rightGap = rightShut ? 0.003 : 0.025;
        const leftGap = leftShut ? 0.003 : 0.025;

        place(159, 0.04, -0.0325 - rightGap / 2);   // œil droit (haut)
        place(145, 0.04, -0.0325 + rightGap / 2);   // œil droit (bas)
        place(386, -0.04, -0.0325 - leftGap / 2);   // œil gauche (haut)
        place(374, -0.04, -0.0325 + leftGap / 2);   // œil gauche (bas)

        // Sourcils : ils montent quand on les lève
        const browLift = slot.brows ? 0.03 : 0.016;
        place(105, 0.04, -0.045 - browLift);
        place(334, -0.04, -0.045 - browLift);

        /* --- MAIN --- */
        const hand = buf.hand;
        for (let i = 0; i < HAND_POINTS; i++) setPoint(hand, i, cx, cy + 0.08);
        setPoint(hand, 0, cx, cy + 0.14);                            // poignet
        setPoint(hand, 9, cx, cy + 0.07);                            // base du majeur
        setPoint(hand, 8, cx, cy);                                   // bout de l'index
        setPoint(hand, 4, cx + (slot.pinch ? 0.02 : 0.10), cy + 0.03); // pouce

        return {
            active: true,
            screenX: slot.x,
            screenY: slot.y,
            pinch: slot.pinch,
            mouthOpen: slot.mouthOpen,
            pose,
            face,
            hand
        };
    }
}
