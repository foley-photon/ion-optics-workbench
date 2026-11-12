// Interface review of 0.2.5: the name strip, the key-results row and the split Planes card of the Summary, the
// Benchmarks verdict pill, error columns to 3 digits, the scan-edge note, the plane label kept on the canvas, the dock
// "More" menu, the first-visit card and the folded run settings of the inspector, the "?" help links, and the help page
// (scrolling tables, shorter paragraphs, links to the site's calculators, how to run the gates, "Start here").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verdict, summarise } from '../site/js/ui/panels/benchmarks.js';
import { scanBestAtEdge, SCAN_EDGE_NOTE } from '../site/js/ui/panels/scan.js';
import { planeLines, kpiTiles, accuracyDigits } from '../site/js/ui/panels/results.js';
import { PEAK_DIGITS } from '../site/js/ui/panels/tof.js';
import { START_STEPS, INSPECTOR_PREFS_KEY, readPrefs, writePrefs } from '../site/js/ui/panels/inspector.js';
import { planeLabelX } from '../site/js/ui/view2d.js';
import { fmtNum } from '../site/js/ui/plots.js';
import { HELP_TOPICS } from '../site/js/ui/dom.js';
import { BENCHMARKS } from '../site/js/engine/bench/cases.js';
import { PRODUCT_NAME } from '../site/js/engine/version.js';

const site = (p) => readFileSync(new URL('../site/' + p, import.meta.url), 'utf8');

test('Benchmarks verdict: green count when every gate passed, red "N failed" otherwise, neutral while incomplete', () => {
    const gates = BENCHMARKS.filter((b) => b.kind === 'gate');
    const all = summarise(gates.map((b) => ({ id: b.id, status: 'pass' })));
    assert.deepEqual(verdict(all), { text: `${gates.length}/${gates.length} gates passed`, cls: 'badge-ok' });
    const two = summarise(gates.map((b, i) => ({ id: b.id, status: i === 0 ? 'fail' : i === 1 ? 'error' : 'pass' })));
    assert.deepEqual(verdict(two), { text: '2 failed', cls: 'badge-bad' });
    const some = summarise(gates.slice(0, 5).map((b) => ({ id: b.id, status: 'pass' })));
    assert.deepEqual(verdict(some), { text: `5/${gates.length} gates passed`, cls: '' });
    assert.equal(verdict({ gates: 0, passed: 0, failed: 0 }).cls, '', 'no gates: not green');
});

test('scan: the best point at an end of the range is flagged, a flat metric and an inner optimum are not', () => {
    assert.equal(scanBestAtEdge([1, 2, 3, 4], [9, 7, 5, 3], 4), true, 'last point, still falling');
    assert.equal(scanBestAtEdge([1, 2, 3, 4], [3, 5, 7, 9], 1), true, 'first point');
    assert.equal(scanBestAtEdge([4, 3, 2, 1], [3, 5, 7, 9], 4), true, 'a scan run downward');
    assert.equal(scanBestAtEdge([1, 2, 3, 4], [9, 3, 5, 7], 2), false, 'bracketed');
    assert.equal(scanBestAtEdge([1, 2, 3, 4], [1, 1, 1, 1], 1), false, 'flat (a transmission of 100% everywhere)');
    assert.equal(scanBestAtEdge([1, 2], [2, 1], 2), false, 'two points bracket nothing');
    assert.equal(scanBestAtEdge([1, 2, 3], [NaN, 2, 1], 3), false, 'only two finite points');
    assert.match(SCAN_EDGE_NOTE, /^ It is at the edge of the scanned range; widen the range/);
    assert.ok(!SCAN_EDGE_NOTE.includes(String.fromCharCode(8212)), 'a sentence, not a dash');
});

test('Summary: one row per number of a plane, per species when there are several', () => {
    const p = { crossings: 42, spotRms: 1.2884, meanTof: 5.58495 };
    assert.deepEqual(planeLines(p, [{ label: 'm/z 100', mean: 4.39264 }]), [['crossings', '42'], ['rms spot', '1.288 mm'], ['mean TOF', '5.5850 µs']]);
    assert.deepEqual(planeLines(p, [{ label: 'm/z 100', mean: 4.39264 }, { label: '²³⁸U⁺', mean: 6.77731 }]),
        [['crossings', '42'], ['rms spot', '1.288 mm'], ['mean TOF m/z 100', '4.3926 µs'], ['mean TOF ²³⁸U⁺', '6.7773 µs']]);
});

