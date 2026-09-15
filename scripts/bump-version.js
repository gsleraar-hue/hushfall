#!/usr/bin/env node
// Raises the version number in package.json (and package-lock.json) for the next build.
// Usage: node scripts/bump-version.js [patch|minor|major|1.2.3]
// Called automatically by `npm run dist`, so every exe gets a number of its own.
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
  else { console.error(`Unknown argument "${arg}". Use patch, minor, major or a number like 1.2.3.`); process.exit(1); }
}

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// package-lock.json holds the number twice; keep those in step so npm does not complain.
const lockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

console.log(`Version ${old} -> ${next}`);
