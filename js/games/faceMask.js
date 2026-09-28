import { THEME, alpha } from '../core/Theme.js';

/**
 * MASQUES DE VISAGE
 *
 * Dessine un déguisement qui suit la tête, à partir du maillage facial
 * de MediaPipe. Tout est tracé dans un repère local (centre = nez, axe
 * vertical = front→menton), donc le masque suit naturellement les
 * rotations et l'éloignement.
 *
 * Aucune image : que des formes, donc rien à télécharger et une allure
 * cohérente avec le reste de la borne.
 */

// Points d'ancrage du maillage MediaPipe
const NOSE = 1;
const FOREHEAD = 10;
const CHIN = 152;
const CHEEK_LEFT = 234;
const CHEEK_RIGHT = 454;

export const MASKS = ['renard', 'ecureuil', 'pirate', 'robot', 'lunettes'];

/** Repère local du visage : centre, échelle, inclinaison. */
export function faceFrame(landmarks, display) {
    const nose = landmarks[NOSE];
    const forehead = landmarks[FOREHEAD];
    const chin = landmarks[CHIN];
    const left = landmarks[CHEEK_LEFT];
    const right = landmarks[CHEEK_RIGHT];
    if (!nose || !forehead || !chin) return null;

    const toScreen = (point) => display.toVirtual(1 - point.x, point.y);

    const center = toScreen(nose);
    const top = toScreen(forehead);
    const bottom = toScreen(chin);

    const height = Math.hypot(bottom.x - top.x, bottom.y - top.y);
    const width = left && right
        ? Math.hypot(toScreen(right).x - toScreen(left).x, toScreen(right).y - toScreen(left).y)
        : height * 0.8;

    // L'angle du vecteur menton→front donne l'inclinaison de la tête
    const angle = Math.atan2(top.y - bottom.y, top.x - bottom.x) + Math.PI / 2;

    return { x: center.x, y: center.y, height, width, angle };
}

/**
 * Dessine un masque sur le visage.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks - maillage facial brut (repère caméra)
 * @param {object} display
 * @param {'renard'|'ecureuil'|'pirate'|'robot'|'lunettes'} kind
 * @param {object} [options]
 * @param {number} [options.mouthOpen=0] - ouverture de la bouche (0 à 1),
 *        pour les masques qui s'animent (l'écureuil ouvre la sienne)
 */
export function drawMask(ctx, landmarks, display, kind = 'renard', options = {}) {
    const frame = faceFrame(landmarks, display);
    if (!frame) return;

    ctx.save();
    ctx.translate(frame.x, frame.y);
    ctx.rotate(frame.angle);

    // Unité de travail : la hauteur du visage. Tout est exprimé en
    // fractions, donc le masque grandit quand on s'approche.
    const u = frame.height;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    switch (kind) {
        case 'ecureuil': drawSquirrel(ctx, u, options.mouthOpen || 0); break;
        case 'pirate': drawPirate(ctx, u); break;
        case 'robot': drawRobot(ctx, u); break;
        case 'lunettes': drawGlasses(ctx, u); break;
        default: drawFox(ctx, u); break;
    }

    ctx.restore();
}

/* ------------------------------------------------------------------ */

function drawFox(ctx, u) {
    const fur = '#a9764b';
    const dark = '#6b4a30';

    // Oreilles
    [-1, 1].forEach((side) => {
        ctx.fillStyle = fur;
        ctx.beginPath();
        ctx.moveTo(side * 0.34 * u, -0.52 * u);
        ctx.lineTo(side * 0.16 * u, -0.98 * u);
        ctx.lineTo(side * 0.52 * u, -0.74 * u);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = alpha('#1f2327', 0.55);
        ctx.beginPath();
        ctx.moveTo(side * 0.32 * u, -0.58 * u);
        ctx.lineTo(side * 0.23 * u, -0.86 * u);
        ctx.lineTo(side * 0.44 * u, -0.72 * u);
        ctx.closePath();
        ctx.fill();
    });

    // Loup sur les yeux
    ctx.fillStyle = alpha(fur, 0.92);
    ctx.beginPath();
    ctx.moveTo(-0.46 * u, -0.28 * u);
    ctx.quadraticCurveTo(0, -0.46 * u, 0.46 * u, -0.28 * u);
    ctx.quadraticCurveTo(0.34 * u, 0.06 * u, 0, -0.04 * u);
    ctx.quadraticCurveTo(-0.34 * u, 0.06 * u, -0.46 * u, -0.28 * u);
    ctx.fill();

    // Trous des yeux
    ctx.globalCompositeOperation = 'destination-out';
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.ellipse(side * 0.22 * u, -0.2 * u, 0.13 * u, 0.09 * u, 0, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';

    // Museau
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 0.06 * u, 0.09 * u, 0.06 * u, 0, 0, Math.PI * 2);
    ctx.fill();

    // Moustaches
    ctx.strokeStyle = alpha('#e7e9ec', 0.6);
    ctx.lineWidth = Math.max(1, u * 0.012);
    [-1, 1].forEach((side) => {
        [-0.04, 0.02, 0.08].forEach((offset, i) => {
            ctx.beginPath();
            ctx.moveTo(side * 0.1 * u, (0.05 + offset * 0.4) * u);
            ctx.lineTo(side * 0.42 * u, (0.02 + offset) * u);
            ctx.stroke();
        });
    });
}

