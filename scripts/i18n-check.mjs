#!/usr/bin/env node
/**
 * Compare en/ko dictionaries in i18n.js, then report used keys missing from en.
 *
 * Used-key sources (as specified):
 *   - index.html  data-i18n="..."
 *   - root *.js and ui/*.js  t('...') / t("...")
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDictionaries() {
  const src = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
  const start = src.indexOf('const translations = ');
  const end = src.indexOf('\nconst AI_PROMPTS');
  if (start < 0 || end < 0) {
    throw new Error('Could not locate translations object in i18n.js');
  }
  const snippet = src.slice(start, end);
  const translations = new Function(`${snippet}
; return translations;`)(); // newline: the snippet may end on a comment line
  if (!translations?.en || !translations?.ko) {
    throw new Error('translations.en / translations.ko missing');
  }
  return {
    en: new Set(Object.keys(translations.en)),
    ko: new Set(Object.keys(translations.ko)),
  };
}

function collectHtmlKeys() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const keys = new Set();
  const re = /data-i18n=(["'])([^"']+)\1/g;
  let m;
  while ((m = re.exec(html))) keys.add(m[2]);
  return keys;
}

function collectJsTKeys() {
  const files = [
    ...fs.readdirSync(root).filter((f) => f.endsWith('.js')).map((f) => path.join(root, f)),
    ...fs.readdirSync(path.join(root, 'ui')).filter((f) => f.endsWith('.js')).map((f) => path.join(root, 'ui', f)),
  ];
  const keys = new Set();
  const re = /\bt\(\s*(['"])([^'"]+)\1/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(text))) keys.add(m[2]);
  }
  return keys;
}

function fmtList(label, items) {
  if (items.length === 0) {
    console.log(`${label}: (none)`);
    return;
  }
  console.log(`${label}: ${items.length}`);
  for (const k of items) console.log(`  ${k}`);
}

const { en, ko } = loadDictionaries();
const enOnly = [...en].filter((k) => !ko.has(k)).sort();
const koOnly = [...ko].filter((k) => !en.has(k)).sort();
const used = new Set([...collectHtmlKeys(), ...collectJsTKeys()]);
const missingEn = [...used].filter((k) => !en.has(k)).sort();

console.log(`en keys: ${en.size}`);
console.log(`ko keys: ${ko.size}`);
console.log(`used keys (html data-i18n + t()): ${used.size}`);
console.log('');
console.log('== en vs ko ==');
fmtList('en-only', enOnly);
fmtList('ko-only', koOnly);
console.log('');
console.log('== used keys missing from en ==');
fmtList('missing', missingEn);

const ok = enOnly.length === 0 && koOnly.length === 0 && missingEn.length === 0;
process.exitCode = ok ? 0 : 1;
