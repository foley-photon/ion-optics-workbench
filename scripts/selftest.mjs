// The page check and the validation suite in Node, the check the site's sync job runs on a copied release before it
// publishes it.
//
//   node scripts/selftest.mjs [site folder] [--level quick|full]      default: site/ of this repository, quick level
//
// Page check: site/package.json marks the modules as ES modules (Node needs it; browsers ignore it); every module under
// js/ parses and loads in Node with all of its imports resolved (the ES module linker refuses an import of a missing
// file or of a name the imported module does not export); every module named by a lazy import(), a worker URL or the
// inline script of a page exists; index.html and help/index.html load their stylesheets and scripts from files that
// exist, and from the main site only under /assets/; index.html loads js/ui/main.js as a module.
// Validation suite: every case of js/engine/bench/cases.js at the chosen level, the way the Benchmarks tab runs it.
// Every gate must pass, and the numbers of gates, informational and planned cases must be the ones the help page states.
// Each preset must build a project that the schema accepts without errors.
//
// Prints a summary and every problem; exit code 1 when anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SITE = path.join(HERE, '..', 'site');

function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
    }
    return out;
}
const rel = (siteDir, p) => path.relative(siteDir, p).split(path.sep).join('/');

/** Local files a page names in href/src (not absolute, not external, not fragments), and its absolute paths. */
function pageRefs(html) {
    const local = [], absolute = [];
    for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
        const u = m[1];
        if (!u || u.startsWith('#') || /^(https?:|mailto:|data:)/.test(u)) continue;
        if (u.startsWith('/')) absolute.push(u); else local.push(u.split('#')[0].split('?')[0]);
    }
    return { local, absolute };
}

/**
 * Problems that would stop the page or its help page from loading (an empty list when there are none).
 * @param {string} siteDir
 * @returns {Promise<string[]>}
 */
