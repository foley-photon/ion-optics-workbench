// Repository bookkeeping: one version in package.json, CITATION.cff and the top entry of CHANGELOG.md, an entry that
// names the engine version of site/js/engine/version.js, and no local paths or e-mail addresses in any file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '../site/js/engine/version.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('package.json, CITATION.cff and CHANGELOG.md carry one version, and its entry names the engine version', () => {
    const pkg = JSON.parse(read('package.json')).version;
    const cff = read('CITATION.cff');
    const cffVersions = [...cff.matchAll(/^ {0,2}version: "([^"]+)"$/gm)].map((m) => m[1]);
    const dates = [...cff.matchAll(/^ {0,2}date-released: "([^"]+)"$/gm)].map((m) => m[1]);
    assert.deepEqual(cffVersions, [pkg, pkg], 'CITATION.cff: the tool and its preferred citation');
    assert.equal(new Set(dates).size, 1, 'one release date');
    const log = read('CHANGELOG.md');
    const top = /^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/m.exec(log);
    assert.ok(top, 'CHANGELOG.md has a version entry');
    assert.equal(top[1], pkg, 'top CHANGELOG entry');
    assert.equal(top[2], dates[0], 'CHANGELOG date and CITATION.cff date-released');
    const entry = log.slice(top.index).split(/\n## /)[0];
    assert.match(entry, new RegExp(`engine (version )?${ENGINE_VERSION.replace(/\./g, '\\.')}\\b`), 'the entry names the engine version');
});

test('no file names a local drive path or carries an e-mail address', () => {
    const SKIP = new Set(['.git', 'node_modules']);
    const BINARY = new Set(['.png', '.jpg', '.ico', '.woff2', '.pdf']);
    const files = [];
    (function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (!SKIP.has(n)) walk(p); } else files.push(p); } })(ROOT);
    // any drive path (a letter, a colon, a slash or backslash and a name), but not a URL scheme such as https:
    const drive = /(?<![A-Za-z0-9+.-])[A-Za-z]:[\\/][A-Za-z0-9_.-]/;
    const fileUrl = /\bfile:\/\/\/(?:[A-Za-z]:|home\/|Users\/)/i;
    const mail = /\b[\w.+-]+@[\w-]+\.(?:com|org|net|edu|gov|io)\b/i;
    const colon = ':';      // the probes are built so that this line does not match itself
    assert.ok(drive.test(`see D${colon}/data/x.csv`) && drive.test(`C${colon}\\code`) && fileUrl.test(`file${colon}///E${colon}/x`));
    assert.ok(!drive.test('https://cdfoley.com/a') && !drive.test('a ratio 1:2') && !fileUrl.test('file:///x/index.html'));
    const hits = [];
    for (const f of files) {
        if (BINARY.has(extname(f))) continue;
        const text = readFileSync(f, 'utf8'), rel = relative(ROOT, f).replace(/\\/g, '/');
        text.split(/\r?\n/).forEach((line, i) => {
            if (drive.test(line) || fileUrl.test(line)) hits.push(`${rel}:${i + 1}: local path`);
            if (mail.test(line)) hits.push(`${rel}:${i + 1}: e-mail address`);
        });
    }
    assert.deepEqual(hits, [], hits.join('\n'));
    assert.ok(files.length > 150, `${files.length} files scanned`);
});
