# 🕹️ JARVIS ARCADE

Une borne d'arcade qui se joue **avec le corps** : la webcam suit vos mains,
votre silhouette et votre visage, et pilote six mini-jeux. Aucune manette,
aucun compte, aucune donnée qui sort du navigateur — tout tourne en local.

Fonctionne aussi **à la souris**, sans caméra ni modèles installés.

---

## Démarrage rapide

```bash
npm run setup     # télécharge les modèles IA (~15 Mo, une seule fois)
npm start         # sert le jeu sur http://localhost:8000
```

Puis ouvrez <http://localhost:8000> et autorisez la caméra.

> Ouvrir `index.html` par double-clic **ne fonctionne pas** : les modules
> JavaScript et l'accès webcam exigent un vrai serveur. D'où `npm start`
> (qui n'a aucune dépendance à installer).

**Pas de caméra ou pas envie de lancer `setup` ?** Le jeu le détecte, l'annonce
et bascule en mode souris/clavier. Tous les jeux restent jouables.

---

## Commandes

### À la webcam

| Geste | Effet |
| --- | --- |
| Pointer avec l'index | Déplacer le curseur |
| Garder la main immobile sur un bouton | Valider (cercle de progression) |
| Pincer pouce + index | Valider immédiatement |
| Se placer à gauche / à droite de l'image | Devenir joueur 1 / joueur 2 |

### Au clavier

| Touche | Effet |
| --- | --- |
| `C` | Prendre une photo (compte à rebours de 3 s) |
| `M` / `Échap` | Revenir au menu |
| `V` | Vignette caméra ↔ plein écran |
| `G` | Joueur 2 « fantôme » (duplique le joueur 1, pratique pour tester le 2 joueurs seul) |
| `F` | Compteur FPS et coût de l'IA |

### En mode souris

| Touche | Effet |
| --- | --- |
| Souris | Déplacer le joueur 1 |
| Clic gauche | Pincer / valider |
| `Espace` | Lever les bras |
| `E` | Ouvrir la bouche |
| `P` | Activer le joueur 2 (flèches, `Entrée` = pincer, `Maj droite` = bras levés) |

---

## 📷 Photo

Le bouton 📷 du bandeau (ou la touche `C`) lance un compte à rebours, un flash,
puis affiche l'aperçu avec **Enregistrer / Reprendre / Fermer**.

L'image fusionne tout ce qui est à l'écran : le flux webcam, la scène 3D et le
HUD du jeu. Le compteur de performances, lui, n'y apparaît pas. Le fichier est
enregistré en PNG (`jarvis-arcade-AAAA-MM-JJ-hh-mm-ss.png`) ; rien n'est envoyé
sur un serveur.

Depuis un jeu :

```js
this.game.photoBooth.start();   // avec compte à rebours
this.game.photoBooth.capture(); // immédiat
```

---

## Ajouter un jeu

Deux étapes, pas une de plus.

**1.** Copiez `js/games/_Template.js` sous un nouveau nom. Le fichier se termine
par sa propre déclaration :

```js
registerGame({
    id: 'mon_jeu',                 // identifiant unique
    name: 'MON JEU',               // titre affiché
    icon: '🎯',                    // emoji de la carte
    color: '#7dd3fc',              // liseré coloré
    players: 2,                    // 1 ou 2
    description: 'Une phrase qui apparaît dans le menu.',
    class: MonJeu
});
```

**2.** Ajoutez son import dans `js/games/index.js` :

```js
import './MonJeu.js';
```

Le jeu apparaît dans le menu, avec son icône, sa couleur et sa description.
L'ordre des imports donne l'ordre d'affichage. `hidden: true` garde un jeu
chargé mais hors du menu (pratique pour un prototype).

### Ce dont vous héritez

```js
export class MonJeu extends Game {
    enter()          { /* une fois au lancement */ }
    update(dt)       { /* chaque frame, dt en secondes déjà borné */ }
    render(display)  { /* chaque frame, le canvas est déjà nettoyé */ }
    exit()           { /* nettoyage */ }
}
```

| Outil | Rôle |
| --- | --- |
| `this.game.inputs.players` | `[joueur1, joueur2]`, même format en webcam et à la souris |
| `this.game.display.ctx` | Contexte 2D pour le HUD |
| `this.game.display.scene` | Scène Three.js pour la 3D |
| `this.game.display.virtW / virtH` | Dimensions de l'écran |
| `this.game.audio` | Musique et bruitages |
| `this.setup({...})` | Caméra + IA à activer |
| `this.after(ms, fn)` | `setTimeout` annulé automatiquement à la sortie du jeu |

Un joueur a toujours cette forme :

```js
{
    detected, x, y, z, isClicking,
    indexTip: { x, y }, handCenter: { x, y },
    pose: { raw: [33 points] },
    face: { raw: [478 points], mouthOpen },
    hand: { raw: [21 points] }
}
```

Les points bruts sont normalisés (0 à 1) dans le repère **caméra** : pensez à
`1 - point.x` pour l'effet miroir. `x` et `y` du joueur, eux, sont déjà en
pixels écran et déjà miroités.

### N'activez que ce dont vous avez besoin

```js
this.setup({ cameraMode: 'fullscreen', hands: true, pose: false, face: false });
```

Chaque détecteur inutile coûte environ 30 % de CPU pour rien.

---

## Performances

Quelques garde-fous sont déjà en place :

- l'IA n'analyse **jamais deux fois la même image** webcam
  (`requestVideoFrameCallback`), et plafonne à 30 analyses par seconde ;
- si une analyse traîne, le moteur **espace automatiquement** les inférences
  pour garder un rendu fluide plutôt que saccadé ;
- seuls les détecteurs demandés par le jeu courant tournent ;
- l'image envoyée à l'IA est réduite (480 × 360, réglable) ;
- le `dt` est borné : revenir sur l'onglet ne fait pas exploser la physique ;
- l'onglet caché met la boucle en pause ;
- positions des boutons, miroirs de landmarks et tampons sont réutilisés au
  lieu d'être recalculés à chaque frame.

Appuyez sur `F` pour voir FPS, temps par frame et coût de l'IA. Si ça rame :
baissez `maxFps` ou `analysisWidth/Height` dans `js/core/Config.js`, ou passez
`delegate` de `'GPU'` à `'CPU'` si le pilote graphique fait des siennes.

---

## Structure

```
index.html            page unique
style.css             thème (variables CSS en haut du fichier)
js/
├── main.js           séquence de démarrage
├── core/
│   ├── Config.js         tous les réglages
│   ├── Theme.js          palette partagée côté canvas
│   ├── Engine.js         boucle de jeu, curseur, chargement des scènes
│   ├── Display.js        couches d'affichage (2D, 3D, DOM)
│   ├── InputSystem.js    webcam + MediaPipe → joueurs
│   ├── FallbackInput.js  souris/clavier → mêmes joueurs
│   ├── PhotoBooth.js     capture photo
│   ├── Stats.js          compteur de performances
│   ├── Game.js           classe de base des jeux
│   ├── GameRegistry.js   catalogue
│   ├── GameOverModal.js  écran de fin de partie
│   ├── Header.js         bandeau supérieur
│   └── AudioManager.js   musique et bruitages
├── games/            un fichier par jeu + index.js (catalogue) + _Template.js
└── vendor/           Three.js, MediaPipe, Howler (non modifiés)
assets/               modèles IA et sons (voir assets/README.md)
scripts/              téléchargement des modèles, serveur de dev
legacy/               anciens prototypes, conservés pour référence
```

---

## Réglages

Tout est dans `js/core/Config.js` : cadence de l'IA, résolution d'analyse,
lissage du curseur, durée de validation par survol, compte à rebours photo,
volumes. Les couleurs sont dans les variables CSS en haut de `style.css` et
dans `js/core/Theme.js` pour les jeux dessinés au canvas.

---

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| « Modèles IA introuvables » | Lancez `npm run setup` |
| « Accès à la caméra refusé » | Autorisez la caméra dans la barre d'adresse |
| « Caméra indisponible (HTTPS requis) » | Utilisez `npm start`, pas un double-clic sur le fichier |
| Le curseur tremble | Montez `smoothing` dans `Config.js` (vers 1 = plus nerveux, vers 0 = plus lisse) |
| Les jeux rament | `F` pour diagnostiquer, puis baissez `maxFps` ou la résolution d'analyse |
| Aucun son | Les fichiers de `assets/sounds/` sont optionnels et absents par défaut |

---

## Sous le capot

- **MediaPipe Tasks Vision** — suivi des mains, du corps et du visage
- **Three.js** — rendu 3D
- **Howler.js** — audio
- Aucune étape de build, aucune dépendance npm à installer : du JavaScript
  moderne servi tel quel.
