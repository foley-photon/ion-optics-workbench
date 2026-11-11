// The check the site's sync job runs on a copied release (scripts/selftest.mjs): it passes on the shipped page, and the
// page check catches broken copies of it (a missing module, an import of a name that is not exported, a module that
// does not parse, a stylesheet that is missing, a lazy module that is missing, a link to the main site outside /assets/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPage, runSuite, statedCounts } from '../scripts/selftest.mjs';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));

/** A copy of site/ in a temporary folder, changed by fn(dir); removed after the callback. */
async function withCopy(fn, check) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'io-selftest-'));
    try {
        fs.cpSync(SITE, dir, { recursive: true });
        fn(dir);
        return await check(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
const edit = (dir, file, from, to) => {
    const p = path.join(dir, file), s = fs.readFileSync(p, 'utf8');
    assert.ok(s.includes(from), `${file} contains ${from}`);
    fs.writeFileSync(p, s.replace(from, to));
};

test('the shipped page passes the page check', async () => {
    assert.deepEqual(await checkPage(SITE), []);
});

test('the validation suite passes at the quick level, the presets build, and the help page states the right counts', async () => {
    const r = await runSuite(SITE, 'quick');
    assert.deepEqual(r.problems, []);
    assert.equal(r.gates.length, 56);
    assert.ok(r.gates.every((g) => g.status === 'pass'));
    assert.equal(r.presets, 11);
    assert.deepEqual(statedCounts(SITE), r.counts);
});

test('the page check catches broken copies', async () => {
    const cases = [
        ['a missing module', (d) => fs.rmSync(path.join(d, 'js/engine/rng.js')), /rng\.js|does not load/],
        ['an import of a name that is not exported', (d) => edit(d, 'js/engine/version.js', 'export const PROTOCOL_VERSION', 'const PROTOCOL_VERSION'), /PROTOCOL_VERSION/],
        ['a module that does not parse', (d) => edit(d, 'js/engine/expr.js', 'export function', 'export functio'), /expr\.js does not load/],
        ['a missing stylesheet', (d) => fs.rmSync(path.join(d, 'css/results.css')), /index\.html names css\/results\.css/],
        ['a missing lazy module', (d) => fs.rmSync(path.join(d, 'js/ui/panels/guide.js')), /guide\.js/],
        ['a link to the main site outside /assets/', (d) => edit(d, 'index.html', 'href="/assets/css/site.css"', 'href="/css/site.css"'), /outside \/assets\//],
        ['no module marker', (d) => fs.rmSync(path.join(d, 'package.json')), /package\.json/],
        ['main.js not loaded', (d) => edit(d, 'index.html', '<script type="module" src="js/ui/main.js"></script>', ''), /main\.js as a module/],
    ];
    for (const [what, change, expect] of cases) {
        const problems = await withCopy(change, (d) => checkPage(d));
        assert.ok(problems.some((p) => expect.test(p)), `${what}: ${JSON.stringify(problems)}`);
    }
});

test('a help page that states other counts than the suite has is caught', async () => {
    const counts = await withCopy((d) => edit(d, 'help/index.html', '<strong>56 gates</strong>', '<strong>57 gates</strong>'), (d) => statedCounts(d));
    assert.equal(counts.gate, 57);
});
