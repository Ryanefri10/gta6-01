// NEON BAY — a gta6-01 entry (Node 22, standard library only): an original
// open-world crime game in the spirit of GTA 6, built on three.js (r160,
// vendored as game/vendor/three.core.min.js) and plain static files a desktop
// browser loads offline — no network request anywhere in the game.
//
// The player is Jax Marlow, a wheelman back in the sun-soaked port city of
// Neon Bay: explore on foot and by car, steal cars off the street, outrun the
// Bay PD's wanted system (stars, pursuing cruisers, officers on foot), fight
// the Harbor Kings, and run fixer Ms. Vega's three missions (First Wheels,
// Bayfront Pickup, Dockside Showdown) for cash. Around that: traffic and
// pedestrians, a live minimap, cash drops, a synthesized WebAudio soundtrack
// (sound effects plus a music loop, no audio files), a start screen, pause,
// and save/load through localStorage. Controls: WASD move/drive, Shift run,
// E steal/enter/exit car, Space jump/handbrake, mouse aim + click shoot,
// F punch, M mute, Esc pause.
//
// The program hands the game in: it copies game/ and screenshots/ from
// beside this file to /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library. The 4 screenshots are
// real renders of the game's own code (?shot=drive|foot|chase|mission), the
// first by name the cover.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Refuse to hand in a broken entry instead of letting the gate do it: the
// game must have its entry point, its 3D library, and 3–4 screenshots, all
// within the scorer's caps, before the dossier is written.
function fail(message: string): never {
  throw new Error(`neon-bay entry check failed: ${message}`);
}
const indexHtml = join(here, 'game', 'index.html');
if (!existsSync(indexHtml)) fail('game/index.html is missing');
if (statSync(indexHtml).size > 1048576) fail('game/index.html is over the 1 MiB cap');
if (!existsSync(join(here, 'game', 'vendor', 'three.core.min.js'))) fail('game/vendor/three.core.min.js is missing');
const shots = existsSync(join(here, 'screenshots')) ? readdirSync(join(here, 'screenshots')).filter((n) => !n.startsWith('.')) : [];
if (shots.length < 3 || shots.length > 4) fail(`expected 3-4 screenshots, found ${shots.length}`);
for (const shot of shots) {
  const size = statSync(join(here, 'screenshots', shot)).size;
  if (size > 262144) fail(`screenshot ${shot} is ${size} bytes, over the 256 KiB cap`);
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Say what was handed in, so a build log shows the entry at a glance.
console.log(`neon-bay: ${shots.length} screenshots (${shots.join(', ')}) -> ${out}/dossier.json`);
