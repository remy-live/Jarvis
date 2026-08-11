#!/usr/bin/env node
/**
 * TÉLÉCHARGEMENT DES DÉPENDANCES LOURDES
 *
 *   node scripts/fetch-assets.mjs [--force]
 *
 * Récupère dans `assets/` :
 *   - les modèles MediaPipe (.task) : mains, corps, visage
 *   - le runtime WebAssembly de MediaPipe
 *
 * Ces fichiers font ~15 Mo : ils ne sont pas versionnés dans Git
 * (voir .gitignore), d'où ce script.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, stat, rm, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');

// Doit rester aligné avec js/vendor/vision_bundle.js
const MEDIAPIPE_VERSION = '0.10.22-rc.20250304';

const MODELS_BASE = 'https://storage.googleapis.com/mediapipe-models';
const MODELS = [
    { file: 'hand_landmarker.task', url: `${MODELS_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` },
    { file: 'pose_landmarker_lite.task', url: `${MODELS_BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` },
    { file: 'face_landmarker.task', url: `${MODELS_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task` }
];

const WASM_FILES = [
    'vision_wasm_internal.js',
    'vision_wasm_internal.wasm',
    'vision_wasm_nosimd_internal.js',
    'vision_wasm_nosimd_internal.wasm'
];

// Miroirs essayés dans l'ordre (certains réseaux d'entreprise bloquent les CDN)
const WASM_MIRRORS = [
    (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm/${f}`,
    (f) => `https://unpkg.com/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm/${f}`
];

const NPM_TARBALL = `https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-${MEDIAPIPE_VERSION}.tgz`;

/* ------------------------------------------------------------------ */

const human = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

async function exists(filePath) {
    try {
        const info = await stat(filePath);
        return info.size > 0;
    } catch {
        return false;
    }
}

async function download(url, destination) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);

    await mkdir(path.dirname(destination), { recursive: true });
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));

    const info = await stat(destination);
    return info.size;
}

async function fetchInto(destination, urls, label) {
    if (!FORCE && await exists(destination)) {
        console.log(`   ✔ ${label} (déjà présent)`);
        return true;
    }

    for (const url of urls) {
        try {
            process.stdout.write(`   ↓ ${label} ...`);
            const size = await download(url, destination);
            console.log(` ${human(size)}`);
            return true;
        } catch (error) {
            console.log(` échec (${error.message})`);
            await rm(destination, { force: true });
        }
    }
    return false;
}

/* --- Repli : extraction directe du paquet npm --------------------- */

/** Lecteur tar minimal (format ustar), suffisant pour un paquet npm. */
function* readTar(buffer) {
    let offset = 0;
    while (offset + 512 <= buffer.length) {
        const header = buffer.subarray(offset, offset + 512);
        const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
        if (!name) break;

        const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0;
        const type = String.fromCharCode(header[156]);
        const start = offset + 512;

        if (type === '0' || type === '\0') {
            yield { name, data: buffer.subarray(start, start + size) };
        }
        offset = start + Math.ceil(size / 512) * 512;
    }
}

async function fetchWasmFromNpm(wasmDir) {
    console.log('   ↓ repli : paquet npm @mediapipe/tasks-vision ...');
    const response = await fetch(NPM_TARBALL, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status} sur le registre npm`);

    const tar = gunzipSync(Buffer.from(await response.arrayBuffer()));
    const wanted = new Set(WASM_FILES.map((f) => `package/wasm/${f}`));
    let extracted = 0;

    for (const entry of readTar(tar)) {
        if (!wanted.has(entry.name)) continue;
        const destination = path.join(wasmDir, path.basename(entry.name));
        await writeFile(destination, entry.data);
        console.log(`     · ${path.basename(entry.name)} (${human(entry.data.length)})`);
        extracted++;
    }

    if (extracted !== WASM_FILES.length) {
        throw new Error(`${extracted}/${WASM_FILES.length} fichiers wasm extraits`);
    }
}

/* ------------------------------------------------------------------ */

async function main() {
    const modelsDir = path.join(ROOT, 'assets', 'models');
    const wasmDir = path.join(ROOT, 'assets', 'wasm');
    await mkdir(modelsDir, { recursive: true });
    await mkdir(wasmDir, { recursive: true });

    console.log('\n🧠 Modèles MediaPipe');
    let failures = 0;
    for (const model of MODELS) {
        const ok = await fetchInto(path.join(modelsDir, model.file), [model.url], model.file);
        if (!ok) failures++;
    }

    console.log('\n⚙️  Runtime WebAssembly');
    const missing = [];
    for (const file of WASM_FILES) {
        const urls = WASM_MIRRORS.map((build) => build(file));
        const ok = await fetchInto(path.join(wasmDir, file), urls, file);
        if (!ok) missing.push(file);
    }

    if (missing.length > 0) {
        try {
            await fetchWasmFromNpm(wasmDir);
        } catch (error) {
            console.error(`   ✖ ${error.message}`);
            failures += missing.length;
        }
    }

    if (failures > 0) {
        console.error(`\n❌ ${failures} fichier(s) manquant(s). Vérifiez votre connexion puis relancez.`);
        console.error('   Le jeu reste utilisable en mode souris/clavier.\n');
        process.exitCode = 1;
        return;
    }

    console.log('\n✅ Tout est prêt. Lancez `npm start` puis ouvrez http://localhost:8000\n');
}

main().catch((error) => {
    console.error('\n❌ Erreur inattendue :', error);
    process.exitCode = 1;
});
