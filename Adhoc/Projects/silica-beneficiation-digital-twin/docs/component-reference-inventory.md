# Component Reference Inventory

Research basis for the detailed silica beneficiation component library. These sources are used to understand machine construction and process behaviour; their photographs and branded CAD are not copied into the project.

## Fine material screw washer

- Reference: https://www.mclanahan.com/products/fine-material-screw-washers
- Operating video: https://www.youtube.com/watch?v=JoK-JnTF3z0
- Detail video: https://www.youtube.com/watch?v=nkh3t2zpzqE
- Functions: wash, classify and dewater minus 10 mm material.
- Modelled parts: inclined washer box, feed box, baffle, settling pool, adjustable overflow weirs, rising-current water points, spiral shaft, replaceable wear shoes, submerged rear bearing, upper bearing, reducer, motor, coupling, dry deck and discharge chute.
- Simulation variables: screw speed, pool area, water rate, weir elevation, feed PSD, percent passing 50/200 mesh, sand settling velocity, overflow partition and discharge moisture.

## Spiral concentrator

- Reference: https://www.multotec.com/en/spiral-concentrator
- Heavy-mineral brochure: https://www.multotec.com/public/uploads/files/media_files/file_bdf18fe85bb04adacab930c898a74929.pdf
- Functions: density separation of heavy minerals from light silica, generally in fine mineral-sand size ranges.
- Modelled parts: gravity distributor, feed hoses, feed box, helical trough, central support column, adjustable splitters, concentrate/middlings/tailings product box, launders and sample points.
- Simulation variables: feed solids concentration, per-start flow, size distribution, mineral density, splitter setting, trough profile and number of turns.

## Wet high-intensity magnetic separator

- Reference: https://www.eriez.com/NA/EN/Products/Magnetic-Separation/Electromagnets/Wet-High-Intensity-Magnetic-Separator-WHIMS.htm
- Component drawing: https://www.eriez.com/Documents/Literature/Brochures/Products/Magnetic-Separation/MMPB-481-Eriez-Wet-High-Intensity-Magnetic-Separator.pdf
- Functions: removal of weakly magnetic iron-bearing contaminants from silica slurry.
- Modelled parts: magnet frame, coils/poles, rotating matrix, feed distributor, rinse-water sprays, non-magnetic launder, magnetic discharge launder, drive and cooling system.
- Simulation variables: field strength, matrix type, rotor speed, rinse-water rate, feed solids, particle size and mineral magnetic susceptibility.

## Hydrocyclone and dewatering

- Reference: https://www.multotec.com/en/hydrocyclone-separator
- Integrated industrial-sand plant reference: https://www.mclanahan.com/products/sand-washing-plants
- Functions: desliming/classification followed by moisture reduction.
- Modelled parts: slurry sump, lined pump, feed manifold, isolation valves, pressure gauge/transmitter, cyclone barrel, vortex finder, cone, spigot, overflow manifold, underflow box, dewatering deck, exciters and screen-water sump.
- Simulation variables: cyclone diameter, inlet pressure, spigot/vortex sizes, slurry density, partition curve, bypass, screen aperture and drainage efficiency.

## Screens and laboratory sizing

- ASTM sieve specification: https://store.astm.org/e0011-22.html
- AFS sand testing overview: https://www.afsinc.org/e-learning/sand-testing
- Practical AFS/AGS method: https://samsa.org.uk/laboratory_tests/ags_and_afs.php
- Particle-size test method: https://samsa.org.uk/laboratory_tests/particle_size_analysis.php
- Commercial screen bands such as 30–35 or 40–45 mesh represent aperture ranges. AFS GFN is calculated from percentage retained across a standard nest of sieves; it is not equal to one selected screen number.

## Enclosed rotary sieve train for dried silica

- Silica rotary-screen reference and preliminary size range: https://www.ninemachine.com/Rotary-Drum-Screen-pd532612078.html
- Enclosed fine-powder rotary-sifter reference: https://www.praterindustries.com/products/rotary-sifters/
- Generic rotary separator construction reference: https://www.erimaki.it/cgi-bin/catalogo/10/10%20trommelENG.pdf
- Duty: grade washed, sun-dried silica through multiple mesh cuts with low particle breakage.
- Arrangement: controlled feed → rotary sieve 1 → oversize duct to rotary sieve 2 → oversize duct to rotary sieve 3. Each drum's undersize hopper becomes a separate product grade; final oversize becomes a coarse product or recycle.
- Modelled parts: cylindrical woven-mesh or perforated drum, inlet hood, internal helical scroll/lifters, tyre rings, support rollers, thrust rollers, ring drive, geared motor, undersize hopper, oversize hood, flexible duct connectors, dust-extraction nozzle, inspection doors and access platform.
- Simulation variables: aperture, open area, drum diameter/length, inclination, rpm, feed rate, feed moisture, residence time, bed depth, blinding, bypass and partition efficiency.
- Calibration data: feed PSD, mass and retained sieve analysis for every product outlet, actual AFS GFN, moisture, tph, drum rpm and mesh condition.
- AFS alone is not sufficient for an exact correction: two products can share one AFS GFN but have different coarse/fine tails. Full retained percentages reveal whether the correction needs a different aperture, changed screen order, reduced loading, more residence time, mesh cleaning or recycle.
- Current generic pilot basis: three enclosed drums, approximately 1.2 m diameter by 3.5–4.1 m screening length, 5.5 kW geared drive each, nominal 35/40/45 mesh sequence. These values are preliminary and will be recalculated after feed PSD, moisture and required product splits are entered.

## Connection inventory

Every unit model should expose typed ports rather than arbitrary visual lines:

- Dry solids: feed chutes, transfer chutes, belt discharge and stockpile discharge.
- Gravity slurry: lined launders with slope, freeboard, splitter gates, drains and sample points.
- Pressurised slurry: rubber-lined pipe, long-radius elbows, flanges, reducers, flexible joints, isolation valves, flush connections, pressure instruments and supports.
- Process water: pump discharge, manifolds, control valves, flowmeters, spray bars and wash-water branches.
- Thickener services: flocculant line, dilution water, overflow launder and underflow pump suction.
- Electrical/mechanical: motor, coupling, guard, gearbox, VFD, local isolator, cable tray and instrument junction box.

## Modelling quality levels

1. Generic industrial model: correct mechanism, ports, moving parts and approximate envelope.
2. Vendor-family model: representative configuration based on published drawings and dimensional ranges.
3. Plant-specific model: reconstructed from owner photographs, measurements, nameplates and layout drawings.
4. Engineering model: vendor GA/CAD, certified nozzle loads, civil loads, access clearances and reviewed process guarantees.
