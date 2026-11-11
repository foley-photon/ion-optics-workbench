// Headless-Edge check of the nuclide builder through the Chrome DevTools Protocol (not part of node --test; run it by hand):
//   IO_SHOTS=out node tests/wp7-nuclides-browser.mjs
// Starts the local preview (scripts/serve.mjs, which takes the shared /assets/ files from cdfoley.com), opens
// /beta/ion-optics/?debug, adds a source, builds 238U35+ through the UI,
// reads the species row, sets the energy from keV/u, checks that Escape and Close return the focus to the species picker
// and that the labels fit one line, runs the particles, picks 48Ca11+ from the phone sheet at 390 px,
// and saves nuclide-desktop.png and nuclide-390.png to IO_SHOTS (default: the system temporary folder).
// The browser is Microsoft Edge from its usual Windows folder, or the program named by EDGE (any Chromium build works).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SERVE = fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url));
const OUT = process.env.IO_SHOTS || tmpdir();
const EDGE = process.env.EDGE || join(process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
const PORT = 20000 + Math.floor(Math.random() * 20000);
const DBG = 40000 + Math.floor(Math.random() * 20000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function waitHttp(url, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return await r.text(); } catch (e) { /* retry */ } await sleep(200); }
    throw new Error('timeout waiting for ' + url);
}

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); ws.addEventListener('message', (ev) => this.onMessage(JSON.parse(ev.data))); }
    onMessage(m) {
        if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) rej(new Error(m.error.message)); else res(m.result); }
        else if (m.method) { const hs = this.handlers.get(m.method) || []; for (const h of hs) h(m.params); }
    }
    send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
    on(method, h) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(h); }
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error('page exception: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
        return r.result.value;
    }
    async shot(path) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.data, 'base64')); log('screenshot', path); }
}

const PAGE_HELPERS = `
window.__t = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    until: async (fn, ms = 30000, what = 'condition') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v = null; try { v = fn(); } catch (e) { v = null; } if (v) return v; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout: ' + what); },
    byText: (sel, text) => Array.from(document.querySelectorAll(sel)).find((b) => (b.textContent || '').trim().includes(text)),
    set: (el, value, type = 'input') => { el.value = value; el.dispatchEvent(new Event(type, { bubbles: true })); },
};
true;`;

