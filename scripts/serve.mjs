#!/usr/bin/env node
/**
 * SERVEUR DE DÉVELOPPEMENT (sans aucune dépendance)
 *
 *   node scripts/serve.mjs [port]
 *
 * Ouvrir index.html en double-cliquant ne fonctionne pas : les modules ES
 * et l'accès webcam exigent http:// ou https://. D'où ce mini-serveur, qui
 * sert aussi les .wasm et .task avec les bons types MIME.
 */

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8000);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.task': 'application/octet-stream',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
    try {
        const requested = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
        let filePath = path.join(ROOT, requested === '/' ? 'index.html' : requested);

        // On ne sert jamais rien en dehors du dossier du projet
        if (!filePath.startsWith(ROOT)) {
            res.writeHead(403).end('403 Interdit');
            return;
        }

        let info = await stat(filePath).catch(() => null);
        if (info?.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
            info = await stat(filePath).catch(() => null);
        }
        if (!info) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Introuvable');
            return;
        }

        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Content-Length': info.size,
            'Cache-Control': 'no-cache'
        });
        createReadStream(filePath).pipe(res);
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`500 ${error.message}`);
    }
});

server.listen(PORT, () => {
    console.log(`\n🕹️  JARVIS ARCADE : http://localhost:${PORT}`);
    console.log('   (localhost est considéré comme sécurisé : la webcam est autorisée)');
    console.log('   Ctrl+C pour arrêter.\n');
});
