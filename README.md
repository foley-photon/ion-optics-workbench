# Ion Optics Workbench

A simulator for electrostatic and magnetic charged-particle optics that runs in the browser at
**https://cdfoley.com/beta/ion-optics/**. You draw electrodes on a two-dimensional planar or cylindrically symmetric
grid, it solves for the potential, and it traces ions and electrons through lenses, mirrors, energy analyzers,
time-of-flight spectrometers, RF devices and magnetic fields. This repository is its source: the page, its help page,
the validation suite that checks it against published and exact values, and the tests.

I wrote it for the questions that come up when a beam line or a spectrometer is being designed or debugged. Where
does this einzel lens put its waist at 850 V, and how much of that is spherical aberration? What does a 0.1 D gap do
to the focal length of a two-tube lens? How long is the flight time of m/z 100 through this reflectron, and what
resolving power does the energy spread allow? Which charge states of uranium make it through a 90° magnet at this
field? I wanted to ask them while dragging a voltage slider, and to see next to each answer how far to trust it.

It is still a beta, and search engines do not index the page. The help page
(https://cdfoley.com/beta/ion-optics/help/) explains the units, the geometry rules, the numerical methods and the
validation suite in full.

## What it does

- **Geometry and fields.** Boxes, tubes, plates, discs, circles, annuli, polygons, zero-thickness lines and quadrics,
  painted in order on a planar (infinitely long in z) or cylindrically symmetric grid; meshes with a transmission;
  mirror and anti-mirror planes; domain edges held at a voltage, open, on the axis or following a profile. Each
  electrode's field is solved once at 1 V, so a voltage change, a waveform or a parameter that only sets voltages
  needs no new solve. An optional charge density turns Laplace's equation into Poisson's. Ideal analytic fields
  (uniform, quadrupole, coaxial, spherical) can be added on top.
- **Magnetic fields.** Uniform fields, hard-edged field regions, circular current loops and iron pole pieces (a
  magnetic scalar potential solved like the electric one).
- **Particles.** Electrons and ions, relativistic by default, from sampled sources (positions, directions, energies,
  start times, RF phases) or explicit lists. 34 preset species, including heavy-ion beams in charge states reported
  in ECR ion-source and linac commissioning papers, and a nuclide builder for any isotope of the AME2020 table in any
  charge state, with a keV/u helper.
- **Results.** Transmission, hits, waists per species, spot sizes, phase space and emittance on recording planes and
  spheres, time-of-flight peaks with resolving power, lens focal points and principal planes, potential and field
  profiles, electrode charges, the capacitance matrix, multipole coefficients, induced charge and current, scans and
  tuning, and side-by-side comparison of pinned runs. Every table and plot exports to CSV.
- **Physics plug-ins.** Space-charge onset by direct summation of the pair forces (up to 2,000 particles; an
  estimate, not a self-consistent solution), elastic hard-sphere collisions with a background gas, and Stokes drag
  from an ion mobility.
- **Presets.** Einzel lens, two-tube immersion lens, two-aperture lens, parallel-plate mirror, 127° cylindrical
  deflector, hemispherical analyzer, reflectron TOF, RF quadrupole mass filter, Paul trap, 90° magnetic sector and a
  velocity-map imaging lens, each with a note, a suggestion to try and its own checked expectations.
- **Benchmarks tab.** The validation suite described below, run in the browser.

Everything runs in the browser: nothing is uploaded, and work is saved in the browser's local storage. A share link
carries the whole project after the `#` of the address.

## The physics in brief

- Units are mm, µs, V, V/mm, T, u, e (signed) and eV (total kinetic energy, not per charge). Constants are the
  CODATA 2022 values; derived ones are computed from them at load time.
- The potential obeys ∇²φ = 0, or ∇²φ = −ρ/ε₀ with a charge density, discretized by finite differences on a square
  grid. Where a grid line meets an electrode between nodes the difference formula uses the true distance to the
  surface (Shortley and Weller, 1938), so curved and oblique electrodes are second-order accurate and a plate thinner
  than a cell still blocks the field. The solver is geometric multigrid, with every coarse level built from the exact
  geometry, falling back to multigrid-preconditioned BiCGSTAB and then to adaptive SOR. Each basis field is solved to
  an estimated error below 1e-10 V per volt.
- Away from electrodes the potential between nodes is a bicubic Hermite surface and the force is its exact gradient,
  so energy is conserved to the precision of the integrator. In cells cut by an electrode the field is interpolated
  from the nodes on the particle's own side only.
- Particles follow the relativistic Lorentz-force equations for the proper velocity w = γv. The default integrator is
  the adaptive Dormand-Prince 5(4) method with Hairer's continuous output, which also locates hits and plane
  crossings inside a step. In magnetic fields without an electric field the relativistic Boris push with the exact
  rotation angle is used; with both fields the adaptive method stays in charge, because Boris with the exact angle
  makes the E×B drift too slow by θ²/12.
- An ion of charge state q has the mass M_atom − q·mₑ from the AME2020 table. The binding energy of the removed
  electrons is left out: ¹H⁺ comes out 13.6 eV lighter than the proton and ⁴He²⁺ 79 eV lighter than the α particle,
  a few parts in 10⁸, and for uranium even the bare nucleus is off by only 3.4e-6.
- Mobility: K = K₀ (760 Torr/p)(T/273.15 K), and the drag time constant τ = Km/|q|.

## Validation

The suite in `site/js/engine/bench/` has 56 gates, 6 informational comparisons and 2 planned cases. Each case builds
its own project and runs through the same code as any user project; each check compares one number with a published
value or an exact formula, with the source named next to it. All 56 gates pass in Node at the quick level (about 15 s)
and at the full level (finer grids, about 50 s), and every check value equals the golden file
`tests/fixtures/wp5/bench-golden.json`. In the browser the quick level takes a few seconds. Some of what it covers:

- Field solver: coaxial cylinders and concentric spheres against their logarithmic and 1/r potentials (S1, S2, S10),
  the axial potential of two tubes against the tables of Natali, Di Chio and Kuyatt (1972) (S3, S4), second-order
  convergence on curved boundaries, exact reproduction of harmonic quadratics, superposition, agreement between the
  three solvers, tilted plates, a mesh-refinement study of the einzel waist, and the Poisson term against a charged
  sphere and a sinusoidal charge (S13). Capacitance from the field flux matches 2πε₀/ln(b/a) and 4πε₀/(1/R₁ − 1/R₂)
  to 1e-4 (P4).
- Lenses: the focal properties of two-tube and einzel lenses against exact paraxial properties from the Bessel-series
  axial potential (L1, L2), the deep-gap two-tube lens against DiChio, Natali and Kuyatt (1974) (L3), the
  Lagrange-Helmholtz relation (L4), the aperture lens against the exact potential of a hole in a plate (L7), Newton's
  lens equation (L8) and the weak-lens integral (L9). Two informational cases compare with tables whose geometry is
  not fully known: the einzel lens of Adams and Read (L5, within ±2 %) and the two-aperture lens of Harting and Read
  (L6, 3.5 to 7 % above the table, an offset an independent solver reproduces for the same geometry).
- Trajectories: transit, drift, gyration (also relativistic, with an electron at γ = 2), magnetic sector imaging by
  Barber's rule, RF and pulsed fields, the parallel-plate mirror, the Wiley-McLaren space focus and the Mamyrin
  energy focus (T3, T4), energy conservation to 2e-6 and time reversal through an einzel lens (T5, T6), the 127° and
  180° analyzers (T7, T8), Kepler orbits in a spherical capacitor (T8b), quadrupole and Paul-trap stability (T9 to
  T12, T17, T18), orbits in a logarithmic field (T20) and induced currents (T19).
- Drag and gas: mobility-limited drift and the K₀ conversion (D1, D2), the hard-sphere mean free path (I4).

### Review for this release

Before the first release I checked the physics again, independently of the suite, in `tests/physics-review.test.mjs`.
It types the CODATA 2022 constants in itself and recomputes from closed forms the reference values of cases K1, K2,
K3, K3d, K6, K6b, K7, K9, S1 to S3, T1, T7, T11 to T13, T16, T19, T20, D1, D2, P2 and P4, checks relativistic
kinematics from 1 eV to 10 MeV, measures the order of the reference integrators (RK4 fourth, Dormand-Prince fifth),
shows that the reference Boris push in `integrate.js` keeps the speed of a relativistic electron to rounding over
ten turns, traces a 1 MeV electron through the tracer's own Boris path (the one the automatic choice takes for long
runs in a magnetic field) against the relativistic radius and period, traces circular orbits in an ideal spherical
field to show the error falling as the tolerance tightens (and energy conserved to 1e-9 at rtol 1e-10), traces a
single-field time-of-flight source against the closed form and finds the Wiley-McLaren space focus at a drift of
2s, and checks unit factors, ion masses in any charge state, mobility, E/N and the hard-sphere mobility, the numbers
of the hemisphere preset and figures stated in the help page.