test('Summary: the key-results row gives transmission, a single waist and the energy error, and leaves out what a run lacks', () => {
    const s = { launched: 21, transmission: { overall: 1, byPlane: [{ index: 0, id: 'p1', name: 'Image plane', detected: 21, fraction: 1 }] }, energy: { maxEnd: 3.43e-6, maxEndRel: 3.4e-9, warned: 0 } };
    const bw = { ok: true, axis: 'x', position: 78.9123, rms: 0.11412, groups: [{ label: 'a', n: 21, position: 78.9123, rms: 0.11412 }] };
    assert.deepEqual(kpiTiles(s, bw), [
        { label: 'Transmission', value: '100%', sub: '21 of 21 detected' },
        { label: 'Waist x', value: '78.91 mm' },
        { label: 'rms at waist', value: '0.114 mm' },
        { label: 'max |ΔE|', value: '3.43e−6 eV', sub: '3.4e−9 relative', cls: '' },
    ]);
    // species that focus apart have no common waist (the Waist card lists them); no detector, no energy check: no tiles
    const split = { ok: true, axis: 'x', position: 175.4, rms: 0.088, spread: 193, groups: [{ label: 'a', n: 21, position: 78.91, rms: 0.11 }, { label: 'b', n: 21, position: 272, rms: 0.05 }] };
    assert.deepEqual(kpiTiles({ launched: 5, transmission: { overall: 0, byPlane: [] }, energy: { maxEnd: NaN } }, split), []);
    assert.deepEqual(kpiTiles({ launched: 5, transmission: { overall: 0, byPlane: [] }, energy: { maxEnd: NaN } }, { ok: false, reason: 'x' }), []);
    // several detectors: the fraction detected on any of them; particles over the tolerance are marked
    const two = kpiTiles({ launched: 40, transmission: { overall: 0.875, byPlane: [{ detected: 20, fraction: 0.5 }, { detected: 15, fraction: 0.375 }] }, energy: { maxEnd: 0.02, maxEndRel: 2e-5, warned: 3 } }, null);
    assert.deepEqual(two[0], { label: 'Transmission', value: '87.5%', sub: 'on 2 detectors' });
    assert.deepEqual(two[1], { label: 'max |ΔE|', value: '0.02 eV', sub: 'over the tolerance', cls: 'io-warn-text' });
});

test('difference and error columns show 3 significant digits; values keep the table default', () => {
    assert.deepEqual(accuracyDigits(9), [undefined, undefined, undefined, 3, 3, 3, 3, 3, 3]);
    assert.equal(PEAK_DIGITS[3], 3, 'σ');
    assert.equal(PEAK_DIGITS[7], 3, 'FWHM');
    assert.equal(PEAK_DIGITS[2], undefined, 'the mean keeps its digits');
    assert.equal(fmtNum(-0.005685415, 3), '−0.00569');
    assert.equal(fmtNum(0.002753568, 3), '0.00275');
    const plots = site('js/ui/plots.js');
    assert.match(plots, /\(colDigits && colDigits\[c\]\) \|\| digits/);
});

test('a plane name stays on the canvas: right of the line, or left of it near the right edge', () => {
    assert.equal(planeLabelX(100, 60, 600), 104);
    assert.equal(planeLabelX(580, 60, 600), 516, 'right-aligned to the left of the line');
    assert.equal(planeLabelX(540, 60, 600), 476, '544 + 60 would pass 596');
    assert.equal(planeLabelX(532, 60, 600), 536, 'just fits');
    assert.equal(planeLabelX(20, 300, 200), 4, 'a name wider than the canvas starts at the left margin');
});

