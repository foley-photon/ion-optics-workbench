// Independent physics checks, written for the repository's first release. Every reference number here is computed
// in this file from constants typed in this file (CODATA 2022) and closed-form physics, not taken from the engine, so
// an error in the engine's constants, in a reference value of the validation suite or in a formula of the help page
// shows up as a disagreement. Covered: the constants; the closed-form references of the validation suite
// (bench/targets.js); relativistic kinematics; the order of the reference integrators; step-size convergence and
// energy conservation of the production tracer; time of flight against closed forms, with the Wiley-McLaren space
// focus; unit conversions; charge states and ion masses; mobility, E/N and the hard-sphere mobility; and numbers
// stated in the help page and the hemisphere preset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as K from '../site/js/engine/constants.js';
import { TARGETS } from '../site/js/engine/bench/targets.js';
import { rk4Step, dp45Step, borisPush } from '../site/js/engine/integrate.js';
import { traceParticles } from '../site/js/engine/trace.js';
import { createFieldModel } from '../site/js/engine/fieldmodel.js';
import * as L from '../site/js/engine/layout.js';
import { unitFactor, parseQuantity } from '../site/js/ui/units.js';
import * as N from '../site/js/engine/nuclides.js';
import * as G from '../site/js/engine/gas.js';

// ---------------------------------------------------------------- CODATA 2022, typed here
const e = 1.602176634e-19;            // C, exact
const mu = 1.66053906892e-27;         // kg, atomic mass constant
const me = 9.1093837139e-31;          // kg
const c = 299792458;                  // m/s, exact
const eps0 = 8.8541878188e-12;        // F/m
const mu0 = 1.25663706127e-6;         // N/A²
const kB = 1.380649e-23;              // J/K, exact
const uc2 = mu * c * c / e;           // eV
const mec2 = me * c * c / e;          // eV

const rel = (a, b) => Math.abs(a / b - 1);
const close = (a, b, r, msg) => assert.ok(rel(a, b) <= r, `${msg}: ${a} vs ${b} (rel ${rel(a, b).toExponential(2)}, allowed ${r})`);
/** Agreement with a value printed with some digits: within half a unit in its last printed digit (strings keep zeros). */
function digits(value, printed, msg) {
    const s = String(printed), m = /^-?\d*\.?(\d*)(?:e(-?\d+))?$/i.exec(s);
    const dec = m ? m[1].length - (m[2] ? +m[2] : 0) : 0;
    const tol = 0.5 * 10 ** -dec;
    assert.ok(Math.abs(value - parseFloat(s)) <= tol * (1 + 1e-9), `${msg}: computed ${value} vs printed ${s} (allowed ±${tol})`);
}
/** Speed (m/s) of a particle with kinetic energy keEV and mass in kg, relativistic: c√(1 − 1/γ²) written as c√(ε(2 + ε))/(1 + ε)
 * with ε = γ − 1, which keeps its precision at low energy. */
const speedSI = (keEV, m) => { const x = keEV * e / (m * c * c); return c * Math.sqrt(x * (2 + x)) / (1 + x); };
/** Momentum (kg m/s), relativistic or not. */
const momentumSI = (keEV, m, relativistic) => relativistic ? m * c * Math.sqrt((1 + keEV * e / (m * c * c)) ** 2 - 1) : Math.sqrt(2 * m * keEV * e);

// ---------------------------------------------------------------- constants
test('engine constants are the CODATA 2022 values, and the derived ones follow from them', () => {
    assert.equal(K.E_CHARGE, e); assert.equal(K.AMU_KG, mu); assert.equal(K.ME_KG, me); assert.equal(K.EPS0, eps0); assert.equal(K.MU0, mu0);
    assert.equal(K.C_MMUS, c * 1e-3);                                  // m/s → mm/µs
    close(K.K_ACC, e / mu * 1e-6, 1e-15, 'K_ACC: (e/u) in mm/µs² per V/mm');
    close(K.ME_U, 5.485799090441e-4, 2e-11, 'electron mass in u (CODATA 2022: 5.485 799 090 441(97)e-4)');
    close(K.UC2_EV, 931494103.72, 1e-10, 'u c² (CODATA 2022: 931.494 103 72(29) MeV)');
    close(K.ME_EV, 510998.95069, 1e-10, 'mₑc² (CODATA 2022: 0.510 998 950 69(16) MeV)');
    close(K.MU0_4PI_MM, mu0 / (4 * Math.PI) * 1e3, 1e-15, 'µ0/4π in T·mm/A');
    close(K.K_COUL, e * e / (4 * Math.PI * eps0 * mu) * 1e-3, 1e-15, 'Coulomb constant in engine units');
    close(uc2, K.UC2_EV, 1e-14, 'u c² from the constants typed here');
    close(mec2, K.ME_EV, 1e-14, 'mₑc² from the constants typed here');
});

