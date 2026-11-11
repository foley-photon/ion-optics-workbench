#!/usr/bin/env python3
"""Parse the AME2020 atomic-mass table (mass_1.mas20.txt) and the NUBASE2020 table
(nubase_4.mas20.txt) into clean CSVs and the compact JavaScript nuclide table used by
the Ion Optics Workbench.

    python -I scripts/build_nuclides.py raw clean [path/to/nuclides.js]

Standard library only. The fixed-width AME format is taken from the file header:
    a1,i3,i5,i5,i5,1x,a3,a4,1x,f14.6,f12.6,f13.5,1x,f10.5,1x,a2,f13.5,f11.5,1x,i3,1x,f13.6,f12.6
    cc NZ  N  Z  A    el  o     mass  unc binding unc      B  beta  unc    atomic_mass   unc
A '#' in place of the decimal point marks an estimated (non-experimental) value; '*' marks a
quantity that cannot be calculated. The atomic mass is printed as an integer part (u) followed
by the remaining micro-u, e.g. "238 050786.936" = 238.050786936 u.

Every row is parsed twice (by column slices and by whitespace splitting) and the two readings
must agree, so a misaligned column cannot pass silently.
"""
import csv
import os
import re
import sys
from decimal import Decimal

# ---------------------------------------------------------------- AME2020 mass table

# 1-based inclusive column ranges from the Fortran format
COLS = {
    'cc': (1, 1), 'NZ': (2, 4), 'N': (5, 9), 'Z': (10, 14), 'A': (15, 19), 'el': (21, 23), 'o': (24, 27),
    'mass': (29, 42), 'mass_unc': (43, 54), 'binding': (55, 67), 'binding_unc': (69, 78), 'B': (80, 81),
    'beta': (82, 94), 'beta_unc': (95, 105), 'am_int': (107, 109), 'am_frac': (111, 123), 'am_unc': (124, 135),
}


def field(line, key):
    a, b = COLS[key]
    return line[a - 1:b].strip()


def num(text):
    """(Decimal value or None, estimated flag) from an AME field; '#' replaces the decimal point of estimates."""
    t = text.strip()
    if not t or t == '*':
        return None, False
    est = '#' in t
    t = t.replace('#', '.')
    if t.endswith('.'):
        t = t[:-1]
    return Decimal(t), est


def parse_mass_table(path):
    rows = []
    with open(path, encoding='ascii', errors='strict') as f:
        lines = f.read().split('\n')
    # data rows start after the column header block; they have an integer A in columns 15-19 and a symbol in 21-23
    started = False
    for raw in lines:
        line = raw.rstrip('\r')
        if not started:
            if line.startswith('1N-Z'):
                started = True
            continue
        if not line.strip() or line.startswith('1N-Z') or '(keV)' in line:
            continue
        line = line.ljust(140)
        try:
            n = int(field(line, 'N')); z = int(field(line, 'Z')); a = int(field(line, 'A'))
        except ValueError:
            raise SystemExit(f'unexpected line: {line!r}')
        el = field(line, 'el')
        if a != n + z:
            raise SystemExit(f'A != N + Z on line: {line!r}')
        am_int = int(field(line, 'am_int'))
        am_frac, est = num(field(line, 'am_frac'))
        am_unc, est_u = num(field(line, 'am_unc'))
        mass_exc, est_me = num(field(line, 'mass'))
        mass_exc_unc, _ = num(field(line, 'mass_unc'))
        if am_frac is None or am_unc is None:
            raise SystemExit(f'no atomic mass on line: {line!r}')
        if est != est_u or est != est_me:
            raise SystemExit(f'inconsistent # flags on line: {line!r}')
        atomic_mass_u = Decimal(am_int) + am_frac / Decimal(1000000)
        # cross-check by whitespace splitting: the last three tokens are am_int, am_frac, am_unc
        toks = line.split()
        if toks[-3].replace('#', '') != str(am_int) or toks[-2].replace('#', '.') != field(line, 'am_frac').replace('#', '.'):
            raise SystemExit(f'column/token mismatch on line: {line!r}')
        if el == '' or not re.fullmatch(r'[A-Z][a-z]?|n', el):
            raise SystemExit(f'bad element symbol {el!r} on line: {line!r}')
        rows.append({
            'Z': z, 'N': n, 'A': a, 'symbol': el,
            'atomic_mass_u': atomic_mass_u, 'atomic_mass_unc_u': am_unc / Decimal(1000000),
            'mass_excess_keV': mass_exc, 'mass_excess_unc_keV': mass_exc_unc,
            'estimated': 1 if est else 0,
            # micro-u relative to A (the quantity the JS table stores), as printed, sign included
            'delta_microu': (atomic_mass_u - Decimal(a)) * Decimal(1000000),
        })
    return rows


