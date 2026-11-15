// STRIKE LANE — a threejs-fps-01 entry (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files the browser loads as
// ES modules with three.js 0.187.0 from an import map, no build step, no network. This
// program hands it in: it copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library (vendor/makefun-threejs.ts, unchanged from the kit).
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all: game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

// A short human-readable summary of what was handed in, for the build log.
function treeBytes(root) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(root, { recursive: true })) {
    const stats = statSync(join(root, name));
    if (stats.isFile()) {
      files += 1;
      bytes += stats.size;
    }
  }
  return { files, bytes };
}
const gameStats = treeBytes(join(out, 'game'));
const shotStats = treeBytes(join(out, 'screenshots'));
const dossierStats = statSync(join(out, 'dossier.json'));
console.log(`STRIKE LANE handed in: game/ ${gameStats.files} files ${gameStats.bytes} bytes, screenshots/ ${shotStats.files} files ${shotStats.bytes} bytes, dossier.json ${dossierStats.size} bytes.`);