// ---------------------------------------------------------------- reference values of the validation suite
test('closed-form reference values of the validation suite (targets.js), recomputed independently', () => {
    const T = TARGETS;
    // K1: 100 u, +1 e, 10 mm gap at 1000 V, from rest and from 10 eV along the field
    const a = e * 1e5 / (100 * mu);                                     // m/s²
    digits(Math.sqrt(2 * 0.01 / a) * 1e6, T.K1.values.tRest, 'K1 tRest (µs)');
    digits(Math.sqrt(2 * a * 0.01) * 1e-3, T.K1.values.vRest, 'K1 vRest (mm/µs)');
    const v0 = Math.sqrt(2 * 10 * e / (100 * mu));
    digits((Math.sqrt(v0 * v0 + 2 * a * 0.01) - v0) / a * 1e6, T.K1.values.t10, 'K1 t10 (µs)');
    // K2: 1 m drift at 1000 eV (the case uses the AME2012 mass of the ¹H atom)
    for (const [k, m] of [['m1', 1.00782503223], ['m28', 28], ['m100', 100], ['m1000', 1000]]) {
        digits(1 / Math.sqrt(2 * 1000 * e / (m * mu)) * 1e6, T.K2.values[k], `K2 ${k} (µs)`);
    }
    // K3: gyration radius and frequency
    const gyro = (mKg, keEV, B, relativistic) => {
        const g = relativistic ? 1 + keEV * e / (mKg * c * c) : 1;
        return { r: momentumSI(keEV, mKg, relativistic) / (e * B) * 1e3, f: e * B / (2 * Math.PI * g * mKg) };
    };
    const A3 = gyro(100 * mu, 1000, 0.5, false), B3 = gyro(me, 100, 1e-3, false), C3 = gyro(me, 100, 1e-3, true);
    digits(A3.r, T.K3.values.rA, 'K3 rA (mm)'); digits(A3.f * 1e-3, T.K3.values.fA, 'K3 fA (kHz)');
    digits(B3.r, T.K3.values.rB, 'K3 rB (mm)'); digits(B3.f * 1e-6, T.K3.values.fB, 'K3 fB (MHz)');
    digits(C3.r, T.K3.values.rC, 'K3 rC (mm)'); digits(C3.f * 1e-6, T.K3.values.fC, 'K3 fC (MHz)');
    const D3 = gyro(2000 * mu, 1, 3, false);
    close(D3.f * 1e-3, T.K3d.values.f3, 5e-9, 'K3d f at 3 T (kHz)'); close(D3.r, T.K3d.values.r3, 5e-9, 'K3d r at 3 T (mm)');
    // the sector fields: B that bends 100 u at 1 keV on r = 100 mm (K5, K6) and r = 25 mm (K6b)
    digits(Math.sqrt(2 * 100 * mu * 1000 * e) / (e * 0.1), '0.455286', 'K6 B (T)');
    digits(Math.sqrt(2 * 100 * mu * 1000 * e) / (e * 0.025), '1.821144', 'K6b B (T)');
    digits(100 / Math.tan(Math.PI / 6), T.K6.values.l60, 'K6 l60 (Barber, mm)');
    // K7: uniform RF field, at rest at t = 0
    const W = 2 * Math.PI * 1e6;
    for (const [k, m] of [['m10', 10], ['m100', 100], ['m1000', 1000]]) {
        digits(e * 1e5 / (m * mu * W * W) * (W * 0.5e-6 - Math.sin(W * 0.5e-6)) * 1e3, T.K7.values[k], `K7 ${k} (mm)`);
    }
    // K9: electron with KE = mₑc² in 0.1 T
    digits(Math.sqrt(1 - 1 / 4), T.K9.values.beta, 'K9 β');
    digits(me * c * Math.sqrt(3) / (e * 0.1) * 1e3, T.K9.values.r, 'K9 r (mm)');
    // S1: coax a = 10 (100 V), b = 20 mm (0 V); S2: spheres 80 (+500 V) and 120 mm (−333.333 V)
    for (const r of [12.5, 15, 17.5]) digits(100 - 100 * Math.log(r / 10) / Math.log(2), T.S1.values[r], `S1 V(${r})`);
    digits(100 / (15 * Math.log(2)), T.S1.values.E15, 'S1 |E(15)|');
    const Bs = (500 + 1000 / 3) / (1 / 80 - 1 / 120), As = 500 - Bs / 80;
    assert.ok(Math.abs(Bs - 200000) < 1e-6 && Math.abs(As + 2000) < 1e-9, 'S2: V = 200000/r − 2000');
    for (const r of [90, 100, 110]) digits(As + Bs / r, T.S2.values[r], `S2 V(${r})`);
    digits(Bs / (100 * 100), T.S2.values.E100, 'S2 |E(100)|');
    // T1: parallel-plate mirror, d = 20 mm, KE/qV = 1
    for (const [k, th] of [['r30', 30], ['r45', 45], ['r60', 60]]) digits(2 * 20 * Math.sin(2 * th * Math.PI / 180), T.T1.values[k], `T1 ${k}`);
    digits(20 * Math.sin(Math.PI / 4) ** 2, T.T1.values.depth, 'T1 depth');
    // T7: 127° analyzer, π/√2; KE on the central orbit of the S1 field = q E r / 2
    digits(180 / Math.SQRT2, T.T7.values.angle, 'T7 angle (°)');
    digits(100 / Math.log(2) / 2, '72.1348', 'T7 pass energy at 15 mm (eV)');
    // T11: quadrupole mass filter apex and q* (m/z 100, r0 4 mm, 1.1 MHz)
    const kq = 100 * mu * (4e-3) ** 2 * (2 * Math.PI * 1.1e6) ** 2 / e;
    digits(0.908046 * kq / 4, T.T11.values.Vq, 'T11 V at q*');
    digits(0.236994 * kq / 8, T.T11.values.U, 'T11 U'); digits(0.705996 * kq / 4, T.T11.values.V, 'T11 V');
    // T12: Paul-trap low-mass cut-off, r0 7.07, z0 5 mm, 500 V, 1 MHz
    digits(8 * e * 500 / (0.908046 * ((7.07e-3) ** 2 + 2 * (5e-3) ** 2) * (2 * Math.PI * 1e6) ** 2) / mu, T.T12.values.lmco, 'T12 LMCO (u)');
    // T13: Helmholtz pair (N 100, 1 A, R 100 mm at ±50 mm) and one loop 50 mm from its center
    const loop = (n, z) => mu0 * n * 0.1 ** 2 / (2 * (0.1 ** 2 + z * z) ** 1.5);
    digits(2 * loop(100, 0.05) * 1e3, T.T13.values.helmholtz, 'T13 Helmholtz (mT)');
    digits(loop(1, 0.05) * 1e6, T.T13.values.loop, 'T13 loop (µT)');
    // T16: 100 u at 2 mm/µs
    digits(0.5 * 100 * mu * 2000 ** 2 / e, '2.072854', 'T16 KE (eV)');
    // T19: 2 eV electron in 4.7688984 mT: r = 1 mm; Q = 0.6 e; i = q v E_w with E_w = 1/(10 mm)
    digits(Math.sqrt(2 * me * 2 * e) / (e * 4.7688984e-3) * 1e3, T.T19.values.r, 'T19 r (mm)');
    close(0.6 * e, T.T19.values.Q, 1e-8, 'T19 Q'); close(e * Math.sqrt(2 * 2 * e / me) / 0.01, T.T19.values.i, 1e-8, 'T19 i');
    // T20: logarithmic field, k = 3492.34 V (inner electrode at k ln 5 = 5620.70 V); circular KE = qk/2; apsides of the
    // orbit started at 10 mm with 800 eV less than the circular energy, k/2 − 800 = 946.17 eV
    const k20 = 3492.34, ke20 = k20 / 2 - 800;
    digits(k20 * Math.log(5), '5620.70', 'T20 inner electrode (V)');
    digits(ke20, '946.17', 'T20 bound-orbit KE (eV)');
    digits(k20 / 2, T.T20.values.ke, 'T20 circular KE (eV)');
    let x = 1.5;                                                        // x = r0/r at the inner apsis: KE x² = KE + k ln x
    for (let i = 0; i < 60; i++) x -= (ke20 * x * x - ke20 - k20 * Math.log(x)) / (2 * ke20 * x - k20 / x);
    digits(10 / x, T.T20.values.rMin, 'T20 inner apsis (mm)');
    // D1, D2: mobility drag
    const tau1 = 2e-4 * 100 * mu / e;                                   // s, K = 2 cm²/(V s) = 2e-4 m²/(V s)
    close(2e-4 * 24e3 * 1e-3, T.D1.values.vt, 1e-12, 'D1 terminal velocity (mm/µs)');
    digits(2e-4 * 24e3 * tau1 * 1e3, T.D1.values.dRelax, 'D1 relaxation distance (mm)');
    const K2cm = 4.31 * (760 / 1) * (298 / 273.15);
    digits(K2cm, T.D2.values.K, 'D2 K (cm²/(V s))');
    digits(e / (720 * mu * K2cm * 1e-4) * 1e-6, T.D2.values.damping, 'D2 damping (1/µs)');
    digits(K2cm * 1e-4 * 5e3 * 1e-3, T.D2.values.vt, 'D2 drift velocity (mm/µs)');
    // P2: two protons 1 µm apart share e²/(4πε0 d); P4: capacitances
    digits(e / (4 * Math.PI * eps0 * 1e-6) / 2 * 1e3, T.P2.values.energy, 'P2 energy per proton (meV)');
    digits(2 * Math.PI * eps0 / Math.log(2) * 1e12, T.P4.values.coax, 'P4 coax (pF/m)');
    digits(4 * Math.PI * eps0 / (1 / 0.08 - 1 / 0.12) * 1e12, T.P4.values.sphere, 'P4 spheres (pF)');
});

