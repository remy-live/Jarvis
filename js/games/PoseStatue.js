import { Game } from '../core/Game.js';
import { registerGame } from '../core/GameRegistry.js';
import { GameOverModal } from '../ui/GameOverModal.js';
import { THEME, alpha, playerColor } from '../core/Theme.js';
import { drawMessage, drawScoreBar, drawGauge, Particles } from './shared.js';

const POSES_PER_ROUND = 6;
const POSE_TIME = 16;       // secondes pour trouver la pose
const HOLD_TIME = 0.8;      // maintien avant validation — le temps du déclic
const TOLERANCE = 52;       // écart (degrés) au-delà duquel un membre ne compte plus
const MATCH_TARGET = 0.74;  // ressemblance minimale pour valider

/**
 * Membres comparés. L'ordre compte : un segment part du point d'arrivée
 * du précédent, c'est ce qui permet de reconstruire la silhouette modèle.
 *
 * `rest` est l'orientation par défaut (bras le long du corps), utilisée
 * quand une pose ne dit rien de ce membre.
 *
 * Repère : 0° = vers la droite de l'écran, -90° = vers le haut.
 * Les points sont pris en miroir, donc « gauche » = gauche à l'écran,
 * c'est-à-dire la main que le joueur voit à gauche de lui-même.
 */
const SEGMENTS = [
    { key: 'brasG', from: 11, to: 13, length: 0.22, weight: 1.2, rest: 100, label: 'bras gauche' },
    { key: 'avantBrasG', from: 13, to: 15, length: 0.20, weight: 1.2, rest: 95, label: 'avant-bras gauche' },
    { key: 'brasD', from: 12, to: 14, length: 0.22, weight: 1.2, rest: 80, label: 'bras droit' },
    { key: 'avantBrasD', from: 14, to: 16, length: 0.20, weight: 1.2, rest: 85, label: 'avant-bras droit' },
    { key: 'cuisseG', from: 23, to: 25, length: 0.26, weight: 0.8, rest: 92, label: 'cuisse gauche' },
    { key: 'tibiaG', from: 25, to: 27, length: 0.24, weight: 0.6, rest: 92, label: 'jambe gauche' },
    { key: 'cuisseD', from: 24, to: 26, length: 0.26, weight: 0.8, rest: 88, label: 'cuisse droite' },
    { key: 'tibiaD', from: 26, to: 28, length: 0.24, weight: 0.6, rest: 88, label: 'jambe droite' }
];

/**
 * Le répertoire. Une pose n'est qu'une liste d'orientations de membres :
 * aucune position absolue, donc elle se tient à n'importe quelle distance
 * de la caméra et où que l'on soit dans le cadre.
 *
 * Les jambes ne sont notées que si la caméra les voit : assis à un bureau,
 * la partie se joue aux bras et reste jouable.
 */
const POSES = [
    { name: 'LE T', hint: 'Bras tendus à l\'horizontale', angles: { brasG: 180, avantBrasG: 180, brasD: 0, avantBrasD: 0 } },
    { name: 'LE Y', hint: 'Bras tendus en diagonale, vers le haut', angles: { brasG: -145, avantBrasG: -145, brasD: -35, avantBrasD: -35 } },
    { name: 'LE CACTUS', hint: 'Coudes à hauteur d\'épaules, mains vers le ciel', angles: { brasG: 180, avantBrasG: -90, brasD: 0, avantBrasD: -90 } },
    { name: 'LA THÉIÈRE', hint: 'Une main sur la hanche, l\'autre bras levé', angles: { brasG: 125, avantBrasG: 45, brasD: -40, avantBrasD: -40 } },
    { name: 'VICTOIRE', hint: 'Les deux bras levés en V', angles: { brasG: -115, avantBrasG: -115, brasD: -65, avantBrasD: -65 } },
    { name: 'LES BRAS CROISÉS', hint: 'Avant-bras croisés devant le buste', angles: { brasG: 110, avantBrasG: 20, brasD: 70, avantBrasD: 160 } },
    { name: 'L\'ARBITRE', hint: 'Un bras à l\'horizontale, l\'autre coude plié vers le bas', angles: { brasG: 180, avantBrasG: 90, brasD: -35, avantBrasD: -35 } },
    {
        name: 'L\'ÉTOILE', hint: 'Bras en diagonale, jambes écartées',
        angles: {
            brasG: -145, avantBrasG: -145, brasD: -35, avantBrasD: -35,
            cuisseG: 115, tibiaG: 115, cuisseD: 65, tibiaD: 65
        }
    }
];

