// WP7 nuclides: the AME2020 table (engine/data/nuclides.js), ion masses and labels (engine/nuclides.js) and the preset
// groups of the species picker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import * as N from '../site/js/engine/nuclides.js';
import { SPECIES } from '../site/js/engine/particles.js';
import { ME_U } from '../site/js/engine/constants.js';

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUBS = '₀₁₂₃₄₅₆₇₈₉';
const unsup = (s) => parseInt(s.replace(/./gu, (c) => SUPS.indexOf(c)), 10);
const unsub = (s) => parseInt(s.replace(/./gu, (c) => SUBS.indexOf(c)), 10);

test('known atomic masses to the printed AME2020 digits: ¹²C = 12 exactly, ¹H, ²³⁸U, ⁴⁸Ca', () => {
    assert.equal(N.nuclide(6, 12).atomicMass, 12, '12C is the mass unit');
    assert.equal(N.nuclide(6, 12).estimated, false);
    assert.equal(N.nuclide(1, 1).atomicMass.toPrecision(12), '1.00782503190');
    assert.ok(Math.abs(N.nuclide(1, 1).atomicMass - 1.007825031898) < 1e-14);
    assert.equal(N.nuclide(92, 238).atomicMass.toPrecision(12), '238.050786936');
    assert.equal(N.nuclide(20, 48).atomicMass.toPrecision(11), '47.952522654');
    // the AME2012 values listed by NIST, 238.0507884(20) and 47.95252276(13), moved by 1.5 µu and 0.1 µu in AME2020
    // (AME2016 had 238.050786996 and 47.952522904, from the archived AME2016 file)
    assert.ok(Math.abs(N.nuclide(92, 238).atomicMass - 238.0507884) < 3e-6);
    assert.ok(Math.abs(N.nuclide(20, 48).atomicMass - 47.95252276) < 3e-7);
    assert.ok(Math.abs(N.nuclide(92, 238).atomicMass - 238.050786996) < 1e-7);
    assert.ok(Math.abs(N.nuclide(20, 48).atomicMass - 47.952522904) < 3e-7);
    assert.equal(N.nuclide(2, 4).atomicMass.toPrecision(12), '4.00260325413');
});