test('the two-tube axial potential of the S3 references is the Bessel series Σ exp(−jₙζ)/(jₙJ₁(jₙ))', () => {
    // J0 and J1 by their integral representations (Simpson's rule), zeros of J0 by Newton's method
    const J = (n, x) => { const M = 2000; let s = 0; for (let i = 0; i <= M; i++) { const t = Math.PI * i / M, w = i === 0 || i === M ? 1 : i % 2 ? 4 : 2; s += w * Math.cos(n * t - x * Math.sin(t)); } return s * Math.PI / (3 * M) / Math.PI; };
    const zeros = [];
    for (let k = 1; k <= 40; k++) { let z = (k - 0.25) * Math.PI; for (let i = 0; i < 8; i++) z += J(0, z) / J(1, z); zeros.push(z); }
    assert.ok(Math.abs(zeros[0] - 2.404825557695773) < 1e-10, 'first zero of J0');
    const terms = zeros.map((j) => [j, 1 / (j * J(1, j))]);
    // all ten points: the published table is good to one unit in its last digit, and eight of its values are the series
    // correctly rounded; at z/D = 0.1 and 0.6 the series gives 0.3705995 and 0.0440095, printed 0.370599 and 0.044009
    const off = [];
    for (const [zd, ref] of Object.entries(TARGETS.S3.values)) {
        const v = terms.reduce((s, [j, w]) => s + w * Math.exp(-j * 2 * +zd), 0);
        assert.ok(Math.abs(v - parseFloat(ref)) <= 1e-6, `S3 at z/D = ${zd}: series ${v} vs printed ${ref}`);
        if (v.toFixed(6) !== ref) off.push(zd);
    }
    assert.equal(Object.keys(TARGETS.S3.values).length, 10);
    assert.deepEqual(off, ['0.1', '0.6'], 'table values one unit below the correctly rounded series');
});

