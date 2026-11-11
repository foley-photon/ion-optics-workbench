# Data and reference notice

The MIT license in LICENSE covers my code and text in this repository. It does not cover the data below. They are
not mine, they keep their own terms and citations, and they are not relicensed here.

## Atomic masses and default isotopes (AME2020, NUBASE2020)

`site/js/engine/data/nuclides.js` holds the atomic masses of all 3558 nuclides of the 2020 Atomic Mass Evaluation,
exactly as printed in its table file `mass_1.mas20.txt`, and the default isotope of each element (the most abundant,
or for an element without a stable isotope the longest-lived one with a measured half-life) from the NUBASE2020 file
`nubase_4.mas20.txt`. Both files were retrieved from the IAEA Atomic Mass Data Center
(https://www-nds.iaea.org/amdc/ame2020/) on 2026-11-08; `scripts/build_nuclides.py` turns them into the JavaScript
table. The masses are used unchanged; an estimated (non-experimental) mass keeps the evaluators' mark and is flagged
in the page. The IAEA's terms of use allow its content to be copied and used in products and services with
acknowledgement of the IAEA as the source and without any statement or implication of IAEA endorsement; this notice
is that acknowledgement. Cite the evaluations as:

1. W. J. Huang, M. Wang, F. G. Kondev, G. Audi and S. Naimi, "The AME 2020 atomic mass evaluation (I). Evaluation of
   input data, and adjustment procedures," Chin. Phys. C 45, 030002 (2021), doi:10.1088/1674-1137/abddb0.
2. M. Wang, W. J. Huang, F. G. Kondev, G. Audi and S. Naimi, "The AME 2020 atomic mass evaluation (II). Tables, graphs
   and references," Chin. Phys. C 45, 030003 (2021), doi:10.1088/1674-1137/abddaf.
3. F. G. Kondev, M. Wang, W. J. Huang, S. Naimi and G. Audi, "The NUBASE2020 evaluation of nuclear physics
   properties," Chin. Phys. C 45, 030001 (2021), doi:10.1088/1674-1137/abddae.

## Physical constants

The constants in `site/js/engine/constants.js` (atomic mass constant, electron mass, vacuum permittivity and
permeability; the elementary charge, c and k_B are exact in the SI) are the CODATA 2022 recommended values published
by NIST (https://physics.nist.gov/cuu/Constants/; P. J. Mohr, D. B. Newell, B. N. Taylor and E. Tiesinga, "CODATA
recommended values of the fundamental physical constants: 2022," Rev. Mod. Phys. 97, 025002 (2025),
doi:10.1103/RevModPhys.97.025002).

## Color maps

`site/js/ui/colormaps.js` represents three published color maps by a few sample colors and interpolates between them:
viridis by S. van der Walt and N. Smith (designed for Matplotlib, 2015, released under CC0), cividis by J. R. Nuñez,
C. R. Anderton and R. S. Renslow, PLoS ONE 13, e0199239 (2018), doi:10.1371/journal.pone.0199239 (CC BY 4.0), and
the cool-to-warm diverging map of K. Moreland, "Diverging color maps for scientific visualization," Advances in Visual
Computing, LNCS 5876, 92-103 (2009), built from its two published end colors.

## Reference values

The validation suite (`site/js/engine/bench/`) and the help page compare the simulator with values from the
published literature: lens tables, analyzer focusing angles, stability diagrams, mobilities and others. Each value
names its source in `targets.js` and in the reference list of the help page. They are cited as facts for comparison;
the publications themselves are not reproduced here.

## No endorsement, no affiliation

Nothing in this repository is endorsed by the IAEA, NIST or the authors of the works cited. The Ion Optics Workbench
is independent software written from the open literature and is not affiliated with any commercial ion-optics
package.
