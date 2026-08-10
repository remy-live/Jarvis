/**
 * PALETTE PARTAGÉE
 *
 * Les mêmes valeurs que les variables CSS de style.css, disponibles côté
 * canvas (où l'on ne peut pas écrire `var(--accent)`). Changer une couleur
 * ici la change dans tous les jeux d'un coup.
 */
export const THEME = {
    /* Surfaces */
    bg: '#080b0f',
    surface: '#0f141b',
    surfaceRaised: '#161d26',

    /* Texte */
    textStrong: '#f2f6fa',
    text: '#c3ccd8',
    textMuted: '#7c8899',

    /* Accents */
    accent: '#7dd3fc',
    accentWarm: '#fbbf24',
    success: '#86efac',
    danger: '#fb7185',
    highlight: '#fde68a',

    /* Joueurs */
    player1: '#7dd3fc',
    player2: '#fbbf24',

    /* Typographie canvas */
    fontDisplay: "'Orbitron', system-ui, sans-serif",
    fontUi: "'Inter', system-ui, sans-serif"
};

/** Couleur du joueur 0 ou 1. */
export const playerColor = (id) => (id === 0 ? THEME.player1 : THEME.player2);

/** Voile sombre translucide, pour asseoir un HUD sur l'image caméra. */
export const scrim = (alpha = 0.55) => `rgba(8, 11, 15, ${alpha})`;