async function main() {
    const server = spawn(process.execPath, [SERVE, '--port', String(PORT)], { stdio: 'ignore' });
    const prof = mkdtempSync(join(tmpdir(), 'io-cdp-'));
    let edge = null;
    try {
        await waitHttp(`http://127.0.0.1:${PORT}/beta/ion-optics/index.html`);
        edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${prof}`, `--remote-debugging-port=${DBG}`, '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
        await waitHttp(`http://127.0.0.1:${DBG}/json/version`);
        const targets = JSON.parse(await waitHttp(`http://127.0.0.1:${DBG}/json`));
        const page = targets.find((t) => t.type === 'page');
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
        const cdp = new CDP(ws);
        const consoleLines = [];
        cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error' || p.type === 'warning') consoleLines.push(`${p.type}: ${p.args.map((a) => a.value !== undefined ? a.value : a.description).join(' ')}`); });
        cdp.on('Runtime.exceptionThrown', (p) => consoleLines.push('exception: ' + (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text)));
        cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') consoleLines.push(`log ${p.entry.source}: ${p.entry.text} ${p.entry.url || ''}`); });
        await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
        const loaded = new Promise((r) => cdp.on('Page.loadEventFired', r));
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/beta/ion-optics/?debug` });
        await loaded;
        await cdp.eval(PAGE_HELPERS);
        try {
            await cdp.eval(`__t.until(() => window.__ionopt && !(document.getElementById('io-boot') && document.getElementById('io-boot').textContent.trim()), 40000, 'boot')`);
        } catch (e) {
            log('boot wait failed:', e.message);
            log('diag:', JSON.stringify(await cdp.eval(`({ ionopt: typeof window.__ionopt, boot: document.getElementById('io-boot') ? document.getElementById('io-boot').outerHTML.slice(0, 300) : null, canvasLabel: document.getElementById('io-canvas') && document.getElementById('io-canvas').getAttribute('aria-label'), search: location.search, banners: document.getElementById('io-banners') ? document.getElementById('io-banners').textContent.slice(0, 300) : null, toasts: document.getElementById('io-toasts') ? document.getElementById('io-toasts').textContent.slice(0, 300) : null })`)));
            log('console so far:', consoleLines);
            throw e;
        }
        log('booted; engine', await cdp.eval(`__ionopt.ctx.engine && __ionopt.ctx.engine.version ? __ionopt.ctx.engine.version.ENGINE_VERSION : (JSON.stringify(Object.keys(__ionopt.ctx)))`));
        // Particles tab, add a source
        await cdp.eval(`(async () => { const t = await __t.until(() => document.querySelector('[data-tab="particles"]'), 10000, 'particles tab'); t.click(); const b = await __t.until(() => __t.byText('#io-railpanel-particles button', 'Add source'), 10000, 'Add source'); b.click(); await __t.until(() => document.querySelector('[data-nb="pick"]'), 10000, 'species picker'); return true; })()`);
        const groups = await cdp.eval(`Array.from(document.querySelector('[data-nb="pick"]').querySelectorAll('optgroup')).map((g) => g.label + ' (' + g.children.length + ')')`);
        log('optgroups:', groups);
        // open the builder and build 238U35+
        const built = await cdp.eval(`(async () => {
            const pick = document.querySelector('[data-nb="pick"]');
            __t.set(pick, '__nuclide', 'change');
            const root = await __t.until(() => { const r = document.querySelector('[data-nb="root"]'); return r && !r.hidden ? r : null; }, 5000, 'builder open');
            const q = (k) => root.querySelector('[data-nb="' + k + '"]');
            __t.set(q('el'), '92', 'change');
            const out0 = q('out').textContent;
            __t.set(q('q'), '0');
            const msg0 = root.querySelector('[role="alert"]').textContent, dis0 = q('add').disabled;
            __t.set(q('n'), '146');
            __t.set(q('q'), '35');
            const out1 = q('out').textContent, a1 = q('a').value, warnHidden = q('warn').hidden, msgHidden = root.querySelector('[role="alert"]').hidden;
            __t.set(q('a'), '240');
            const n2 = q('n').value, out2 = q('out').textContent;
            __t.set(q('a'), '238');
            __t.set(q('kevu'), '100');
            const ke = q('keout').textContent;
            q('setke').click();
            await __t.sleep(300);
            q('add').click();
            await __t.until(() => document.querySelectorAll('.io-species-row').length >= 2, 5000, 'species row');
            const rows = Array.from(document.querySelectorAll('.io-species-row')).map((r) => ({ label: r.querySelector('[data-key="label"] input').value, mass: r.querySelector('[data-key="mass"] input').value, charge: r.querySelector('[data-key="charge"] input').value }));
            const keField = document.querySelector('[data-key="ke"] input');
            const src = __ionopt.store.get().project.sources.slice(-1)[0];
            return { out0, msg0, dis0, out1, a1, warnHidden, msgHidden, n2, out2, ke, rows, keField: keField ? keField.value : null, species: src.species, energy: src.energy };
        })()`);
        log(JSON.stringify(built, null, 1));
        // keyboard: Escape and Close return the focus to the species picker (not left on a hidden control); labels fit one line
        const focus = await cdp.eval(`(async () => {
            const pick = document.querySelector('[data-nb="pick"]');
            const root = document.querySelector('[data-nb="root"]');
            const q = (k) => root.querySelector('[data-nb="' + k + '"]');
            const labels = Array.from(root.querySelectorAll('label, .io-nb-kelabel')).map((l) => ({ text: l.textContent.trim().slice(0, 30), h: Math.round(l.getBoundingClientRect().height), w: Math.round(l.getBoundingClientRect().width) }));
            q('q').focus();
            root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await __t.sleep(50);
            const afterEsc = { hidden: root.hidden, active: document.activeElement === pick ? 'pick' : (document.activeElement && document.activeElement.id), inHidden: !!(document.activeElement && document.activeElement.closest('[hidden]')) };
            __t.set(pick, '__nuclide', 'change');
            await __t.until(() => !root.hidden, 5000, 'reopen');
            const activeOpen = document.activeElement === q('el') ? 'element select' : (document.activeElement && document.activeElement.id);
            q('close').click();
            await __t.sleep(50);
            const afterClose = { hidden: root.hidden, active: document.activeElement === pick ? 'pick' : (document.activeElement && document.activeElement.id), inHidden: !!(document.activeElement && document.activeElement.closest('[hidden]')) };
            __t.set(pick, '__nuclide', 'change');
            await __t.until(() => !root.hidden, 5000, 'reopen 2');
            return { labels, afterEsc, activeOpen, afterClose, hint: root.querySelector('.hint').textContent };
        })()`);
        log('focus/labels:', JSON.stringify(focus, null, 1));
        if (focus.afterEsc.active !== 'pick' || focus.afterClose.active !== 'pick' || focus.afterEsc.inHidden || focus.afterClose.inHidden) throw new Error('focus not returned to the species picker');
        // run the particles
        const run = await cdp.eval(`(async () => {
            const b = __t.byText('#io-appbar button', 'Run'); if (!b) throw new Error('no Run button'); b.click();
            await __t.sleep(500);
            const st = await __t.until(() => { const s = __ionopt.store.get(); return s.run && s.run.status && s.run.status !== 'running' && s.run.status !== 'queued' ? s.run : null; }, 60000, 'run finished');
            const sum = __ionopt.store.get();
            return { status: st.status, error: st.error || null, launched: st.result && st.result.summary ? st.result.summary.launched : (st.result ? Object.keys(st.result).slice(0, 8) : null) };
        })()`);
        log('run:', JSON.stringify(run));
        await cdp.eval(`document.querySelector('[data-nb="root"]').scrollIntoView({ block: 'center' }); true`);
        await cdp.shot(join(OUT, 'nuclide-desktop.png'));
        // phone width: reload at 390 px, the project persists in local storage
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
        const loaded2 = new Promise((r) => cdp.on('Page.loadEventFired', r));
        await cdp.send('Page.reload');
        await loaded2;
        await cdp.eval(PAGE_HELPERS);
        await cdp.eval(`__t.until(() => window.__ionopt && !(document.getElementById('io-boot') && document.getElementById('io-boot').textContent.trim()), 40000, 'boot 390')`);
        const phone = await cdp.eval(`(async () => {
            const tab = await __t.until(() => document.getElementById('io-sheettab-beam'), 10000, 'Beam sheet tab'); tab.click();
            await __t.sleep(500);
            const sels = Array.from(document.querySelectorAll('select[id^="io-msp-"]'));
            const last = sels[sels.length - 1];
            const groups = last ? Array.from(last.querySelectorAll('optgroup')).map((g) => g.label + ' (' + g.children.length + ')') : [];
            // pick 48Ca11+ for the last source through the sheet
            if (last) { last.value = 'preset:Ca48:11'; last.dispatchEvent(new Event('change', { bubbles: true })); await __t.sleep(300); }
            const src = __ionopt.store.get().project.sources.slice(-1)[0];
            return { isPhone: !!(__ionopt.ctx.ui && __ionopt.ctx.ui.isPhone && __ionopt.ctx.ui.isPhone()), sheetHidden: document.getElementById('io-sheet').hidden, selects: sels.length, groups, first: last ? last.options[0].textContent : null, species: src.species, docWidth: document.documentElement.scrollWidth, viewport: window.innerWidth };
        })()`);
        log('390px:', JSON.stringify(phone));
        await cdp.shot(join(OUT, 'nuclide-390.png'));
        log('console errors/warnings:', consoleLines.length ? consoleLines : 'none');
        ws.close();
    } finally {
        if (edge) edge.kill();
        server.kill();
        await sleep(500);
        try { rmSync(prof, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
}
main().catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; });
