# Changelog

Versions follow semantic versioning. The release version is the version of the tool. The engine version in
`site/js/engine/version.js` changes only when the numerics or the typed-array layouts change, because it is part of
every cache key and of the worker handshake; each entry names it. cdfoley.com picks up the latest release once a day.

## 0.2.5 - 2026-11-12

Changes to the interface and the help page after a review of how the page reads and works. The engine is unchanged:
engine version 0.2.3, and every value of the validation suite equal to the golden file.

- Page: the name of the tool and one line saying what it does now sit between the beta notice and the app bar (the
  heading was there before, but hidden).
- Phone: the drawing is sized to the space left under the name strip, so its scale bar and axis legend stay above
  the tab bar at the bottom of the screen.
- Summary tab: a row of key results above the cards (transmission, waist position, rms radius at the waist, largest
  energy error), which stays in view while the cards scroll. The Planes card gives each plane's crossings, rms spot
  and mean time of flight on rows of their own.
- Results dock: tabs that do not fit on the strip go into a "More" menu at its end instead of scrolling out of
  sight; the open tab always stays on the strip.
- Benchmarks tab: the verdict is a status pill, green "56/56 gates passed" or red "N failed". Before the first run
  the tab says that Run quick takes a few seconds.
- Accuracy check and TOF peak table: differences, observed orders, error estimates, σ and FWHM are shown to 3
  significant digits. The computed values and the CSV files are unchanged.
- Scan & tune: when the best sampled point is the first or the last of the range, the result says so and suggests
  a wider range.
- Canvas: the name of a plane near the right edge is drawn to the left of the plane instead of being cut off.
- Model panel: the tab labels are no longer cut ("Electrodes", "Recording"); a shape's electrode is shown in full on
  its card; on a wide window the Particles tab is the list of sources and the selected source is edited in the
  inspector only (narrower windows keep the form in the tab).
- Inspector: a "Getting started" card on a first visit (three things to try, with a link to the Quick start), which
  stays closed once closed. "Quick run settings" starts folded and remembers whether it was opened. Small "?" links
  on the Domain cards, the electrode editor and the run settings open the matching section of the help page.
- Share: when the browser does not allow copying, the dialog with the link has a "Copy link" button and a line
  saying what the link contains.
- Build a nuclide: each number box carries its full name for screen readers.
- Help page: the table of accuracy levels scrolls in its own box on a narrow screen, and the validation table keeps
  its ID column in view while it scrolls. The long paragraphs on space charge and on the analysis are split under
  short lead-ins, with the same sentences. Links to the ion time-of-flight, mean free path and cyclotron radius
  calculators of the site. The Validation section says how to run the gates in your own browser, the References
  start with a short "Start here" list, and the Privacy section names the interface choices kept in the browser.

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