/**
 * Écureuil : oreilles rondes, joues pleines et deux grandes dents.
 * La bouche s'ouvre avec celle du joueur — c'est le geste du jeu NOISETTES.
 */
function drawSquirrel(ctx, u, mouthOpen) {
    const fur = '#b07a4a';
    const dark = '#6b4a30';
    const light = '#d8b48a';

    // Oreilles rondes, légèrement écartées
    [-1, 1].forEach((side) => {
        ctx.fillStyle = fur;
        ctx.beginPath();
        ctx.ellipse(side * 0.3 * u, -0.55 * u, 0.13 * u, 0.17 * u, side * 0.25, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = alpha(light, 0.7);
        ctx.beginPath();
        ctx.ellipse(side * 0.3 * u, -0.53 * u, 0.07 * u, 0.1 * u, side * 0.25, 0, Math.PI * 2);
        ctx.fill();
    });

    // Touffes de joues : ce qui fait la bouille de l'écureuil
    [-1, 1].forEach((side) => {
        ctx.fillStyle = alpha(fur, 0.9);
        ctx.beginPath();
        ctx.ellipse(side * 0.41 * u, 0.05 * u, 0.15 * u, 0.2 * u, side * 0.3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Loup sur le haut du visage
    ctx.fillStyle = alpha(fur, 0.94);
    ctx.beginPath();
    ctx.moveTo(-0.44 * u, -0.26 * u);
    ctx.quadraticCurveTo(0, -0.5 * u, 0.44 * u, -0.26 * u);
    ctx.quadraticCurveTo(0.36 * u, 0.04 * u, 0, -0.02 * u);
    ctx.quadraticCurveTo(-0.36 * u, 0.04 * u, -0.44 * u, -0.26 * u);
    ctx.fill();

    // Trous des yeux
    ctx.globalCompositeOperation = 'destination-out';
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.ellipse(side * 0.21 * u, -0.19 * u, 0.12 * u, 0.1 * u, 0, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';

    // Museau et truffe
    ctx.fillStyle = alpha(light, 0.95);
    ctx.beginPath();
    ctx.ellipse(0, 0.09 * u, 0.15 * u, 0.12 * u, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 0.03 * u, 0.055 * u, 0.04 * u, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bouche : elle s'ouvre avec celle du joueur
    const open = Math.max(0, Math.min(1, mouthOpen));
    const mouthHeight = (0.02 + open * 0.16) * u;
    ctx.fillStyle = '#4a2415';
    ctx.beginPath();
    ctx.ellipse(0, (0.17 + open * 0.05) * u, (0.08 + open * 0.06) * u, mouthHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    // Les deux incisives, accrochées à la lèvre supérieure
    ctx.fillStyle = '#f2eee2';
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.roundRect(side * 0.065 * u - 0.055 * u, (0.15 + open * 0.04) * u, 0.055 * u, 0.1 * u, 0.02 * u);
        ctx.fill();
    });

    // Moustaches
    ctx.strokeStyle = alpha('#e7e9ec', 0.55);
    ctx.lineWidth = Math.max(1, u * 0.011);
    [-1, 1].forEach((side) => {
        [-0.03, 0.03, 0.09].forEach((offset) => {
            ctx.beginPath();
            ctx.moveTo(side * 0.12 * u, (0.06 + offset * 0.4) * u);
            ctx.quadraticCurveTo(side * 0.32 * u, (0.02 + offset) * u, side * 0.5 * u, (0.01 + offset * 1.4) * u);
            ctx.stroke();
        });
    });
}

function drawPirate(ctx, u) {
    // Bandana
    ctx.fillStyle = '#c08a86';
    ctx.beginPath();
    ctx.moveTo(-0.5 * u, -0.38 * u);
    ctx.quadraticCurveTo(0, -0.84 * u, 0.5 * u, -0.38 * u);
    ctx.lineTo(0.46 * u, -0.3 * u);
    ctx.quadraticCurveTo(0, -0.58 * u, -0.46 * u, -0.3 * u);
    ctx.closePath();
    ctx.fill();

    // Nœud sur le côté
    ctx.beginPath();
    ctx.moveTo(-0.48 * u, -0.34 * u);
    ctx.lineTo(-0.72 * u, -0.22 * u);
    ctx.lineTo(-0.66 * u, -0.44 * u);
    ctx.closePath();
    ctx.fill();

    // Bandeau sur l'œil
    ctx.strokeStyle = '#101214';
    ctx.lineWidth = Math.max(2, u * 0.035);
    ctx.beginPath();
    ctx.moveTo(-0.46 * u, -0.34 * u);
    ctx.lineTo(0.42 * u, -0.12 * u);
    ctx.stroke();

    ctx.fillStyle = '#101214';
    ctx.beginPath();
    ctx.ellipse(0.22 * u, -0.2 * u, 0.15 * u, 0.12 * u, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Moustache
    ctx.fillStyle = '#1f2327';
    ctx.beginPath();
    ctx.moveTo(-0.26 * u, 0.12 * u);
    ctx.quadraticCurveTo(0, 0.02 * u, 0.26 * u, 0.12 * u);
    ctx.quadraticCurveTo(0, 0.2 * u, -0.26 * u, 0.12 * u);
    ctx.fill();
}

function drawRobot(ctx, u) {
    // Visière
    ctx.fillStyle = alpha('#1f2327', 0.9);
    ctx.beginPath();
    ctx.roundRect(-0.5 * u, -0.42 * u, u, 0.42 * u, 0.1 * u);
    ctx.fill();

    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = Math.max(1.5, u * 0.018);
    ctx.stroke();

    // Balayage lumineux
    ctx.strokeStyle = alpha(THEME.accent, 0.8);
    ctx.beginPath();
    ctx.moveTo(-0.42 * u, -0.2 * u);
    ctx.lineTo(0.42 * u, -0.2 * u);
    ctx.stroke();

    // Antenne
    ctx.strokeStyle = alpha(THEME.textStrong, 0.7);
    ctx.beginPath();
    ctx.moveTo(0.3 * u, -0.42 * u);
    ctx.lineTo(0.38 * u, -0.72 * u);
    ctx.stroke();
    ctx.fillStyle = THEME.accentWarm;
    ctx.beginPath();
    ctx.arc(0.38 * u, -0.76 * u, 0.05 * u, 0, Math.PI * 2);
    ctx.fill();

    // Grille de bouche
    ctx.strokeStyle = alpha(THEME.textMuted, 0.8);
    ctx.lineWidth = Math.max(1, u * 0.014);
    for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 0.07 * u, 0.08 * u);
        ctx.lineTo(i * 0.07 * u, 0.22 * u);
        ctx.stroke();
    }
}

function drawGlasses(ctx, u) {
    ctx.strokeStyle = '#101214';
    ctx.lineWidth = Math.max(2, u * 0.03);

    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(side * 0.24 * u, -0.2 * u, 0.17 * u, 0, Math.PI * 2);
        ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(-0.07 * u, -0.2 * u);
    ctx.lineTo(0.07 * u, -0.2 * u);
    ctx.moveTo(-0.41 * u, -0.22 * u);
    ctx.lineTo(-0.54 * u, -0.28 * u);
    ctx.moveTo(0.41 * u, -0.22 * u);
    ctx.lineTo(0.54 * u, -0.28 * u);
    ctx.stroke();

    // Nez et moustache postiche
    ctx.fillStyle = '#c08a86';
    ctx.beginPath();
    ctx.ellipse(0, 0.02 * u, 0.1 * u, 0.08 * u, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1f2327';
    ctx.beginPath();
    ctx.moveTo(-0.3 * u, 0.14 * u);
    ctx.quadraticCurveTo(0, 0.06 * u, 0.3 * u, 0.14 * u);
    ctx.quadraticCurveTo(0.16 * u, 0.28 * u, 0, 0.18 * u);
    ctx.quadraticCurveTo(-0.16 * u, 0.28 * u, -0.3 * u, 0.14 * u);
    ctx.fill();
}