// ---------------------------------------------------------------- relativistic kinematics
test('relativistic speed, proper speed and kinetic energy agree with the textbook formulas, and the help page numbers follow', () => {
    for (const ke of [1, 1e3, 3e4, 1e5, 1e6, 1e7]) {
        close(K.speedFromKE(ke, K.ME_U, true), speedSI(ke, me) * 1e-3, 1e-12, `electron speed at ${ke} eV`);
        const g = 1 + ke / mec2;
        const x = ke / mec2;                                            // γ − 1, so c√(γ² − 1) = c√(x(2 + x))
        close(K.properSpeedFromKE(ke, K.ME_U), c * Math.sqrt(x * (2 + x)) * 1e-3, 1e-12, `proper speed γv at ${ke} eV`);
        const w = K.properSpeedFromKE(ke, K.ME_U);
        close(K.keFromProper(w, 0, 0, K.ME_U, true), ke, 1e-12, `KE back from w at ${ke} eV`);
        close(K.gammaFromProper(w, 0, 0), g, 1e-13, `γ at ${ke} eV`);
    }
    // nonrelativistic limit for a heavy ion, and the nonrelativistic switch
    close(K.speedFromKE(1000, 100, true), K.speedFromKE(1000, 100, false), 1e-8, '1 keV, 100 u: relativistic correction below 1e-8');
    close(K.speedFromKE(1000, 100, false), Math.sqrt(2 * 1000 * e / (100 * mu)) * 1e-3, 1e-14, 'nonrelativistic speed');
    // help page: the γ² overestimate of the pair forces, and the β² = 0.01 warning threshold
    const g30 = 1 + 3e4 / mec2, g100 = 1 + 1e5 / mec2;
    assert.equal(Math.round((g30 * g30 - 1) * 100), 12, '12 % at 30 keV');
    assert.equal(Math.round((g100 * g100 - 1) * 100), 43, '43 % at 100 keV');
    digits((1 / Math.sqrt(1 - 0.01) - 1) * mec2 / 1e3, '2.6', 'β² = 0.01 at about 2.6 keV');
    // the relativistic cyclotron frequency f = qB/(2πγm) and radius γmv/(qB)
    const cy = K.cyclotron(K.ME_U, -1, 0.1, mec2, true);
    close(cy.freqMHz, e * 0.1 / (2 * Math.PI * 2 * me) * 1e-6, 1e-12, 'K9 frequency');
    close(cy.radiusMM, me * c * Math.sqrt(3) / (e * 0.1) * 1e3, 1e-12, 'K9 radius');
});

