#!/usr/bin/env node
// Verhoogt het versienummer in package.json (en package-lock.json) voor de volgende build.
// Gebruik: node scripts/bump-version.js [patch|minor|major|1.2.3]
// Wordt automatisch aangeroepen door `npm run dist`, zodat elke exe een eigen nummer krijgt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (process.argv[2] || 'patch').toLowerCase();

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const old = String(pkg.version || '0.0.0');

let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [maj, min, pat] = old.split('.').map(Number);
  if (arg === 'major') next = `${maj + 1}.0.0`;
  else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
  else if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
  else { console.error(`Onbekend argument "${arg}". Gebruik patch, minor, major of een nummer als 1.2.3.`); process.exit(1); }
}

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// package-lock.json bevat het nummer twee keer; houd die gelijk zodat npm niet gaat klagen.
const lockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

console.log(`Versie ${old} -> ${next}`);