test('table: 3558 nuclides, Z 0–118, estimated flags, compact data file', () => {
    assert.equal(N.Z_MAX, 118);
    assert.equal(N.ELEMENTS[0], 'n'); assert.equal(N.ELEMENTS[1], 'H'); assert.equal(N.ELEMENTS[92], 'U'); assert.equal(N.ELEMENTS[118], 'Og');
    let n = 0;
    for (let z = 0; z <= N.Z_MAX; z++) { const as = N.isotopesOf(z); assert.ok(as.length > 0, `Z=${z}`); for (let k = 1; k < as.length; k++) assert.ok(as[k] > as[k - 1]); n += as.length; }
    assert.equal(n, 3558);
    assert.deepEqual(N.isotopesOf(1), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(N.nuclide(118, 295).estimated, true, 'Og-295 is from systematics');
    assert.equal(N.nuclide(92, 238).estimated, false);
    assert.equal(N.nuclide(92, 300), null); assert.equal(N.nuclide(119, 300), null); assert.equal(N.nuclide(1, 1.5), null);
    assert.equal(N.nuclide(0, 1).atomicMass.toPrecision(12), '1.00866491590', 'the neutron is in the table (Z = 0)');
    const size = statSync(new URL('../site/js/engine/data/nuclides.js', import.meta.url)).size;
    assert.ok(size < 120 * 1024, `data file ${size} bytes`);
});

test('nuclideMass = atomic mass − q·mₑ; the SPECIES table (AME2020 − mₑ) agrees to all its printed digits', () => {
    assert.equal(N.nuclideMass(92, 238, 35), N.nuclide(92, 238).atomicMass - 35 * ME_U);
    assert.equal(N.nuclideMass(1, 1, -1), N.nuclide(1, 1).atomicMass + ME_U, 'H⁻ gains an electron');
    assert.equal(N.nuclideMass(6, 12, 0), 12);
    assert.ok(Number.isNaN(N.nuclideMass(92, 300, 1)));
    let checked = 0;
    for (const s of SPECIES) {
        const m = s.isotope.match(/^([⁰¹²³⁴⁵⁶⁷⁸⁹]+)([A-Z][a-z]?)([₀-₉]+)?$/u);
        if (!m) continue;   // electron, proton
        const z = N.elementZ(m[2]), a = unsup(m[1]), k = m[3] ? unsub(m[3]) : 1;
        const mass = k * N.nuclide(z, a).atomicMass - ME_U;
        assert.ok(Math.abs(mass - s.mass) <= 1e-12 * s.mass, `${s.id}: ${s.mass} vs ${mass}`);
        checked++;
    }
    assert.equal(checked, 10);
});

test('labels: superscript mass number and charge state', () => {
    assert.equal(N.nuclideLabel(92, 238, 35), '²³⁸U³⁵⁺');
    assert.equal(N.nuclideLabel(1, 1, -1), '¹H⁻');
    assert.equal(N.nuclideLabel(2, 4, 2), '⁴He²⁺');
    assert.equal(N.nuclideLabel(8, 16, 1), '¹⁶O⁺');
    assert.equal(N.nuclideLabel(8, 16, 0), '¹⁶O');
    assert.equal(N.nuclideLabel(20, 48, 11), '⁴⁸Ca¹¹⁺');
    assert.equal(N.chargeSup(-2), '²⁻');
});

test('elements, default isotopes and the keV/u helper', () => {
    assert.equal(N.elementZ('U'), 92); assert.equal(N.elementZ('u'), 92); assert.equal(N.elementZ('ca'), 20); assert.equal(N.elementZ('Xx'), -1); assert.equal(N.elementZ(''), -1);
    assert.equal(N.defaultA(92), 238); assert.equal(N.defaultA(1), 1); assert.equal(N.defaultA(20), 40); assert.equal(N.defaultA(54), 132);
    assert.equal(N.defaultA(82), 208); assert.equal(N.defaultA(0), 0); assert.equal(N.defaultA(119), 0);
    for (let z = 1; z <= N.Z_MAX; z++) assert.ok(N.nuclide(z, N.defaultA(z)), `default isotope of Z=${z} exists`);
    // elements without a stable isotope default to the longest-lived nuclide with a MEASURED half-life (NUBASE2020 values
    // from systematics are skipped), so no element defaults to a nuclide that has never been observed
    assert.equal(N.defaultA(43), 97); assert.equal(N.defaultA(61), 145); assert.equal(N.defaultA(84), 209);
    assert.deepEqual([102, 104, 106, 109, 112, 113, 115, 118].map((z) => N.defaultA(z)), [259, 267, 269, 277, 285, 286, 290, 295]);
    // up to fermium (Z = 100) the default isotope's mass is measured; only transfermium defaults are from systematics
    for (let z = 1; z <= 100; z++) assert.equal(N.nuclide(z, N.defaultA(z)).estimated, false, `default isotope of Z=${z} has a measured mass`);
    assert.equal(N.totalEnergyFromPerNucleon(100, 238), 23.8e6);
    assert.equal(N.perNucleonFromTotal(23.8e6, 238), 100);
});

test('preset groups: every entry has a positive mass, a nonzero integer charge, a unique id and a label; SPECIES ids unchanged', () => {
    assert.deepEqual(N.PRESET_GROUPS.map((g) => g.id), ['light', 'gas', 'accel', 'molecular']);
    const ids = new Set();
    for (const g of N.PRESET_GROUPS) {
        assert.ok(g.title && g.entries.length > 0);
        for (const e of g.entries) {
            assert.ok(Number.isFinite(e.mass) && e.mass > 0, `${e.id} mass`);
            assert.ok(Number.isInteger(e.charge) && e.charge !== 0, `${e.id} charge`);
            assert.ok(typeof e.label === 'string' && e.label.length > 0 && typeof e.isotope === 'string');
            assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
            ids.add(e.id);
        }
    }
    // entries taken from SPECIES keep its id, label, mass and charge
    for (const s of SPECIES) { const e = N.presetById(s.id); if (e) assert.deepEqual([e.label, e.mass, e.charge], [s.label, s.mass, s.charge], s.id); }
    assert.deepEqual(SPECIES.map((s) => s.id), ['e-', 'H+', 'He+', 'C+', 'N+', 'O+', 'N2+', 'O2+', 'Ar+', 'Kr+', 'Xe+', 'C60+']);
    // the accelerator group lists only sourced charge states: every entry carries a note naming its reference
    const accel = N.PRESET_GROUPS.find((g) => g.id === 'accel');
    for (const e of accel.entries) assert.match(e.note, /et al\./, `${e.id} note`);
    // notes name the paper, not the laboratory: a capitalized word in a note is an author followed by "et al.", an
    // element symbol, or one of a few units and acronyms
    const ALLOWED = new Set(['CODATA', 'ECR', 'ECRIS', 'FIB', 'GHz', 'HB2021', 'LMIS', 'MeV']);
    const capitalized = (note) => [...note.matchAll(/(?<![\p{L}\p{N}])[A-Z][\p{L}\p{N}-]*/gu)]
        .filter((m) => !note.slice(m.index + m[0].length).startsWith(' et al.'))
        .map((m) => m[0]).filter((w) => !ALLOWED.has(w) && !/^[A-Z][a-z]?[\p{No}₀-₉]*$/u.test(w));
    assert.deepEqual(capitalized('a beam from the Somewhere Lab source (Smith et al. 2020), 28 GHz ECR, U³³⁺ and H₂'), ['Somewhere', 'Lab'], 'the check sees names');
    for (const g of N.PRESET_GROUPS) for (const e of g.entries) assert.deepEqual(capitalized(e.note || ''), [], `${e.id} note`);
    assert.equal(N.PRESET_GROUPS.flatMap((g) => g.entries).filter((e) => e.id === 'O2+').length, 1, 'O₂⁺ is listed once');
    assert.ok(accel.entries.some((e) => e.label === '²³⁸U³³⁺') && accel.entries.some((e) => e.label === '²³⁸U³⁴⁺') && accel.entries.some((e) => e.label === '⁴⁸Ca¹¹⁺'));
    // light ions
    const light = N.PRESET_GROUPS.find((g) => g.id === 'light');
    const hm = light.entries.find((e) => e.label === '¹H⁻');
    assert.equal(hm.mass, N.nuclide(1, 1).atomicMass + ME_U); assert.equal(hm.charge, -1);
    const alpha = light.entries.find((e) => e.label.startsWith('⁴He²⁺'));
    assert.equal(alpha.charge, 2); assert.ok(Math.abs(alpha.mass - (4.00260325413 - 2 * ME_U)) < 1e-11);
    // molecular ions
    const mol = N.PRESET_GROUPS.find((g) => g.id === 'molecular');
    assert.ok(Math.abs(N.presetById('H3+').mass - (3 * 1.007825031898 - ME_U)) < 1e-11);
    assert.ok(Math.abs(N.presetById('CO2+').mass - (12 + 2 * 15.99491461926 - ME_U)) < 1e-10);
    assert.ok(mol.entries.some((e) => e.id === 'C60+'));
    assert.equal(N.presetById('nope'), null);
});
