// Local preview of the page the way cdfoley.com serves it: site/ at /beta/ion-optics/ (the help page at
// /beta/ion-optics/help/), and the site-wide files the page links from the main site (/assets/css/site.css,
// /assets/js/site.js for the header and footer, /assets/js/plot.js for the 1D charts, the Inter font and the favicon)
// fetched from https://cdfoley.com on first use and kept in memory. No dependencies.
//
//   node scripts/serve.mjs                 http://127.0.0.1:8000/beta/ion-optics/
//   node scripts/serve.mjs --port 8123
//   node scripts/serve.mjs --offline       no shared files: no site header, footer, web font or 1D charts (their tables
//                                          show instead); the solver, the trajectories and the 2D views work
//
// Links to other pages of the site (the header, the footer, the other tools) are sent on to https://cdfoley.com;
// with --offline they give a 404.
// Edits under site/ show on reload (nothing is cached for them).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const MOUNT = '/beta/ion-optics/';
const UPSTREAM = 'https://cdfoley.com';
const args = process.argv.slice(2);
const port = +(args[args.indexOf('--port') + 1] || 0) || 8000;
const offline = args.includes('--offline');
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const shared = new Map();      // /assets/... -> { status, type, body }

function send(res, status, type, body, extra = {}) {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
    res.end(body);
}

async function fromSite(res, rel) {
    const file = path.resolve(SITE, rel || 'index.html');
    if (file !== SITE && !file.startsWith(SITE + path.sep)) return send(res, 403, 'text/plain', 'forbidden');
    let st;
    try { st = fs.statSync(file); } catch { return send(res, 404, 'text/plain', `not found: ${rel}`); }
    if (st.isDirectory()) return fromSite(res, path.join(rel, 'index.html'));
    send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
}

async function fromMainSite(res, p) {
    if (offline) return send(res, 404, 'text/plain', 'offline preview: shared site files are not served');
    if (!shared.has(p)) {
        try {
            const r = await fetch(UPSTREAM + p);
            shared.set(p, { status: r.status, type: r.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await r.arrayBuffer()) });
        } catch (err) {
            return send(res, 502, 'text/plain', `could not fetch ${UPSTREAM}${p}: ${err.message}`);
        }
    }
    const x = shared.get(p);
    send(res, x.status, x.type, x.body);
}

const server = http.createServer(async (req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(res, 400, 'text/plain', 'bad request'); }
    if (p === '/' || p === MOUNT.slice(0, -1)) return send(res, 302, 'text/plain', '', { Location: MOUNT });
    if (p.startsWith(MOUNT)) return fromSite(res, p.slice(MOUNT.length));
    if (p.startsWith('/assets/')) return fromMainSite(res, p);
    if (!offline) return send(res, 302, 'text/plain', '', { Location: UPSTREAM + new URL(req.url, 'http://localhost').pathname });
    send(res, 404, 'text/plain', `not part of this offline preview: ${p}`);
});
server.listen(port, '127.0.0.1', () => {
    console.log(`Ion Optics Workbench preview: http://127.0.0.1:${port}${MOUNT}${offline ? ' (offline: no site header, footer, font or 1D charts)' : ''}`);
});