// ---------------------------------------------------------------- integrators
/** Harmonic oscillator y'' = −y over one period from (1, 0); returns the final error with n fixed steps. */
function oscillatorError(step, n) {
    const f = (t, y, d) => { d[0] = y[1]; d[1] = -y[0]; };
    const k = Array.from({ length: 7 }, () => new Float64Array(2));
    let y = new Float64Array([1, 0]), yNew = new Float64Array(2);
    const dt = 2 * Math.PI / n;
    for (let i = 0; i < n; i++) {
        if (step === 'dp45') { f(i * dt, y, k[0]); dp45Step(f, i * dt, y, dt, k, yNew, null); }
        else rk4Step(f, i * dt, y, dt, k, yNew);
        [y, yNew] = [yNew, y];
    }
    return Math.hypot(y[0] - 1, y[1]);
}

test('reference integrators converge at their design order: RK4 fourth, Dormand-Prince fifth', () => {
    const order = (step, n) => Math.log2(oscillatorError(step, n) / oscillatorError(step, 2 * n));
    const p4 = order('rk4', 64), p5 = order('dp45', 32);
    assert.ok(p4 > 3.9 && p4 < 4.1, `RK4 observed order ${p4.toFixed(3)}`);
    assert.ok(p5 > 4.85 && p5 < 5.15, `Dormand-Prince observed order ${p5.toFixed(3)}`);
    assert.ok(oscillatorError('dp45', 256) < 1e-10, 'Dormand-Prince at 256 steps per period');
});

test('the relativistic Boris push keeps the speed in a pure magnetic field to rounding, and gyrates at the exact frequency', () => {
    const ke = 3 * mec2, w0 = K.properSpeedFromKE(ke, K.ME_U), B = 0.05;
    const state = { x: [0, 0, 0], w: [w0, 0, 0.3 * w0] };
    const g = K.gammaFromProper(w0, 0, 0.3 * w0);
    const om = K.K_ACC / K.ME_U * B / g;                               // rad/µs (|q| = 1)
    const dt = 2 * Math.PI / om / 128;
    for (let i = 0; i < 128 * 10; i++) borisPush(state, dt, [0, 0, 0], [0, 0, B], -1 / K.ME_U, true);
    close(Math.hypot(...state.w), Math.hypot(w0, 0.3 * w0), 1e-13, '|w| after 10 turns');
    // with the exact rotation angle the phase after whole turns is exact: w returns to its start direction
    assert.ok(Math.abs(state.w[1]) / w0 < 1e-10 && Math.abs(state.w[0] / w0 - 1) < 1e-10, `w after 10 turns: ${state.w}`);
    assert.ok(Math.abs(state.w[2] / (0.3 * w0) - 1) < 1e-13, 'motion along B unchanged');
});

// ---------------------------------------------------------------- production tracer
function dom(h, x, y) {
    return { type: 'planar2d', cell: h, h, x, y, nx: Math.round((x[1] - x[0]) / h) + 1, ny: Math.round((y[1] - y[0]) / h) + 1, mirror: { x: false, y: false }, beyond: {} };
}
function rows(list) {
    const P = new Float64Array(list.length * L.P_STRIDE);
    list.forEach((s, i) => {
        const o = i * L.P_STRIDE, n = Math.hypot(...s.d), w = s.rel ? K.properSpeedFromKE(s.ke, s.m) : K.speedFromKE(s.ke, s.m, false);
        P[o + L.P_ID] = i; P[o + L.P_MASS] = s.m; P[o + L.P_CHARGE] = s.q;
        P[o + L.P_X] = s.p[0]; P[o + L.P_Y] = s.p[1]; P[o + L.P_Z] = s.p[2];
        P[o + L.P_WX] = w * s.d[0] / n; P[o + L.P_WY] = w * s.d[1] / n; P[o + L.P_WZ] = w * s.d[2] / n; P[o + L.P_KE] = s.ke;
        P[o + L.P_C0] = -1; P[o + L.P_C1] = -1; P[o + L.P_C2] = -1;
    });
    return P;
}
const S = (r, i, f) => r.summary[i * L.S_STRIDE + f];

