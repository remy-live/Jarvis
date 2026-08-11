import { THEME, scrim } from '../core/Theme.js';

/**
 * BOÎTE À OUTILS DES JEUX
 *
 * Tout ce que plusieurs jeux redessinaient chacun de leur côté : bandeaux
 * de score, messages centrés, particules. Un seul endroit à retoucher pour
 * que l'ensemble reste cohérent.
 */

/**
 * Position de pointage d'un joueur, quelle que soit la source
 * (index de la main en webcam, souris ou flèches sinon).
 * @returns {{x:number,y:number}|null}
 */
export function pointerOf(player) {
    if (!player || !player.detected) return null;
    const tip = player.indexTip;
    return tip ? { x: tip.x, y: tip.y } : { x: player.x, y: player.y };
}

/** Centre de la paume : plus stable que l'index pour une raquette. */
export function palmOf(player) {
    if (!player || !player.detected) return null;
    return player.handCenter || { x: player.x, y: player.y };
}

/** Voile sombre plein écran, pour asseoir un texte sur l'image caméra. */
export function drawScrim(ctx, w, h, alpha = 0.55) {
    ctx.fillStyle = scrim(alpha);
    ctx.fillRect(0, 0, w, h);
}

/** Message central : un titre, une ligne d'explication. */
export function drawMessage(ctx, w, h, title, subtitle = '', options = {}) {
    const { dim = 0.62, color = THEME.textStrong } = options;

    drawScrim(ctx, w, h, dim);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = color;
    ctx.font = `600 ${Math.round(Math.min(w, h) * 0.055)}px ${THEME.fontDisplay}`;
    ctx.fillText(title, w / 2, h / 2 - (subtitle ? 18 : 0));

    if (subtitle) {
        ctx.fillStyle = THEME.textMuted;
        ctx.font = `400 16px ${THEME.fontUi}`;
        ctx.fillText(subtitle, w / 2, h / 2 + 28);
    }
    ctx.restore();
}

/**
 * Bandeau de score en haut de l'écran.
 * @param {{label:string,value:string|number,color?:string}[]} entries
 */
export function drawScoreBar(ctx, w, entries, options = {}) {
    const { y = 34, height = 44 } = options;

    ctx.save();
    ctx.textBaseline = 'middle';

    const slot = w / entries.length;
    entries.forEach((entry, i) => {
        const cx = slot * (i + 0.5);

        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.textMuted;
        ctx.font = `500 11px ${THEME.fontUi}`;
        ctx.fillText(entry.label.toUpperCase(), cx, y);

        ctx.fillStyle = entry.color || THEME.textStrong;
        ctx.font = `600 ${height * 0.62}px ${THEME.fontDisplay}`;
        ctx.fillText(String(entry.value), cx, y + height * 0.6);
    });
    ctx.restore();
}

/** Petite jauge horizontale (temps restant, charge...). */
export function drawGauge(ctx, x, y, width, height, ratio, color = THEME.accent) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.fill();

    const filled = Math.max(0, Math.min(1, ratio)) * width;
    if (filled > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y, filled, height, height / 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.restore();
}

/**
 * Nuage de particules réutilisable : `spawn` puis `update`/`draw`.
 * Les jeux réécrivaient tous la même boucle.
 */
export class Particles {
    constructor(limit = 400) {
        this.items = [];
        this.limit = limit;
    }

    spawn(x, y, color, options = {}) {
        const { count = 10, speed = 260, size = 5, life = 0.6, spread = Math.PI * 2, angle = 0 } = options;

        for (let i = 0; i < count; i++) {
            if (this.items.length >= this.limit) break;
            const dir = angle + (Math.random() - 0.5) * spread;
            const velocity = speed * (0.4 + Math.random() * 0.8);
            this.items.push({
                x, y,
                vx: Math.cos(dir) * velocity,
                vy: Math.sin(dir) * velocity,
                life,
                maxLife: life,
                color,
                size: size * (0.5 + Math.random())
            });
        }
    }

    update(dt, gravity = 0) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const p = this.items[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += gravity * dt;
            p.life -= dt;
            if (p.life <= 0) this.items.splice(i, 1);
        }
    }

    draw(ctx) {
        ctx.save();
        for (const p of this.items) {
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    clear() {
        this.items.length = 0;
    }
}

/** Interpolation indépendante du framerate (0 = mou, 1 = instantané). */
export function damp(current, target, smoothing, dt) {
    return current + (target - current) * (1 - Math.pow(1 - smoothing, dt * 60));
}
