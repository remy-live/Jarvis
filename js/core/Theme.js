/**
 * PALETTE PARTAGÉE
 *
 * Mêmes valeurs que les variables CSS de style.css, mais utilisables côté
 * canvas (où l'on ne peut pas écrire `var(--accent)`).
 *
 * Parti pris : des gris neutres légèrement chauds, deux accents désaturés
 * (acier et sable) et aucune couleur pure. Rien ne « brille » : la
 * lisibilité vient du contraste, pas de la saturation.
 */
export const THEME = {
    /* Surfaces */
    bg: '#101214',
    surface: '#171a1d',
    surfaceRaised: '#1f2327',

    /* Texte */
    textStrong: '#e7e9ec',
    text: '#b6bbc2',
    textMuted: '#7b8189',

    /* Accents (volontairement désaturés) */
    accent: '#8fa6b8',        // acier
    accentWarm: '#c2a882',    // sable
    success: '#8faa8b',
    danger: '#c08a86',
    highlight: '#d6c9a8',

    /* Joueurs */
    player1: '#8fa6b8',
    player2: '#c2a882',

    /* Typographie canvas */
    fontDisplay: "'Orbitron', system-ui, sans-serif",
    fontUi: "'Inter', system-ui, sans-serif"
};

/** Couleur du joueur 0 ou 1. */
export const playerColor = (id) => (id === 0 ? THEME.player1 : THEME.player2);

/** Voile sombre translucide, pour asseoir un HUD sur l'image caméra. */
export const scrim = (alpha = 0.55) => `rgba(16, 18, 20, ${alpha})`;

/**
 * Variante d'une couleur du thème avec une opacité donnée.
 * Évite d'écrire des `rgba()` en dur dans chaque jeu.
 */
export function alpha(hex, value) {
    const int = parseInt(hex.slice(1), 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${value})`;
}