It found no error in the engine. It turned up two things in the validation suite that I corrected in this release.
Case L7 starts its rays parallel at x = −9.8 mm, and for those the exact hole potential gives a focal length of
81.63 mm; the 81.62 mm it printed before is the value for rays started at −5 mm. The note of case K2 called its mass
1.00782503223 u the ¹H atom of AME2020, but that is the AME2012 value; AME2020 gives 1.007825031898 u, and the
difference shows in no printed digit of K2. Two more things are worth knowing, and neither changes a result:

- At z/D = 0.1 and 0.6 the NBS table of the two-tube potential (S3) is one unit below the correctly rounded Bessel
  series (0.3705995 printed 0.370599, 0.0440095 printed 0.044009); the other eight values agree. The gate's
  tolerance is 1.5e-4, so this does not matter; the review test allows the table one unit in its last digit.
- The species preset H⁺ uses the CODATA proton mass, while ¹H⁺ from the nuclide builder is 13.6 eV lighter (the
  binding-energy approximation above). The two masses differ by 1.5 parts in 10⁸.

The checks show that the simulator solves the equations it says it solves, to the accuracy it reports. They cannot
show that a two-dimensional model is the right one for your device: read the Limitations section of the help page.

## Running the tests

Node 22 or later, no packages to install:

```sh
node --test "tests/*.test.mjs"
```

553 tests (2 of them, the planned cases P1 and P3, are skipped) take about 40 s. The files named `wpN-*.test.mjs` are
grouped by the work package in which that part of the tool was built:

- `wp1`: geometry, rasterizing with exact sub-grid cuts, the finite-difference operator, the solvers and the field.
- `wp2`: constants, particle sources and the counter-based random numbers, the field model, the integrators, the
  tracer, magnets, waveforms and the analysis of results.
- `wp3`: the project schema, expressions, hashing and caching, file and link input and output, the job pipeline and
  the web worker (run under `node:worker_threads` through `tests/worker-shim.mjs`).
- `wp4`: units, forms, contours and color maps.
- `wp5`: the validation suite (every case at the quick level), exact solutions, lens properties and the optimizer.
- `wp6`: the presets and their expectations.
- `wp7`: the nuclide table and the species presets. `wp8` to `wp10`: field analysis, sources, comparison, visuals
  and the fixes of later review passes.

And three that came with this repository:

- `physics-review.test.mjs`: the independent checks described above.
- `selftest.test.mjs`: the page check and the suite pass on the page, and the page check catches broken copies (a
  missing module, a name that is not exported, a module that does not parse, a missing stylesheet or lazy module).
- `repository.test.mjs`: one version in package.json, CITATION.cff and CHANGELOG.md, and no local paths or e-mail
  addresses in any file.

