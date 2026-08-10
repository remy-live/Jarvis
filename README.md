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
| `C` | Photo (compte à rebours de 3 s) |
| `R` | Démarrer / arrêter l'enregistrement vidéo |
| `G` | Ouvrir la pellicule |
| `M` / `Échap` | Revenir au menu |
| `V` | Vignette caméra ↔ plein écran |
| `F` | Compteur FPS et coût de l'IA |

### En mode souris

| Touche | Effet |
| --- | --- |
| Souris | Déplacer le joueur 1 |
| Clic gauche | Pincer / valider |
| `Espace` | Lever les bras |
| `E` | Ouvrir la bouche |
| `P` | Activer le joueur 2 (flèches, `Entrée` = pincer, `Maj droite` = bras levés) |

En mode souris, le pointeur du système suffit : le curseur virtuel et sa
validation par survol sont désactivés pour le joueur 1 (sinon un simple arrêt
de la souris sur un bouton déclencherait un clic). Le joueur 2, piloté au
clavier, garde le sien.

---

## 📷 Photo et vidéo

Trois boutons dans le bandeau, ou trois touches :

| | Action |
| --- | --- |
| ⏺ / `R` | Démarre puis arrête un clip vidéo (chrono affiché à l'écran) |
| 📷 / `C` | Photo, après un compte à rebours de 3 secondes |
| 🖼 / `G` | Ouvre la **pellicule** de la session |

La pellicule montre la dernière capture en grand et toutes les autres en
vignettes : on choisit, on **enregistre** ou on **supprime**. Les photos
sortent en PNG, les clips en WebM (MP4 sur Safari), nommés
`jarvis-arcade-AAAA-MM-JJ-hhmmss.<ext>`.

Photo comme vidéo passent par le même compositeur : elles fusionnent le flux
webcam, la scène 3D et le HUD, exactement comme à l'écran. Le compte à rebours,
le témoin d'enregistrement et le compteur de performances en sont exclus. Rien
ne sort du navigateur : les clips vivent en mémoire jusqu'à ce que vous les
téléchargiez.

Depuis un jeu :

```js
this.game.capture.photo();            // avec compte à rebours
this.game.capture.photo(0);           // immédiat
this.game.capture.toggleRecording();  // vidéo
this.game.capture.openGallery();
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
    color: '#8fa6b8',              // liseré coloré
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
├── core/             le moteur, sans dépendance à l'interface
│   ├── Config.js         tous les réglages
│   ├── Theme.js          palette partagée côté canvas
│   ├── Engine.js         boucle de jeu et orchestration
│   ├── Display.js        couches d'affichage (2D, 3D, DOM)
│   ├── Game.js           classe de base des jeux
│   ├── GameRegistry.js   catalogue
│   ├── AudioManager.js   musique et bruitages
│   └── Stats.js          compteur de performances
├── input/            tout ce qui produit des « joueurs »
│   ├── InputSystem.js      webcam + MediaPipe
│   ├── FallbackInput.js    souris/clavier, même format de sortie
│   └── CursorController.js curseur virtuel et validation par survol
├── capture/          photo et vidéo
│   ├── FrameComposer.js  fusionne les calques en une image
│   ├── VideoRecorder.js  MediaRecorder sur le canvas composé
│   └── CaptureStudio.js  orchestration photo + vidéo + pellicule
├── ui/               écrans et panneaux
│   ├── Header.js
│   ├── GameOverModal.js
│   └── CaptureGallery.js
├── games/            un fichier par jeu + index.js + _Template.js
└── vendor/           Three.js, MediaPipe, Howler (non modifiés)
assets/               modèles IA et sons (voir assets/README.md)
scripts/              téléchargement des modèles, serveur de dev
legacy/               anciens prototypes, conservés pour référence
```

Le découpage suit une règle simple : `core/` ne connaît pas le DOM applicatif,
`input/` ne connaît pas les jeux, `capture/` ne connaît pas les entrées, et
`ui/` ne fait que du DOM. Chaque module a une seule raison de changer.

---

## Réglages

Tout est dans `js/core/Config.js` : cadence de l'IA, résolution d'analyse,
lissage du curseur, durée de validation par survol, compte à rebours photo,
débit vidéo, volumes.

Les couleurs vivent à deux endroits qui se répondent : les variables CSS en
haut de `style.css` pour l'interface, et `js/core/Theme.js` pour tout ce qui
est dessiné au canvas. Les deux listes portent les mêmes valeurs — changer un
accent des deux côtés suffit à reteinter l'ensemble.

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
| « Vidéo non supportée » | Navigateur sans MediaRecorder — la photo, elle, fonctionne partout |

---

## Sous le capot

- **MediaPipe Tasks Vision** — suivi des mains, du corps et du visage
- **Three.js** — rendu 3D
- **Howler.js** — audio
- Aucune étape de build, aucune dépendance npm à installer : du JavaScript
  moderne servi tel quel.
