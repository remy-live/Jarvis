# Dossier `assets/`

Contenu attendu :

```
assets/
├── models/      ← téléchargé par `npm run setup` (non versionné)
│   ├── hand_landmarker.task
│   ├── pose_landmarker_lite.task
│   └── face_landmarker.task
├── wasm/        ← téléchargé par `npm run setup` (non versionné)
│   ├── vision_wasm_internal.js
│   ├── vision_wasm_internal.wasm
│   ├── vision_wasm_nosimd_internal.js
│   └── vision_wasm_nosimd_internal.wasm
└── sounds/      ← à fournir (facultatif)
    ├── music/
    └── sfx/
```

## Modèles et WebAssembly

Ils ne sont pas dans Git (≈ 15 Mo) :

```bash
npm run setup
```

Sans eux, le jeu démarre quand même en **mode souris / clavier**.

## Sons

Entièrement facultatifs : un fichier absent est simplement ignoré (un
avertissement en console, aucun plantage). Les bips de l'interface, eux,
sont générés à la volée via la Web Audio API et ne demandent aucun fichier.

Fichiers référencés par les jeux actuels :

| Fichier                          | Utilisé par | Rôle                    |
| -------------------------------- | ----------- | ----------------------- |
| `sounds/music/Nuts.mp3`          | NutsGame    | musique de fond         |
| `sounds/sfx/crunch.wav`          | NutsGame    | croquer une noisette    |
| `sounds/sfx/win.wav`             | NutsGame    | bonus                   |

Pour brancher un son dans un jeu :

```js
this.game.audio.setupGameAudio({
    music: './assets/sounds/music/MaMusique.mp3',
    sfx: { boom: './assets/sounds/sfx/boom.wav' }
});
// puis, au bon moment :
this.game.audio.playSFX('boom');
```