/**
 * STATUE
 *
 * La borne affiche une silhouette, il faut la reproduire avec son corps.
 * Dès que la ressemblance tient une bonne seconde, **la photo part
 * toute seule** : à la fin de la partie, la pellicule déroule la série.
 *
 * La comparaison porte sur l'ORIENTATION des membres, pas sur leur
 * position : reproduire un squelette point par point obligerait à se
 * placer exactement au même endroit que le modèle, ce qui est injouable.
 */
export class PoseStatue extends Game {
    constructor(engine) {
        super(engine);
        this.modal = new GameOverModal(engine);
        this.particles = new Particles(300);
    }

    enter() {
        this.gameConfig = { cameraMode: 'fullscreen', hands: false, pose: true, face: false, smoothing: 0.55 };
        this.setup(this.gameConfig);
        this.game.display.setBackground(THEME.bg);
        this.reset();
    }

    exit() {
        this.clearTimers();
        this.modal.hide();
        this.particles.clear();
    }

    reset() {
        this.state = 'WAITING';
        this.deck = shuffle([...POSES]);
        this.pose = null;
        this.poseIndex = 0;
        this.poseTime = 0;
        this.flash = 0;
        this.snapCooldown = 0;

        this.statues = [0, 1].map((id) => ({
            id, score: 0, validated: 0, match: 0, hold: 0,
            done: false, worst: null, present: false
        }));

        this.particles.clear();
        this.modal.hide();
    }

    // ==========================================================
    //  BOUCLE
    // ==========================================================

    update(dt) {
        if (this.modal.isVisible) return;

        const players = this.game.inputs.players;
        for (const statue of this.statues) {
            statue.present = Boolean(players[statue.id]?.poseLandmarks);
        }

        if (this.state === 'WAITING') {
            if (this.statues.some((statue) => statue.present)) this._nextPose();
            return;
        }
        if (this.state !== 'PLAYING') return;

        this.poseTime -= dt;
        this.flash = Math.max(0, this.flash - dt * 2.5);
        this.snapCooldown = Math.max(0, this.snapCooldown - dt);

        this._evaluate(dt, players);
        this.particles.update(dt);

        // On passe à la suite dès que tout le monde a réussi, ou au buzzer
        const active = this.statues.filter((statue) => statue.present || statue.validated > 0);
        const allDone = active.length > 0 && active.every((statue) => statue.done);

        if (allDone || this.poseTime <= 0) {
            if (this.poseIndex >= POSES_PER_ROUND) this._finish();
            else this._nextPose();
        }
    }

    _nextPose() {
        if (this.deck.length === 0) this.deck = shuffle([...POSES]);

        this.state = 'PLAYING';
        this.pose = this.deck.pop();
        this.poseIndex++;
        this.poseTime = POSE_TIME;

        for (const statue of this.statues) {
            statue.hold = 0;
            statue.match = 0;
            statue.done = false;
            statue.worst = null;
        }
        this.game.playSound('hover');
    }

    _evaluate(dt, players) {
        for (const statue of this.statues) {
            const landmarks = players[statue.id]?.poseLandmarks;
            if (!landmarks || statue.done) {
                if (!landmarks) { statue.match = 0; statue.hold = 0; }
                continue;
            }

            const result = compare(landmarks, this.pose);
            statue.match = result.score;
            statue.worst = result.worst;

            // Le maintien retombe vite : une pose entrevue ne compte pas
            statue.hold = result.score >= MATCH_TARGET
                ? statue.hold + dt
                : Math.max(0, statue.hold - dt * 1.8);

            if (statue.hold >= HOLD_TIME) this._validate(statue);
        }
    }

    _validate(statue) {
        statue.done = true;
        statue.validated++;

        // Précision et rapidité : tenir la pose juste, et vite
        const precision = Math.round(statue.match * 100);
        const speed = Math.round(Math.max(0, this.poseTime / POSE_TIME) * 40);
        statue.score += precision + speed;

        this.flash = 1;
        this.game.playSound('select');

        const display = this.game.display;
        this.particles.spawn(display.virtW / 2, display.virtH * 0.42, playerColor(statue.id),
            { count: 22, speed: 300, size: 4, life: 0.7 });

        // La photo souvenir. Une seule par pose : à deux, la même image
        // contient de toute façon les deux statues.
        if (this.snapCooldown <= 0) {
            this.snapCooldown = 1.2;
            this.game.capture.snap(`${this.pose.name} — ${precision} %`);
        }
    }

