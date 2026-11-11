# Changelog

Versions follow semantic versioning. The release version is the version of the tool. The engine version in
`site/js/engine/version.js` changes only when the numerics or the typed-array layouts change, because it is part of
every cache key and of the worker handshake; each entry names it. cdfoley.com picks up the latest release once a day.

## 0.2.4 - 2026-11-11

First release as its own repository. It continues the version numbers the page has carried on the site, where 0.2.3
has been served since 2026-11-08. The engine is unchanged: engine version 0.2.3, and every value of the validation
suite equal to the golden file.

- Page: a "Source code" line in the About section, linking this repository and its issues, and saying that the
  AME2020 masses and the published reference values keep their own terms.
- Validation suite, reference values: the L7 reference focal length is 81.63 mm, for rays started parallel at
  x = −9.8 mm as the case starts them (it was 81.62 mm, the value for rays started at −5 mm); the engine's deviation
  is now −2.7e-4 against the tolerance of 2e-3. The K2 note names its ¹H mass as the AME2012 value. The S3 note says
  that the NBS table agrees with the Bessel series to one unit in its last digit. Notes that called the Paul trap by
  an internal preset number now name case T12, and a leftover "promoted in round 2" is gone from four notes.
- Presets: the O⁺ of the velocity-map imaging preset has the mass 15.994366 u, the ¹⁶O atom less one electron, as
  every other ion has (it was 15.995 u, the atom). The ring radii do not depend on the mass, and the preset's
  expectations are unchanged. Comments corrected in the einzel preset (the center tube is 0.4 D long; 0.5 D is the
  distance between the gap centers) and the quadrupole preset (m/z 90 and 110 grow ×100 in about 7.3 and 12.8 RF
  cycles).
- Text: the help page no longer says the page is unlisted; the Compare tab says "Recomputing" while it reruns pinned
  runs and "recomputed" when done, as the help page does; plainer wording for the rms-based resolving power; the
  CODATA 2022 citation is Mohr, Newell, Taylor and Tiesinga, Rev. Mod. Phys. 97, 025002 (2025). Comments that named
  local folders now name `scripts/build_nuclides.py` and `tests/`.
- `scripts/build_nuclides.py`, the script that writes the AME2020 nuclide table, now lives here. Run on the archived
  AME2020 and NUBASE2020 files it rebuilds `site/js/engine/data/nuclides.js` byte for byte.
- Tests moved here from the site's repository (paths adapted and some comments reworded; the check that preset notes name no
  laboratory needs no list of names; and the browser check of the nuclide form starts the local preview), plus
  `tests/physics-review.test.mjs`: independent checks of the constants, of the closed-form reference values of the
  validation suite, of relativistic kinematics, of the integrators' order, of the tracer's step-size convergence,
  energy conservation and relativistic Boris path, of time of flight and the Wiley-McLaren space focus, of unit
  factors, ion masses in any charge state and mobility conversions, and of numbers stated in the help page and the
  hemisphere preset.
- `scripts/selftest.mjs`: the page check (every module loads with its imports resolved, the pages name files that
  exist) and the validation suite at the quick level, as a gate for the site's daily copy. `tests/selftest.test.mjs`
  shows that it catches broken copies of the page.
- Local preview: `scripts/serve.mjs`.

## Earlier versions, on the site only

### 0.2.3 - 2026-11-08 (engine 0.2.3)

- 34 preset species in four groups, including heavy-ion beams in charge states from ECR ion-source and linac
  commissioning papers, and a "Build a nuclide" form: any isotope of the AME2020 table in any charge state, with a
  keV/u helper.
- Ar, Kr and Xe species masses corrected to AME2020.
- 2026-11-10, text only: K₀ = 4.31 cm²/(V s) in case D2 attributed to Verbeck and coworkers (2004), with a note that
  its reduced field is above the low-field range; section and page locators for Reiser. Golden values unchanged.

### 0.2.2 - 2026-11-04 (engine 0.2.2)

- Space charge: thick meshes roll their transmission once per crossing, slow ions in strong magnetic fields keep 32
  steps per gyration, the energy check is net of the pair-force work, and runs with a mean β² above 0.01 warn that the
  magnetic pair force is left out.
- A mesh on a step end rolls its transmission once, so a mesh of transmission 0.5 passes 0.5, not 0.25.
- Expressions use conventional precedence (-x^2 = -(x^2)).
- Source colors and unknown project keys are sanitized; unconverged fields are not cached.
- The benchmarks cite independent references, with tighter tolerances. Results show per-species waists and why a
  waist is missing.

### 0.2.1 - 2026-10-29 (engine 0.2.1)

- First version on the site (unlisted beta). Earlier history was not kept.