Some comments in the code and the tests cite sections of my design notes ("spec
§2.2", "benchmark plan §2.1") or a work-package step; those notes are not published, and the code, the help page
and this README say what the tests check without them.

The page check and the validation suite also run alone, which is what the site's sync job does with each release:

```sh
node scripts/selftest.mjs                 # site/ at the quick level
node scripts/selftest.mjs site --level full
```

By hand, not part of `node --test`:

- `node tests/bench.mjs [--level quick|full] [--only K1,S3] [--verbose] [--update-golden]` prints the suite as a
  table and compares every check value with the golden file.
- `node tests/wp1-perf.mjs`, `tests/wp2-perf.mjs`, `tests/wp3-perf.mjs`: timing budgets of the solver, the tracer
  and the pipeline.
- `node tests/wp7-nuclides-browser.mjs`: drives the nuclide form in headless Microsoft Edge through the DevTools
  protocol (set `EDGE` to use another Chromium build) and saves two screenshots.

## Preview locally

```sh
node scripts/serve.mjs
```

and open http://127.0.0.1:8000/beta/ion-optics/. The page takes its header, footer, font, stylesheet and the 1D
chart script from the main site (`/assets/...`); the preview fetches those from https://cdfoley.com on first use.
With `--offline` it serves no shared files: the header, footer, web font and 1D charts are missing (their tables
show instead) and everything else works. Links to other pages of the site are sent on to https://cdfoley.com.
`--port` picks another port.

## Repository layout

```
site/                what cdfoley.com serves at /beta/ion-optics/
  index.html         the simulator
  help/index.html    help, methods, the validation table and the references
  css/               app.css, results.css, presets.css
  js/engine/         geometry, solver, field, tracer, analysis, schema, file formats (no DOM)
  js/engine/bench/   the validation suite: cases.js and the reference values in targets.js
  js/engine/data/    the AME2020 nuclide table
  js/presets/        the eleven presets
  js/ui/             the page: panels, views, plots, jobs and the worker pool
  js/workers/        the engine worker
  package.json       marks the modules as ES modules for Node; browsers ignore it
scripts/
  selftest.mjs       the page check and the validation suite in Node
  serve.mjs          local preview
  build_nuclides.py  writes site/js/engine/data/nuclides.js from the AME2020 and NUBASE2020 files
tests/               Node tests, by-hand benchmark and timing scripts, and their fixtures
.github/workflows/   test.yml (every push and pull request)
```

## The nuclide table

`site/js/engine/data/nuclides.js` is written by `scripts/build_nuclides.py` (Python 3, standard library only) from
`mass_1.mas20.txt` and `nubase_4.mas20.txt` of the IAEA Atomic Mass Data Center, retrieved 2026-11-08 (SHA-256
`e8599c6d7f724fac91934e59f1b9de8fb8f63e820f4b39456b790665ed2a3307` and
`1585a5eea86c5e17e90307c7e6e786d060049c4039e392a261ff6db977df9859`). The two input files are not part of this
repository. Every row is read twice, by column and by whitespace, and the readings must agree.

```sh
python scripts/build_nuclides.py <folder with the two files> <folder for the CSV files> site/js/engine/data/nuclides.js
```

## Versions

Releases are tagged vX.Y.Z and continue the version numbers the page carried on the site; the first release of this
repository is v0.2.4. The engine version in `site/js/engine/version.js` is separate: it changes only when the
numerics or the data layouts change, because it is part of every cache key, of saved projects and of the worker
handshake. Each CHANGELOG entry names it. The site copies the latest release once a day (the `sync-tool-repos`
workflow in the site's repository): it runs the release's Node tests first and `scripts/selftest.mjs` on the copied
folder, and publishes only if both pass.

## Citation

`CITATION.cff` has the entry for the tool, and GitHub shows it under "Cite this repository". If the ion masses
matter to your result, cite the AME2020 evaluation as well (the references are in CITATION.cff and NOTICE.md). The
methods and every reference value are cited on the help page.

## License

The code is MIT-licensed (LICENSE). The AME2020 and NUBASE2020 data, the CODATA constants, the published color maps
and the literature values used as references keep their own terms and citations; see NOTICE.md. The Ion Optics
Workbench is independent software written from the open literature, not affiliated with any commercial ion-optics
package.

Found a wrong number or a bug? Please open an issue.