test('tracer: circular orbits in the ideal spherical field converge as the tolerance tightens, and energy is conserved', () => {
    // S2/T8 field V = 200000/r − 2000 (r in mm); q = −1, 1 u at 1000 eV on r0 = 100 mm is a circular orbit
    // a coarse grid (10 mm cells, so steps of up to 100 mm) leaves the step size to the tolerance
    const resolved = { domain: dom(10, [-130, 130], [-130, 130]), electrodes: [{ id: 'gnd' }], magnets: [],
        idealFields: [{ type: 'sphere', center: [0, 0, 0], R1: 80, R2: 120, V1: 500, V2: -1000 / 3 }] };
    const model = createFieldModel({ resolved });
    const period = 2 * Math.PI * 100 / K.speedFromKE(1000, 1, false);
    const errs = [];
    for (const rtol of [1e-6, 1e-8, 1e-10]) {
        const r = traceParticles(model, rows([{ m: 1, q: -1, p: [0, 100, 0], d: [1, 0, 0], ke: 1000 }]),
            { integrator: 'rk45', rtol, relativistic: false, tMax: 3 * period, maxStepCells: 10, nearStepCells: 10 });
        assert.equal(S(r, 0, L.S_STATUS), L.STATUS.TMAX, 'flies until tMax');
        const rr = Math.hypot(S(r, 0, L.S_X), S(r, 0, L.S_Y), S(r, 0, L.S_Z));
        errs.push({ rtol, dr: Math.abs(rr - 100), dE: Math.abs(S(r, 0, L.S_DE_END)) / 1000 });
    }
    assert.ok(errs[1].dr < errs[0].dr && errs[2].dr < errs[1].dr, `radius error shrinks with the tolerance: ${JSON.stringify(errs)}`);
    assert.ok(errs[2].dr < 1e-5, `radius after three turns at rtol 1e-10: ${errs[2].dr} mm`);
    assert.ok(errs[2].dE < 1e-9, `relative energy error at rtol 1e-10: ${errs[2].dE}`);
    assert.ok(errs[0].dE < 1e-4, `relative energy error at the draft tolerance: ${errs[0].dE}`);
});

test('tracer: its Boris path gyrates a 1 MeV electron (γ ≈ 2.96) on the relativistic radius and period', () => {
    // r = p/(|q|B) with p = mₑc√(γ² − 1), T = 2πγmₑ/(|q|B); an electron started along +x in B along +z circles about
    // (0, r), so after half a turn it is at (0, 2r) and after whole turns back at the origin
    const B = 0.1, ke = 1e6, g = 1 + ke / mec2;
    const rMM = me * c * Math.sqrt(g * g - 1) / (e * B) * 1e3, TUS = 2 * Math.PI * g * me / (e * B) * 1e6;
    const resolved = { domain: dom(10, [-150, 150], [-150, 150]), electrodes: [{ id: 'gnd' }], magnets: [{ type: 'uniform', B: [0, 0, B] }], idealFields: [] };
    const model = createFieldModel({ resolved });
    const electron = () => rows([{ m: K.ME_U, q: -1, p: [0, 0, 0], d: [1, 0, 0], ke, rel: true }]);
    const opts = { relativistic: true, maxStepCells: 1, record: { trajectories: false } };
    const half = traceParticles(model, electron(), { ...opts, integrator: 'boris', borisStepsPerGyration: 256, tMax: TUS / 2 });
    assert.equal(S(half, 0, L.S_STATUS), L.STATUS.TMAX, 'flies until tMax');
    assert.ok((S(half, 0, L.S_FLAGS) & L.FLAG.BORIS) !== 0, 'Boris path taken');
    close(S(half, 0, L.S_Y), 2 * rMM, 1e-4, 'half turn: y = 2r');
    assert.ok(Math.abs(S(half, 0, L.S_X)) < 1e-3 * rMM, `half turn: x = ${S(half, 0, L.S_X)} mm`);
    close(S(half, 0, L.S_KE), ke, 1e-12, 'kinetic energy after half a turn');
    // the automatic choice takes the Boris path for a run of more than 50 turns; after 60 whole turns the electron is
    // back at the origin, which only the relativistic period allows (the nonrelativistic one is shorter by γ)
    const long = traceParticles(model, electron(), { ...opts, tMax: 60 * TUS });
    assert.ok((S(long, 0, L.S_FLAGS) & L.FLAG.BORIS) !== 0, 'auto picks Boris');
    assert.equal(S(long, 0, L.S_STATUS), L.STATUS.TMAX, 'flies until tMax');
    assert.ok(Math.hypot(S(long, 0, L.S_X), S(long, 0, L.S_Y)) < 1e-3 * rMM, `after 60 turns: (${S(long, 0, L.S_X)}, ${S(long, 0, L.S_Y)}) mm`);
    close(S(long, 0, L.S_KE), ke, 1e-12, 'kinetic energy after 60 turns');
});

