#!/usr/bin/env node
/**
 * build-bundle.js - buendelt den Bot zu einer einzelnen dist/bot.cjs.
 *
 * Fuer die Auslieferung an Zappify-Kunden: der Bot laeuft dann ueber Zappifys
 * mitgelieferte Electron-Binary (spawn(process.execPath, [dist/bot.cjs],
 * { env: { ELECTRON_RUN_AS_NODE: '1', ... } })) - kein separates Node, keine .exe.
 *
 * - discord.js / axios / dotenv werden mitgebuendelt (pure JS).
 * - better-sqlite3 bleibt EXTERNAL: im Kunden-Profil wird es nie require()d
 *   (botProfile.isCustomer-Gate). Im Playground laeuft der Bot unveraendert aus
 *   src/ mit installiertem node_modules.
 *
 * Aufruf: npm run build:bundle
 */

const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'bot.cjs');

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'index.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile: OUT,
    // native / optionale Module nicht einbuendeln
    external: ['better-sqlite3', 'canvas', 'bufferutil', 'utf-8-validate', 'zlib-sync'],
    logLevel: 'info',
    metafile: true,
    legalComments: 'none',
  });

  const bytes = fs.statSync(OUT).size;
  console.log(`\n[build-bundle] ✅ ${path.relative(ROOT, OUT)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);

  // kurze Warnung, falls better-sqlite3 doch im Graph landet (sollte nur lazy sein)
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some((i) => i.includes('better-sqlite3'))) {
    console.warn('[build-bundle] ⚠️ better-sqlite3 taucht im Modul-Graph auf - lazy-require pruefen!');
  }
}

main().catch((err) => {
  console.error('[build-bundle] ❌', err);
  process.exit(1);
});