# ---------------------------------------------------------------- NUBASE2020 (ground states: abundance, half-life)

HALF_LIFE_UNITS = {
    'ys': Decimal('1e-24'), 'zs': Decimal('1e-21'), 'as': Decimal('1e-18'), 'fs': Decimal('1e-15'), 'ps': Decimal('1e-12'),
    'ns': Decimal('1e-9'), 'us': Decimal('1e-6'), 'ms': Decimal('1e-3'), 's': Decimal(1), 'm': Decimal(60), 'h': Decimal(3600),
    'd': Decimal(86400), 'y': Decimal('31556926'), 'ky': Decimal('31556926e3'), 'My': Decimal('31556926e6'), 'Gy': Decimal('31556926e9'),
    'Ty': Decimal('31556926e12'), 'Py': Decimal('31556926e15'), 'Ey': Decimal('31556926e18'), 'Zy': Decimal('31556926e21'), 'Yy': Decimal('31556926e24'),
}


def parse_nubase(path):
    """Ground states only: {(Z, A): {'symbol', 'half_life_s' (Decimal | 'stable' | 'p-unst' | None), 'half_life_unc_s',
    'abundance_pct', 'estimated_half_life', 'half_life_limit'}}."""
    out = {}
    with open(path, encoding='ascii', errors='strict') as f:
        for raw in f:
            line = raw.rstrip('\r\n')
            if not line or line.startswith('#'):
                continue
            line = line.ljust(210)
            a = int(line[0:3]); zzzi = line[4:8]
            z = int(zzzi[:3]); i = int(zzzi[3])
            if i != 0:
                continue
            ael = line[11:16].strip()
            m = re.fullmatch(r'(\d+)([A-Za-z]+)', ael)
            if not m or int(m.group(1)) != a:
                raise SystemExit(f'bad A El field {ael!r}: {line!r}')
            sym = m.group(2)
            t = line[69:78].strip(); unit = line[78:80].strip(); dt = line[81:88].strip()
            half = None
            unc = None
            if t == 'stbl':
                half = 'stable'
            elif t == 'p-unst':
                half = 'p-unst'
            elif t:
                # limits such as '>1' or '<0.1' are taken at their bound; '#' marks a value from systematics
                tv = Decimal(re.sub(r'[<>~#]', '', t))
                if unit not in HALF_LIFE_UNITS:
                    raise SystemExit(f'unknown half-life unit {unit!r}: {line!r}')
                half = tv * HALF_LIFE_UNITS[unit]
                # dT is numeric in the unit of T; it holds a limit with its own unit (">1.3Ey") for stable nuclides
                if re.fullmatch(r'[0-9.]+', dt):
                    unc = Decimal(dt) * HALF_LIFE_UNITS[unit]
            br = line[119:209]
            ab = None
            mi = re.search(r'IS=([0-9.]+)', br)
            if mi:
                ab = Decimal(mi.group(1))
            # a '#' marks a half-life from systematics (the nuclide has not been observed); '<' and '>' mark limits
            out[(z, a)] = {'symbol': sym, 'half_life_s': half, 'half_life_unc_s': unc, 'abundance_pct': ab,
                           'estimated_half_life': bool(t and '#' in t), 'half_life_limit': bool(t and t[0] in '<>')}
    return out


# ---------------------------------------------------------------- outputs

def fmt_dec(d):
    if d is None:
        return ''
    s = format(d, 'f')
    return s


