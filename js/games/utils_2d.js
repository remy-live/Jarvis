/**
 * UTILITAIRES 2D (DOM / HTML)
 * Sert pour les jeux qui n'utilisent pas Three.js mais du CSS/HTML pur.
 */

// --- 1. GÉNÉRATEUR DE PARTICULES (Explosions) ---
export function createParticles(x, y, color, gameArea) {
    for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.backgroundColor = color;
        
        // Position initiale
        p.style.left = x + 'px'; 
        p.style.top = y + 'px';
        
        // Taille aléatoire
        p.style.width = (Math.random() * 8 + 4) + 'px'; 
        p.style.height = p.style.width;
        
        // Calcul de la trajectoire (Vélocité)
        const angle = Math.random() * Math.PI * 2;
        const vel = Math.random() * 100 + 50; // Distance du vol
        const tx = Math.cos(angle) * vel;
        const ty = Math.sin(angle) * vel;
        
        // Configuration de l'animation CSS
        p.style.transition = 'transform 0.5s ease-out, opacity 0.5s';
        
        gameArea.appendChild(p);

        // On déclenche l'animation à la frame suivante pour que le CSS la prenne en compte
        requestAnimationFrame(() => {
            p.style.transform = `translate(${tx}px, ${ty}px) scale(0)`;
            p.style.opacity = 0;
        });

        // Nettoyage du DOM
        setTimeout(() => { 
            if(p.parentNode) p.remove(); 
        }, 500);
    }
}

// --- 2. SPAWNER D'OBJETS (Noisettes, Bonus...) ---
export function spawnItem(config, gameArea, windowWidth, windowHeight) {
    const el = document.createElement('div');
    el.classList.add('game-item');
    
    // Contenu
    el.textContent = config.emoji || '🌰';
    
    // Classes supplémentaires (ex: nut-gold)
    if (config.className) {
        config.className.split(' ').forEach(c => el.classList.add(c));
    }
    
    // Position X aléatoire
    const size = config.size || 50;
    const padding = 50;
    // On s'assure que ça ne sort pas de l'écran à droite
    const randomX = Math.random() * (windowWidth - size - padding * 2) + padding;
    
    el.style.left = `${randomX}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.fontSize = `${size}px`;

    // VITESSE (Gérée par la durée de l'animation CSS)
    const speed = config.speed || 3; 
    el.style.animationDuration = `${speed}s`;

    // AJOUT AU DOM
    gameArea.appendChild(el);
    
    // NETTOYAGE AUTO
    // Quand l'animation CSS est finie, on supprime l'élément
    el.addEventListener('animationend', () => {
        el.remove();
    });
}