export async function checkPage(siteDir = DEFAULT_SITE) {
    const problems = [];
    const pkgPath = path.join(siteDir, 'package.json');
    try {
        if (JSON.parse(fs.readFileSync(pkgPath, 'utf8')).type !== 'module') problems.push('package.json does not set "type": "module"');
    } catch { problems.push('package.json is missing or not JSON'); }
    if (!fs.existsSync(path.join(siteDir, 'js'))) return [...problems, 'js/ is missing'];
    const modules = walk(path.join(siteDir, 'js')).filter((f) => f.endsWith('.js'));
    // the worker expects a worker scope; give it a stand-in for the import and take it away afterwards
    const hadSelf = 'self' in globalThis;
    if (!hadSelf) globalThis.self = { postMessage() {}, set onmessage(fn) {} };
    try {
        for (const f of modules) {
            try { await import(pathToFileURL(f).href); } catch (e) { problems.push(`${rel(siteDir, f)} does not load: ${String(e && e.message || e).split('\n')[0]}`); }
        }
    } finally {
        if (!hadSelf) delete globalThis.self;
    }
    // lazy imports and worker URLs with literal paths, and the path tables of main.js
    for (const f of modules) {
        const src = fs.readFileSync(f, 'utf8');
        const targets = [
            ...[...src.matchAll(/import\(\s*'(\.{1,2}\/[^']+\.js)'\s*\)/g)].map((m) => m[1]),
            ...[...src.matchAll(/new URL\(\s*'(\.{1,2}\/[^']+\.js)'\s*,\s*import\.meta\.url\s*\)/g)].map((m) => m[1]),
            ...[...src.matchAll(/^\s+\w+:\s*'(\.{1,2}\/[^']+\.js)',?\s*$/gm)].map((m) => m[1]),
        ];
        for (const t of targets) if (!fs.existsSync(path.resolve(path.dirname(f), t))) problems.push(`${rel(siteDir, f)} names ${t}, which is missing`);
    }
    for (const page of ['index.html', 'help/index.html']) {
        const p = path.join(siteDir, page);
        if (!fs.existsSync(p)) { problems.push(`${page} is missing`); continue; }
        const html = fs.readFileSync(p, 'utf8');
        const { local, absolute } = pageRefs(html);
        for (const u of local) {
            if (u === '' || u.endsWith('/')) { if (!fs.existsSync(path.resolve(path.dirname(p), u, 'index.html'))) problems.push(`${page} links ${u}, which has no index.html`); continue; }
            if (!fs.existsSync(path.resolve(path.dirname(p), u))) problems.push(`${page} names ${u}, which is missing`);
        }
        for (const u of absolute) if (!u.startsWith('/assets/')) problems.push(`${page} names ${u} on the main site outside /assets/`);
        for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
            for (const im of m[1].matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
                const target = path.resolve(path.dirname(p), im[2]);
                if (!fs.existsSync(target)) { problems.push(`${page}: inline script imports ${im[2]}, which is missing`); continue; }
                const mod = await import(pathToFileURL(target).href);
                for (const name of im[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
                    if (!(name in mod)) problems.push(`${page}: inline script imports ${name} from ${im[2]}, which does not export it`);
                }
            }
        }
    }
    const index = fs.existsSync(path.join(siteDir, 'index.html')) ? fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8') : '';
    if (index && !/<script type="module" src="js\/ui\/main\.js"><\/script>/.test(index)) problems.push('index.html does not load js/ui/main.js as a module');
    return problems;
}

/** The counts of gates, informational and planned cases that the help page states ({} if it does not say). */
export function statedCounts(siteDir) {
    const help = fs.readFileSync(path.join(siteDir, 'help', 'index.html'), 'utf8');
    const m = /There are <strong>(\d+) gates<\/strong>[^]*?<strong>(\d+) informational comparisons<\/strong>[^]*?<strong>(\d+) planned cases<\/strong>/.exec(help);
    return m ? { gate: +m[1], info: +m[2], planned: +m[3] } : {};
}

/**
 * Runs the validation suite and builds every preset.
 * @returns {Promise<{ engine: string, level: string, results: object[], gates: object[], problems: string[], seconds: number }>}
 */
export async function runSuite(siteDir = DEFAULT_SITE, level = 'quick') {
    const imp = (p) => import(pathToFileURL(path.join(siteDir, p)).href);
    const { BENCHMARKS, runBenchmark } = await imp('js/engine/bench/cases.js');
    const { ENGINE_VERSION } = await imp('js/engine/version.js');
    const { PRESETS } = await imp('js/presets/index.js');
    const { validate } = await imp('js/engine/schema.js');
    const problems = [];
    const t0 = performance.now();
    const results = [];
    for (const b of BENCHMARKS) results.push({ ...(await runBenchmark(b.id, level, {})), kind: b.kind });
    const gates = results.filter((r) => r.kind === 'gate');
    for (const r of gates) if (r.status !== 'pass') problems.push(`gate ${r.id} ${r.status}${r.details && r.details.error ? `: ${r.details.error}` : ''}`);
    for (const r of results) if (r.status === 'error') { if (r.kind !== 'gate') problems.push(`case ${r.id} error: ${r.details && r.details.error}`); }
    const counts = { gate: gates.length, info: results.filter((r) => r.kind === 'info').length, planned: results.filter((r) => r.kind === 'planned').length };
    const stated = statedCounts(siteDir);
    if (stated.gate === undefined) problems.push('the help page does not state the numbers of gates, informational and planned cases');
    for (const k of ['gate', 'info', 'planned']) if (stated[k] !== undefined && stated[k] !== counts[k]) problems.push(`the help page states ${stated[k]} ${k} cases; the suite has ${counts[k]}`);
    for (const p of PRESETS) {
        try {
            const v = validate(p.build());
            if (v.errors.length) problems.push(`preset ${p.id}: ${v.errors.length} schema error(s), first: ${v.errors[0].message}`);
        } catch (e) { problems.push(`preset ${p.id} does not build: ${e && e.message || e}`); }
    }
    return { engine: ENGINE_VERSION, level, results, gates, counts, presets: PRESETS.length, problems, seconds: (performance.now() - t0) / 1000 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    const li = args.indexOf('--level');
    const level = li >= 0 && args[li + 1] === 'full' ? 'full' : 'quick';
    const positional = args.filter((a, i) => !a.startsWith('--') && !(li >= 0 && i === li + 1));
    const siteDir = positional[0] ? path.resolve(positional[0]) : DEFAULT_SITE;
    const pageProblems = await checkPage(siteDir);
    for (const p of pageProblems) console.log('PAGE', p);
    let suite = null;
    try { suite = await runSuite(siteDir, level); } catch (e) { console.log('SUITE could not run:', e && e.message || e); }
    if (suite) {
        for (const r of suite.results.filter((x) => x.kind === 'gate' && x.status !== 'pass')) {
            const bad = (r.checks || []).filter((c) => !c.pass).map((c) => `${c.label}: ${c.value} vs ${c.target}`).join('; ');
            console.log('FAIL', r.id, bad || (r.details && r.details.error) || r.status);
        }
        for (const p of suite.problems.filter((x) => !x.startsWith('gate '))) console.log('SUITE', p);
        const passed = suite.gates.filter((r) => r.status === 'pass').length;
        console.log(`Engine ${suite.engine}, ${level} level: ${passed}/${suite.gates.length} gates pass, ${suite.counts.info} informational, `
            + `${suite.counts.planned} planned, ${suite.presets} presets build (${suite.seconds.toFixed(1)} s); `
            + `page ${pageProblems.length ? `${pageProblems.length} problem(s)` : 'loads'}`);
    }
    const failed = pageProblems.length > 0 || !suite || suite.problems.length > 0;
    if (failed) console.log('not passed');
    process.exit(failed ? 1 : 0);
}