test('tracer: single-field time of flight matches the closed form, and the space focus lies at a drift of 2s (Wiley-McLaren)', () => {
    // source field 100 V/mm over s (from x = 0 to the plane at x = s), field-free drift D to the detector
    const s0 = 5, D = 2 * s0, Efield = 100, m = 100;
    const resolved = { domain: dom(0.5, [-1, 30], [-2, 2]), electrodes: [{ id: 'gnd' }], magnets: [],
        idealFields: [{ type: 'uniformE', E: [Efield, 0, 0], box: { min: [-1, -10, -10], max: [s0, 10, 10] } }] };
    const model = createFieldModel({ resolved });
    const tof = (start) => {
        const r = traceParticles(model, rows([{ m, q: 1, p: [start, 0, 0], d: [1, 0, 0], ke: 0 }]),
            { integrator: 'rk45', rtol: 1e-12, relativistic: false, planes: [{ kind: 'x', at: s0 + D, terminate: true }] });
        assert.equal(S(r, 0, L.S_STATUS), L.STATUS.DETECTED);
        return S(r, 0, L.S_TOF);
    };
    // closed form for a start at depth s before the field edge: t = √(2ms/(qE)) + D/√(2qEs/m) (SI, then µs)
    const exact = (s) => { const a = e * Efield * 1e3 / (m * mu), v = Math.sqrt(2 * a * s * 1e-3); return (v / a + D * 1e-3 / v) * 1e6; };
    close(tof(0), exact(s0), 1e-9, 'TOF from s0');
    close(tof(1), exact(s0 - 1), 1e-9, 'TOF from s0 − 1 mm');
    // ∂T/∂s = 0 at D = 2s: a ±0.1 % change of the start depth changes T only in second order
    const h = s0 * 1e-3, dT = (tof(-h) - tof(h)) / (2 * h), T0 = tof(0);
    assert.ok(Math.abs(dT * s0 / T0) < 1e-6, `∂lnT/∂lns at the space focus: ${dT * s0 / T0}`);
    const slope = (exact(s0 * 1.5 + h) - exact(s0 * 1.5 - h)) / (2 * h);
    assert.ok(Math.abs(slope * 1.5 * s0 / exact(1.5 * s0)) > 1e-2, 'away from the focus the slope is not zero (the check can fail)');
});

// ---------------------------------------------------------------- units, charge states, mobility
test('unit factors: mm, V, eV, u, µs and their typed variants', () => {
    const f = (dim, u) => unitFactor(dim, u);
    assert.equal(f('time', 'ns'), 1e-3); assert.equal(f('time', 'ps'), 1e-6); assert.equal(f('time', 'µs'), 1);
    assert.equal(f('energy', 'keV'), 1e3); assert.equal(f('energy', 'MeV'), 1e6);
    assert.equal(f('length', 'cm'), 10); assert.equal(f('length', 'in'), 25.4); assert.equal(f('length', 'mil'), 0.0254);
    assert.equal(f('mass', 'Da'), 1); assert.equal(f('mass', 'kDa'), 1e3);
    assert.equal(f('flux', 'G'), 1e-4); assert.equal(f('flux', 'kG'), 0.1);
    assert.equal(f('field', 'kV/cm'), 100); assert.equal(f('field', 'V/m'), 1e-3);
    close(f('angle', 'mrad'), 1e-3 * 180 / Math.PI, 1e-15, 'mrad in degrees');
    assert.equal(f('freq', 'kHz'), 1e-3);
    assert.deepEqual(parseQuantity('2 kV', 'voltage'), { kind: 'number', value: 2000, unit: 'kV' });
    assert.equal(parseQuantity('250 ns', 'time').value, 0.25);
    assert.equal(parseQuantity('3.5 keV', 'energy').value, 3500);
});

test('charge states: an ion of charge q has the atomic mass minus q electron masses, and labels and keV/u follow', () => {
    const me_u = me / mu;
    close(N.nuclideMass(92, 238, 35), 238.050786936 - 35 * me_u, 1e-15, '²³⁸U³⁵⁺');
    close(N.nuclideMass(1, 1, -1), 1.007825031898 + me_u, 1e-15, 'H⁻ gains an electron (AME2020 ¹H: 1.007825031898 u)');
    // the binding energy of the removed electrons is neglected (help page, Mass convention): ¹H⁺ comes out lighter than the
    // proton by the 13.598 eV ionization energy of hydrogen, and bare ⁴He lighter than the α particle by the 79.005 eV of
    // both helium electrons (CODATA 2022 proton and α masses; NIST ASD ionization energies)
    close((1.0072764665789 - N.nuclideMass(1, 1, 1)) * uc2, 13.598, 2e-3, '¹H⁺ against the proton (eV)');
    close((4.001506179129 - N.nuclideMass(2, 4, 2)) * uc2, 79.005, 2e-3, '⁴He²⁺ against the α particle (eV)');
    assert.ok((4.001506179129 - N.nuclideMass(2, 4, 2)) / 4 < 1e-6, 'far below the 1e-6 of the mass stated in the help page');
    assert.equal(N.nuclideLabel(92, 238, 35), '²³⁸U³⁵⁺');
    assert.equal(N.totalEnergyFromPerNucleon(10, 238), 2.38e6);
    // help page: the ion mass in u differs from A by 0.7 % for a proton and by 1.3e-4 for ²³⁸U³⁵⁺
    assert.equal(+((N.nuclideMass(1, 1, 1) - 1) * 100).toFixed(1), 0.7);
    assert.equal(+((N.nuclideMass(92, 238, 35) / 238 - 1)).toPrecision(2), 1.3e-4);
});