def main(raw_dir, clean_dir, js_path=None):
    mass_rows = parse_mass_table(os.path.join(raw_dir, 'mass_1.mas20.txt'))
    nub = parse_nubase(os.path.join(raw_dir, 'nubase_4.mas20.txt'))
    os.makedirs(clean_dir, exist_ok=True)

    # sanity checks against values printed in the published tables
    by = {(r['Z'], r['A']): r for r in mass_rows}
    assert by[(6, 12)]['atomic_mass_u'] == Decimal(12), by[(6, 12)]
    assert by[(1, 1)]['atomic_mass_u'] == Decimal('1.007825031898'), by[(1, 1)]
    assert by[(92, 238)]['atomic_mass_u'] == Decimal('238.050786936'), by[(92, 238)]
    assert by[(20, 48)]['atomic_mass_u'] == Decimal('47.952522654'), by[(20, 48)]
    assert by[(0, 1)]['symbol'] == 'n'
    assert len(mass_rows) == 3558, len(mass_rows)

    with open(os.path.join(clean_dir, 'ame2020-atomic-masses.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['Z', 'N', 'A', 'symbol', 'atomic_mass_u', 'atomic_mass_unc_u', 'mass_excess_keV', 'mass_excess_unc_keV', 'estimated'])
        for r in mass_rows:
            w.writerow([r['Z'], r['N'], r['A'], r['symbol'], fmt_dec(r['atomic_mass_u']), fmt_dec(r['atomic_mass_unc_u']),
                        fmt_dec(r['mass_excess_keV']), fmt_dec(r['mass_excess_unc_keV']), r['estimated']])

    with open(os.path.join(clean_dir, 'nubase2020-ground-states.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['Z', 'A', 'symbol', 'half_life_s', 'half_life_unc_s', 'half_life_estimated', 'half_life_limit', 'isotopic_abundance_pct'])
        for (z, a), v in sorted(nub.items()):
            hl = v['half_life_s']
            w.writerow([z, a, v['symbol'], hl if isinstance(hl, str) else fmt_dec(hl) if hl is not None else '',
                        fmt_dec(v['half_life_unc_s']), 1 if v['estimated_half_life'] else 0, 1 if v['half_life_limit'] else 0,
                        fmt_dec(v['abundance_pct'])])

    # element symbols by Z (from the mass table; Z = 0 is the neutron)
    symbols = {}
    for r in mass_rows:
        symbols.setdefault(r['Z'], r['symbol'])
        if symbols[r['Z']] != r['symbol']:
            raise SystemExit(f'two symbols for Z={r["Z"]}')
    zmax = max(symbols)
    assert sorted(symbols) == list(range(0, zmax + 1)), 'gap in Z'

    # default isotope per element: the most abundant (NUBASE IS), else the longest-lived ground state in the mass table
    # whose half-life has been measured (NUBASE values from systematics, '#', and limits, '<' or '>', are skipped, so an
    # element never defaults to a nuclide that has not been observed); ties go to the smaller uncertainty, then the lower A
    defaults = []
    for z in range(1, zmax + 1):
        cands = [(a, nub.get((z, a))) for (zz, a) in by if zz == z]
        with_ab = [(v['abundance_pct'], a) for a, v in cands if v and v['abundance_pct'] is not None]
        if with_ab:
            ab, a = max(with_ab)
            defaults.append((z, symbols[z], a, 'most abundant', fmt_dec(ab)))
            continue
        lived = []
        for a, v in cands:
            if not v:
                continue
            hl = v['half_life_s']
            if hl == 'stable':
                lived.append((Decimal('Infinity'), Decimal(0), -a))
            elif isinstance(hl, Decimal) and not v['estimated_half_life'] and not v['half_life_limit']:
                unc = v['half_life_unc_s'] if v['half_life_unc_s'] is not None else Decimal('Infinity')
                lived.append((hl, -unc, -a))
        if not lived:
            raise SystemExit(f'no measured half-life for Z={z}')
        hl, neg_unc, neg_a = max(lived)
        a = -neg_a
        defaults.append((z, symbols[z], a, 'longest-lived (measured)', fmt_dec(hl) + ' s'))
    with open(os.path.join(clean_dir, 'default-isotope.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['Z', 'symbol', 'A', 'reason', 'value'])
        for row in defaults:
            w.writerow(row)

    if js_path:
        write_js(js_path, mass_rows, symbols, defaults)


def write_js(js_path, mass_rows, symbols, defaults):
    """Compact table: one string per element, "A0:d0,d1,..." where d_k is the atomic mass minus A in micro-u, as printed
    (a trailing '#' marks an estimated value) and consecutive entries step A by one; "A=d" restarts the count after a gap."""
    zmax = max(symbols)
    per_z = {}
    for r in mass_rows:
        per_z.setdefault(r['Z'], []).append(r)
    parts = []
    for z in range(0, zmax + 1):
        rows = sorted(per_z[z], key=lambda r: r['A'])
        toks = []
        prev = None
        for r in rows:
            d = format(r['delta_microu'].normalize(), 'f')
            if d == '-0':
                d = '0'
            if r['estimated']:
                d += '#'
            if prev is not None and r['A'] == prev + 1:
                toks.append(d)
            else:
                toks.append(f'{r["A"]}={d}')
            prev = r['A']
        parts.append(','.join(toks))
    sym_list = [symbols[z] for z in range(0, zmax + 1)]
    default_a = [0] + [a for (_, _, a, _, _) in defaults]
    out = []
    out.append('/* ==========================================================================')
    out.append('   Ion optics engine: data/nuclides.js (written by a script; do not edit by hand)')
    out.append('   AME2020 atomic masses of all 3558 nuclides, Z = 0 (neutron) to 118, built by')
    out.append('   scripts/build_nuclides.py from mass_1.mas20.txt as served')
    out.append('   by the IAEA Atomic Mass Data Center (https://www-nds.iaea.org/amdc/ame2020/).')
    out.append('')
    out.append('   W. J. Huang, M. Wang, F. G. Kondev, G. Audi and S. Naimi, "The AME 2020 atomic')
    out.append('   mass evaluation (I)", Chin. Phys. C 45, 030002 (2021), doi:10.1088/1674-1137/abddb0;')
    out.append('   M. Wang, W. J. Huang, F. G. Kondev, G. Audi and S. Naimi, "The AME 2020 atomic mass')
    out.append('   evaluation (II)", Chin. Phys. C 45, 030003 (2021), doi:10.1088/1674-1137/abddaf.')
    out.append('   Default isotopes (most abundant, else the longest-lived one with a measured half-life)')
    out.append('   come from NUBASE2020: F. G. Kondev, M. Wang, W. J. Huang, S. Naimi and G. Audi,')
    out.append('   Chin. Phys. C 45, 030001 (2021).')
    out.append('')
    out.append('   Encoding: TABLE[Z] lists the nuclides of element Z in order of A as "A0=d0,d1,d2,...";')
    out.append('   d is the atomic mass minus A in micro-u exactly as printed by AME2020 (a trailing #')
    out.append('   marks an estimated, non-experimental value); each entry without "A=" is the next')
    out.append('   mass number. Decoded by engine/nuclides.js: mass (u) = A + d * 1e-6.')
    out.append('   ========================================================================== */')
    out.append('')
    out.append('/** Element symbols by Z (index 0 is the neutron). */')
    out.append('export const SYMBOLS = ' + repr(sym_list).replace("'", '"') + ';')
    out.append('')
    out.append('/** Default mass number by Z: the most abundant isotope, else the longest-lived one with a measured half-life (0 for the neutron). */')
    out.append('export const DEFAULT_A = ' + repr(default_a) + ';')
    out.append('')
    out.append('/** Atomic masses by Z (see the header for the encoding). */')
    out.append('export const TABLE = [')
    for z, p in enumerate(parts):
        out.append(f'    /* {z:3d} {sym_list[z]:2s} */ "{p}",')
    out.append('];')
    out.append('')
    text = '\n'.join(out) + '\n'
    os.makedirs(os.path.dirname(js_path), exist_ok=True)
    with open(js_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print(f'{js_path}: {len(text.encode("utf-8"))} bytes, {len(mass_rows)} nuclides, Z up to {zmax}')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
