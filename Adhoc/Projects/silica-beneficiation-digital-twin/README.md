# Silica Beneficiation Digital Twin

Working project for reconstructing plant equipment from reference photos, arranging it in a 3D process layout, and simulating connected silica beneficiation operations.

## Current concept

- Interactive 3D representation of a generic 50 t/h Rajasthan silica wet-beneficiation plant.
- Configurable feed, silica grade, recovery, water intensity and recycle rate.
- Live solids balance, water balance, pump power and plant demand.
- Preliminary machinery schedule with duties, motors and rotational speeds.
- Calculation substitutions and a clearly stated conceptual design basis.

## Project structure

```text
docs/                    Project brief and data collection templates
public/models/           Approved GLB/GLTF equipment models
public/reference-photos/ Source photos grouped by equipment ID
src/data/                Plant and equipment input data
src/scene/               3D scene and equipment components
src/simulation/          Mass, water, grade, and equipment calculations
tests/                   Calculation and scenario tests
```

## Start locally

Install dependencies once, then start the local server:

```bash
npm install
npm start
```

Then open `http://localhost:4173`.

Run calculation tests with:

```bash
npm test
```

## First working session

1. Choose one equipment item and assign an ID such as `SCR-001`.
2. Add its photos under `public/reference-photos/SCR-001/`.
3. Complete `docs/equipment-intake-template.md` for that item.
4. Complete the known feed data in `docs/process-data-template.md`.
5. Agree on the first flowsheet and calculation assumptions before model calibration.

## Accuracy note

Photo-derived geometry is suitable for visualization and layout planning when scaled by known dimensions. It is not fabrication geometry. Simulation results must retain their data sources and assumptions and should be validated against plant tests before operational or investment decisions.
