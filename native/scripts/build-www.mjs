// Copies the web app (repo root = single source of truth) into native/www for Capacitor & Electron.
// Only runtime files are copied — never docs/, supabase/, native/, .git, README …
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const out = resolve(here, '..', 'www');
const ENTRIES = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons', 'fonts'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const e of ENTRIES) {
  const src = join(root, e);
  if (!existsSync(src)) throw new Error(`missing web file: ${e}`);
  cpSync(src, join(out, e), { recursive: true, filter: (p) => !p.endsWith('config.example.js') });
}
const count = (d) => readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? count(join(d, f)) : 1), 0);
console.log(`www: copied ${count(out)} files from ${root}`);