test('dock tabs: all when they fit, else the leading ones beside "More", and always the open tab', async () => {
    const { dockTabsFit, DOCK_PANELS } = await import('../site/js/ui/main.js');
    const w = [84, 49, 66, 50, 54, 65, 158, 99, 82, 103, 48];   // widths measured in Edge at 1280 px
    assert.equal(w.length, DOCK_PANELS.length);
    assert.deepEqual(dockTabsFit(w, 900, 71, 0), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(dockTabsFit(w, 590, 71, 0), [0, 1, 2, 3, 4, 5], 'Summary to Profile stay');
    assert.deepEqual(dockTabsFit(w, 590, 71, 9), [0, 1, 2, 3, 4, 5, 9], 'Benchmarks open: it stays on the strip');
    assert.deepEqual(dockTabsFit(w, 540, 71, 9), [0, 1, 2, 3, 4, 9], 'and takes the room of the last leading tab when it must');
    assert.deepEqual(dockTabsFit(w, 590, 71, -1), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(dockTabsFit(w, 100, 71, 3), [3], 'no room: the open tab alone');
    for (const sel of [0, 5, 10]) for (const avail of [200, 400, 600, 857]) {
        const keep = dockTabsFit(w, avail, 71, sel);
        assert.ok(keep.includes(sel));
        assert.ok(keep.length === 1 || keep.reduce((a, i) => a + w[i], 0) + 71 <= avail, `fits at ${avail}`);
    }
});

test('inspector: the run settings start folded, the first-visit card closes for good, and both choices are stored', () => {
    const store = new Map();
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    assert.deepEqual(readPrefs(storage), { quickOpen: false, startClosed: false });
    writePrefs({ quickOpen: true, startClosed: true }, storage);
    assert.deepEqual(JSON.parse(store.get(INSPECTOR_PREFS_KEY)), { quickOpen: true, startClosed: true });
    assert.deepEqual(readPrefs(storage), { quickOpen: true, startClosed: true });
    store.set(INSPECTOR_PREFS_KEY, '{not json');
    assert.deepEqual(readPrefs(storage), { quickOpen: false, startClosed: false }, 'damaged entry: defaults');
    assert.deepEqual(readPrefs({ getItem() { throw new Error('blocked'); } }), { quickOpen: false, startClosed: false });
    assert.doesNotThrow(() => writePrefs({ quickOpen: true }, { setItem() { throw new Error('full'); } }));
    assert.deepEqual(START_STEPS.map((s) => s[0]), ['Drag a voltage.', 'Pick a preset.', 'Read the Summary.']);
});

test('the "?" links of the panels point at sections the help page has', () => {
    const help = site('help/index.html');
    assert.deepEqual(Object.keys(HELP_TOPICS), ['units', 'geometry', 'physics', 'accuracy']);
    for (const a of [...Object.keys(HELP_TOPICS), 'quick-start', 'textbooks']) assert.match(help, new RegExp(`<h[23] id="${a}"`), `help has #${a}`);
    assert.match(site('js/ui/panels/domain.js'), /helpLink\('units'\)[\s\S]*helpLink\('accuracy'\)|helpLink\('accuracy'\)[\s\S]*helpLink\('units'\)/);
    assert.match(site('js/ui/panels/domain.js'), /helpLink\('physics'\)/);
    assert.match(site('js/ui/panels/electrodes.js'), /helpLink\('geometry'\)/);
});

test('page: the name is a visible h1 with one line of what the tool does; the share dialog can copy and says what a link is', async () => {
    const html = site('index.html');
    assert.match(html, /<h1 class="io-ident-name" data-product-name><\/h1>/);
    assert.ok(!/<h1[^>]*visually-hidden/.test(html), 'the h1 is no longer hidden');
    assert.match(html, /Draw electrodes, solve the field and trace ions and electrons, all in your browser\. <a href="help\/">/);
    assert.equal(html.split(PRODUCT_NAME).length - 1, 1, 'the name still comes from PRODUCT_NAME');
    const { SHARE_NOTE } = await import('../site/js/ui/main.js');
    assert.equal(SHARE_NOTE, 'The link carries the whole project after the #; anyone with the link can open a copy. Nothing is uploaded.');
    const main = site('js/ui/main.js');
    assert.match(main, /label: 'Copy link', primary: true/);
    assert.match(main, /text: SHARE_NOTE/);
    const css = site('css/app.css');
    assert.match(css, /\.io-rail \{ display: grid; grid-template-columns: 56px minmax\(0, 1fr\);/);
    assert.match(css, /\.io-railtab-label \{[^}]*max-width: 52px;/);
    // nuclide builder: every number input carries its full name
    assert.match(site('js/ui/panels/particles.js'), /'aria-label': unit \? `\$\{label\} \(\$\{unit\}\)` : label/);
});

test('help page: wide tables scroll in their own box, long paragraphs are split, and the calculators are linked', () => {
    const help = site('help/index.html');
    assert.match(help, /<div class="table-wrap">\s*<table>\s*<thead><tr><th>Level<\/th>/, 'the accuracy-levels table');
    assert.match(help, /<table class="io-help-cases sticky-col">/, 'the validation table keeps its ID column in view');
    for (const lead of ['What it adds.', 'What it is not.', 'Limits, and what stays the same.', 'Accuracy.', 'Choosing the softening.', 'Lenses.', 'Time of flight.', 'Detector images.', 'Maps and contours.']) {
        assert.ok(help.includes(`<p><strong>${lead}</strong> `), `lead-in "${lead}"`);
    }
    for (const tool of ['ion-time-of-flight', 'mean-free-path', 'cyclotron-radius']) assert.ok(help.includes(`href="https://cdfoley.com/tools/${tool}/"`), tool);
    assert.match(help, /open the <em>Benchmarks<\/em> tab in the simulator and press <em>Run quick<\/em>\./);
    assert.match(help, /<h3>Start here<\/h3>/);
    // no paragraph or list item of the two sections that were split runs past 1,700 characters of text
    const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ');
    const sec = help.slice(help.indexOf('<h3 id="physics">'), help.indexOf('<p><strong>Charges &amp; multipoles.</strong>'));
    for (const m of sec.matchAll(/<p>([\s\S]*?)<\/p>/g)) assert.ok(text(m[1]).length < 1700, `${text(m[1]).slice(0, 40)}… is ${text(m[1]).length} characters`);
});
