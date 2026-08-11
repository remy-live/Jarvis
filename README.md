# 🕹️ JARVIS ARCADE

Une borne d'arcade qui se joue **avec le corps** : la webcam suit vos mains,
votre silhouette et votre visage, et pilote douze mini-jeux. Aucune manette,
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

### Mise en ligne (GitHub Pages ou autre hébergeur statique)

Poussez le dépôt tel quel : il n'y a ni build ni dépendance à installer.

Deux détails propres à Pages sont déjà réglés :

- le fichier `.nojekyll` à la racine — sans lui, Jekyll masque les chemins
  commençant par un tiret bas et renvoie des 404 ;
- les modèles IA ne sont pas versionnés (≈ 15 Mo), donc absents en ligne : le
  jeu les récupère alors **automatiquement sur le CDN MediaPipe**. La webcam
  fonctionne donc aussi sur Pages, au prix d'un premier chargement plus long.

Pour un fonctionnement 100 % hors ligne, passez `useCdnFallback` à `false`
dans `js/core/Config.js` et retirez `assets/models/` du `.gitignore`.

---

## Les jeux

| Jeu | Seul | À deux | Ce qu'on fait |
| --- | :---: | :---: | --- |
| **Fil électrique** | ✓ | ✓ | Suivre un couloir du doigt sans toucher les bords |
| **Corde & bille** | ✓ | ✓ | Une bille en équilibre sur une ficelle tendue entre les mains |
| **Air Hockey** | ✓ (contre la machine) | ✓ | La main est le maillet, premier à sept buts |
| **Bulles** | ✓ | ✓ | Pincer pour crever les bulles, enchaîner pour multiplier |
| **Fruit Blade** | ✓ | ✓ | Trancher les fruits du doigt, éviter les bombes |
| **Neon Battle** | — | ✓ | Duel de raquettes, casser le mur adverse |
| **Esquive laser** | ✓ | ✓ | Bouger pour éviter les rayons, tenir le plus longtemps |
| **Neon Invaders** | ✓ | — | Se déplacer pour viser, lever les bras pour le super laser |
| **Flappy Squat** | ✓ | ✓ | S'accroupir pour faire descendre l'oiseau |
| **Séquence** | ✓ | ✓ | Retenir l'ordre des dalles et le refaire à la main |
| **Shuriken Showdown** | ✓ | ✓ | Lancer d'un mouvement sec du bras |
| **Noisettes** | ✓ | — | Attraper les noisettes en ouvrant la bouche |

Le menu filtre entre **Tous**, **Seul** et **À deux** ; le bouton *Au hasard*
choisit pour vous. À la souris, les flèches déplacent la sélection et `Entrée`
lance la partie.

**Fil électrique** vous donne un tracé qui se resserre à chaque réussite ; à
deux, chacun sa moitié d'écran et le même parcours, c'est une course.
**Corde & bille** simule une vraie ficelle : la bille est contrainte à
`|bille−main gauche| + |bille−main droite| ≤ longueur`, ce qui donne le V
caractéristique, l'équilibre au point bas et la bille qui file au bout dès
qu'on tend trop. Seul, un bout est accroché à un piton et on joue autour.

Deuxième joueur : placez-vous simplement à droite de l'image (le joueur 1 tient
la gauche). Sans caméra, la touche `P` active un joueur 2 au clavier. La touche
`G` en mode webcam crée un joueur 2 « fantôme » pour tester un duel tout seul.

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

**1.** Copiez `js/games/Template.js` sous un nouveau nom. Le fichier se termine
par sa propre déclaration :

```js
registerGame({
    id: 'mon_jeu',                 // identifiant unique
    name: 'MON JEU',               // titre affiché
    icon: '🎯',                    // emoji de la carte
    color: '#8fa6b8',              // liseré coloré
    players: 2,                    // 1 ou 2
    solo: true,                    // jouable seul ? (false = duel strict)
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
| `js/games/shared.js` | HUD tout prêt : score, message centré, jauge, particules |

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

Le point critique tient en une phrase : **l'analyse d'image de MediaPipe est
synchrone**. Tant qu'elle calcule, le fil qui l'exécute est figé — une analyse
à 40 ms, c'est deux frames perdues d'un coup. Tout le reste en découle.

Ce que fait le moteur pour tenir la cadence :

- **l'inférence tourne dans un Web Worker.** C'est la parade principale :
  l'analyse bloque le worker, jamais la page. Le jeu reste fluide quel que
  soit le coût d'une inférence. Les images partent en `ImageBitmap`
  transférés (zéro copie), une seule en vol à la fois, les autres sont
  sautées. Si le navigateur ne s'y prête pas, l'ancien chemin synchrone
  prend le relais tout seul ;
- **une seule IA par cycle.** Quand un jeu a besoin du corps *et* des mains,
  les détecteurs s'alternent au lieu de cumuler leurs coûts sur la même frame ;
- **plafond de charge.** Si une analyse coûte cher, elle est espacée pour ne
  consommer qu'environ 45 % du temps (`maxLoadRatio`) : mieux vaut un suivi un
  peu moins fréquent qu'un jeu qui saccade ;
- **on ne cherche qu'une personne dans un jeu solo.** Suivre deux mains fait
  tourner le modèle deux fois ; le nombre de joueurs vient de la déclaration du
  jeu, et le sélecteur du bandeau permet de forcer deux ;
- **jamais deux fois la même image.** La webcam produit 30 images par seconde
  pour un écran à 60 : l'analyse et le retour vidéo se calent dessus ;
- **seuls les détecteurs demandés tournent** — chacun en trop coûte plein pot ;
- image d'analyse réduite (384 × 288) et retour caméra dessiné en 960 px de
  large, étiré par le CSS : invisible sur un décor atténué, deux fois moins de
  pixels à recopier ;
- `dt` borné, boucle en pause quand l'onglet est caché, positions des boutons
  et tampons de landmarks réutilisés d'une frame à l'autre.

### Diagnostiquer

Appuyez sur `F`. La ligne « analyse » donne le coût d'une inférence et leur
fréquence : c'est presque toujours là que part le temps.

La ligne « analyse » précise où tourne l'inférence : `(worker)` — le cas
normal, elle ne peut pas faire saccader le jeu — ou `(thread principal)`,
le chemin de secours.

| Ce que vous voyez | Ce qu'il faut faire |
| --- | --- |
| Analyse > 50 ms | Baissez `analysisWidth/Height`, ou `delegate` sur `'CPU'` si le pilote GPU est capricieux |
| FPS bas, analyse rapide | Le coût est ailleurs : baissez `feedbackMaxWidth` ou passez la caméra en `vignette` |
| Suivi saccadé mais jeu fluide | Montez `maxLoadRatio` (l'IA aura plus de temps, le rendu moins) |
| « modèles : CDN » affiché | Lancez `npm run setup` : en local, ils chargent bien plus vite |

Tous ces réglages sont dans `js/core/Config.js`.

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
├── games/            un fichier par jeu + index.js, Template.js, shared.js
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
| « Modèles IA inaccessibles » | Lancez `npm run setup` (ou vérifiez l'accès au CDN MediaPipe) |
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