test('mobility: K from K0, E/N in Td, and the hard-sphere mobility against the Mason-Schamp cross section', () => {
    close(G.mobilityFromReduced(4.31, 1, 298), 4.31 * 760 * 298 / 273.15, 1e-15, 'K = K0 (760/p)(T/273.15)');
    close(G.reducedMobility(G.mobilityFromReduced(2.5, 3.2, 310), 3.2, 310), 2.5, 1e-15, 'K0 back from K');
    // D2: 5 V/mm at 1 Torr and 298 K is 154 Td
    const n = (101325 / 760) / (kB * 298);
    assert.equal(Math.round(5e3 / n / 1e-21), 154, 'E/N in Td');
    // the drag time constant τ = K m/q: 2 cm²/(V s), 100 u
    close(G.dragTimeConstant(2, 100, 1), 2e-4 * 100 * mu / e * 1e6, 1e-14, 'τ in µs');
    // K0 = 4.31 cm²/(V s) for m/z 720 in He corresponds to Ω = 124 Å² at 300 K (targets.js, D2): a rigid-sphere pair with
    // πd² = 124 Å² must give K0 = 4.31 within the rounding of 124
    const d = Math.sqrt(124 / Math.PI);                                  // Å
    const gas = { pressure: 101325, temperature: 300, mass: 4.002602, diameter: d, ionDiameter: d };
    const k0 = G.reducedMobility(G.hardSphereMobility(720, gas), 760, 300);
    assert.ok(Math.abs(k0 / 4.31 - 1) < 0.005, `K0 from Ω = 124 Å²: ${k0}`);
});

test('numbers in the hemisphere preset notes follow from V(r) = 2Ep(R0/r − 1)', async () => {
    const preset = (await import('../site/js/presets/hemisphere.js')).default;
    const notes = preset.build().meta.notes;
    const v = (r) => 2 * 100 * (100 / r - 1);
    assert.match(notes, /= \+50 V/); assert.equal(v(80), 50);
    assert.match(notes, /= -33\.33 V/); assert.equal(v(120).toFixed(2), '-33.33');
    const stated = /that is ([+-][\d.]+), ([+-][\d.]+), ([+-][\d.]+) and ([+-][\d.]+) V/.exec(notes).slice(1).map(Number);
    assert.deepEqual(stated, [84.5, 92.5, 107.5, 115.5].map((r) => +v(r).toFixed(2)));
    // dispersion of an ideal 180° spherical analyzer: 2R0 per unit ΔE/E, so 2 mm per 1 % at R0 = 100 mm
    assert.match(notes, /Each 1 % of energy moves the landing point by about 2 mm/);
});

test('help page: the Boris drift error θ²/12 at 128 steps per turn and the Lorentz-limit factor 32/(9π)', () => {
    const help = readFileSync(new URL('../site/help/index.html', import.meta.url), 'utf8');
    const th = 2 * Math.PI / 128;
    assert.ok(Math.abs(th * th / 12 - 2e-4) < 0.05e-4, `θ²/12 = ${th * th / 12}`);
    assert.match(help, /θ²\/12 = 2×10<sup>−4<\/sup> at 128 steps per turn/);
    assert.equal((32 / (9 * Math.PI)).toFixed(2), '1.13');
    assert.match(help, /32\/\(9π\) &asymp; 1\.13/);
    // a Gaussian holds 76.1 % within ± FWHM/2 = ±1.1774σ
    const erf = (x) => { let s = 0, t = x; for (let n = 0; n < 60; n++) { s += t / (2 * n + 1); t *= -x * x / (n + 1); } return 2 / Math.sqrt(Math.PI) * s; };
    assert.equal((100 * erf(Math.sqrt(Math.log(2)))).toFixed(1), '76.1');
    assert.match(help, /76\.1%/);
});