    _finish() {
        this.state = 'GAMEOVER';
        const [a, b] = this.statues;
        const duo = b.present || b.score > 0;

        this.after(700, () => {
            const result = duo
                ? { p1: a.score, p2: b.score }
                : `${a.score} points · ${a.validated}/${POSES_PER_ROUND} poses`;
            this.modal.show(result, this.gameConfig, () => this.reset());
            this.after(900, () => this.game.capture.openGallery());
        });
    }

    // ==========================================================
    //  RENDU
    // ==========================================================

    render(display) {
        const ctx = display.ctx;
        const w = display.virtW;
        const h = display.virtH;

        ctx.fillStyle = 'rgba(16, 18, 20, 0.42)';
        ctx.fillRect(0, 0, w, h);

        if (this.flash > 0) {
            ctx.fillStyle = alpha(THEME.textStrong, this.flash * 0.18);
            ctx.fillRect(0, 0, w, h);
        }

        if (this.state === 'WAITING') {
            drawMessage(ctx, w, h, 'STATUE',
                'Reculez pour être vu en entier · reproduisez la silhouette affichée');
            return;
        }

        this._drawGhost(ctx, w, h);
        this.particles.draw(ctx);
        this._drawHud(ctx, w, h);
    }

    /** La silhouette à reproduire, reconstruite à partir de ses angles. */
    _drawGhost(ctx, w, h) {
        // La silhouette occupe la bande libre entre le bandeau de score et
        // le nom de la pose. Elle mesure 1,16 fois son échelle du sommet du
        // crâne aux pieds : sans cette marge, les jambes sortaient du cadre.
        const band = Math.max(240, h - 300);
        const scale = Math.min(w * 0.5, band / 1.16);
        const points = silhouette(this.pose, w / 2, 150 + scale * 0.255, scale);

        // Elle verdit à mesure que la ressemblance monte : c'est le
        // retour le plus direct possible, sans quitter la pose des yeux.
        const best = Math.max(...this.statues.map((statue) => statue.match));
        const color = best >= MATCH_TARGET ? THEME.success : THEME.accent;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = alpha(color, 0.2 + best * 0.5);
        ctx.lineWidth = Math.max(8, scale * 0.045);

        ctx.beginPath();
        ctx.moveTo(points[11].x, points[11].y);
        ctx.lineTo(points[12].x, points[12].y);
        ctx.lineTo(points[24].x, points[24].y);
        ctx.lineTo(points[23].x, points[23].y);
        ctx.closePath();
        ctx.stroke();

        for (const segment of SEGMENTS) {
            const from = points[segment.from];
            const to = points[segment.to];
            if (!from || !to) continue;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        }

        // Tête
        const neckX = (points[11].x + points[12].x) / 2;
        const neckY = (points[11].y + points[12].y) / 2;
        ctx.beginPath();
        ctx.arc(neckX, neckY - scale * 0.17, scale * 0.085, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    _drawHud(ctx, w, h) {
        const duo = this.statues[1].present || this.statues[1].score > 0;
        const entries = [
            { label: duo ? 'Joueur 1' : 'Points', value: this.statues[0].score, color: playerColor(0) },
            { label: `Temps · pose ${this.poseIndex}/${POSES_PER_ROUND}`, value: Math.ceil(Math.max(0, this.poseTime)), color: this.poseTime < 5 ? THEME.danger : THEME.textStrong }
        ];
        if (duo) entries.push({ label: 'Joueur 2', value: this.statues[1].score, color: playerColor(1) });
        drawScoreBar(ctx, w, entries);

        drawGauge(ctx, w / 2 - 110, 132, 220, 3, Math.max(0, this.poseTime) / POSE_TIME,
            this.poseTime < 5 ? THEME.danger : THEME.accent);

        // Le nom de la pose, en bas : le haut de l'écran est pris par la
        // silhouette, et c'est elle qu'il faut regarder.
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = THEME.textStrong;
        ctx.font = `600 26px ${THEME.fontDisplay}`;
        ctx.fillText(this.pose.name, w / 2, h - 96);

        ctx.fillStyle = THEME.textMuted;
        ctx.font = `400 14px ${THEME.fontUi}`;
        ctx.fillText(this.pose.hint, w / 2, h - 68);

        if (this.game.inputs.mode !== 'vision') {
            ctx.fillText('Ce jeu demande la caméra : sans elle, les poses ne peuvent pas être lues.',
                w / 2, h - 44);
        }
        ctx.restore();

        for (const statue of this.statues) this._drawMeter(ctx, w, h, statue);
    }

    /** Jauge de ressemblance, plus le membre le plus fautif. */
    _drawMeter(ctx, w, h, statue) {
        if (!statue.present && statue.score === 0) return;

        const width = 150;
        const x = statue.id === 0 ? w * 0.06 : w * 0.94 - width;
        const y = h * 0.62;
        const color = statue.done ? THEME.success : playerColor(statue.id);

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = THEME.textMuted;
        ctx.font = `500 11px ${THEME.fontUi}`;
        ctx.fillText(`JOUEUR ${statue.id + 1}`, x, y - 14);

        drawGauge(ctx, x, y, width, 6, statue.match, color);

        // Repère du seuil : on voit ce qu'il reste à gagner
        ctx.fillStyle = alpha(THEME.textStrong, 0.5);
        ctx.fillRect(x + width * MATCH_TARGET, y - 3, 2, 12);

        ctx.fillStyle = color;
        ctx.font = `600 14px ${THEME.fontDisplay}`;
        ctx.fillText(statue.done ? 'TENUE !' : `${Math.round(statue.match * 100)} %`, x, y + 22);

        if (!statue.done && statue.worst) {
            ctx.fillStyle = THEME.textMuted;
            ctx.font = `400 12px ${THEME.fontUi}`;
            ctx.fillText(`corrigez : ${statue.worst}`, x, y + 42);
        }

        if (statue.hold > 0 && !statue.done) {
            drawGauge(ctx, x, y + 56, width, 3, statue.hold / HOLD_TIME, THEME.success);
        }
        ctx.restore();
    }
}

/* ------------------------------------------------------------------ */

/** Écart signé minimal entre deux angles, en degrés. */
function angleDelta(a, b) {
    return ((a - b + 540) % 360) - 180;
}

/**
 * Ressemblance entre un squelette et une pose modèle.
 * @returns {{score:number, worst:string|null}}
 */
function compare(landmarks, pose) {
    let total = 0;
    let weights = 0;
    let worst = null;
    let worstScore = 1;

    for (const segment of SEGMENTS) {
        const from = landmarks[segment.from];
        const to = landmarks[segment.to];
        // Un membre hors champ ne doit pas plomber la note : on le retire
        // du calcul plutôt que de le compter comme raté.
        if (!from || !to) continue;
        if (from.visibility !== undefined && (from.visibility < 0.5 || to.visibility < 0.5)) continue;

        const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
        const target = pose.angles[segment.key] ?? segment.rest;
        const error = Math.abs(angleDelta(angle, target));
        const score = Math.max(0, 1 - error / TOLERANCE);

        total += score * segment.weight;
        weights += segment.weight;

        // Seul un membre demandé par la pose mérite une consigne
        if (pose.angles[segment.key] !== undefined && score < worstScore) {
            worstScore = score;
            worst = segment.label;
        }
    }

    // Moins de trois membres visibles : on ne sait pas juger.
    if (weights < 3) return { score: 0, worst: null };
    return { score: total / weights, worst: worstScore < 0.85 ? worst : null };
}

/** Reconstruit les points de la silhouette modèle, en coordonnées écran. */
function silhouette(pose, cx, cy, scale) {
    const points = {
        11: { x: cx - 0.17 * scale, y: cy },
        12: { x: cx + 0.17 * scale, y: cy },
        23: { x: cx - 0.11 * scale, y: cy + 0.4 * scale },
        24: { x: cx + 0.11 * scale, y: cy + 0.4 * scale }
    };

    for (const segment of SEGMENTS) {
        const origin = points[segment.from];
        if (!origin) continue;
        const angle = (pose.angles[segment.key] ?? segment.rest) * Math.PI / 180;
        points[segment.to] = {
            x: origin.x + Math.cos(angle) * segment.length * scale,
            y: origin.y + Math.sin(angle) * segment.length * scale
        };
    }
    return points;
}

function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

registerGame({
    id: 'pose_statue',
    name: 'STATUE',
    icon: '🗿',
    color: '#8faa8b',
    players: 2,
    description: 'Reproduisez la silhouette affichée : la pose tenue est photographiée.',
    class: PoseStatue
});
