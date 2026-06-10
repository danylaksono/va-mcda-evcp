# VA-MCDA-EVCP

Interactive visual analytics for multi-criteria decision analysis of electric vehicle charging point siting in Greater London.

The project supports urban infrastructure planners who need to balance accessibility, electricity grid capacity, transport demand, environmental pressure, and equity. It combines real-time MCDA scoring, spatial visualisation, multivariate glyphs, scenario saving, charger placement, impact estimation, and DFES future-energy context in a browser-only dashboard.

## Research Summary

Urban infrastructure planning, such as electric vehicle charging point (EVCP) siting, requires balancing complex trade-offs between accessibility, grid capacity, and equity. This platform provides an interactive visual analytics workflow for real-time MCDA. Planners can adjust priorities using parallel coordinate weight controls or AHP pairwise comparisons, inspect spatial suitability through H3 map overlays and glyphs, test what-if charger deployments, and compare saved scenarios against projected future energy demand.

The system is designed to be transparent and reproducible: derived spatial layers are stored as Parquet and PMTiles, analytical scores are generated from deterministic SQL templates in DuckDB WASM, and scenario state is serialised in the browser.

## Key Features

- Real-time MCDA scoring with Weighted Sum Model, Weighted Product Model, and TOPSIS.
- Parallel coordinate weight laboratory for direct manipulation of criteria weights.
- AHP pairwise comparison workflow with consistency diagnostics.
- H3 hexagonal suitability map for Greater London.
- Multivariate glyph overlays for criterion-level inspection.
- Scenario manager for saving, restoring, comparing, and stress-testing planning assumptions.
- Click-to-place EVCP simulation with charger type, count, cost, energy, revenue, carbon, and grid-headroom impacts.
- DFES time-series panel for electric vehicles, heat pumps, batteries, and pathway comparison.
- Client-side DuckDB WASM processing over local Parquet files, with no application backend.

## Visual Design

The interface follows a coordinated multiple-view layout:

| Region | Role | Design intent |
| --- | --- | --- |
| Left panel | Weight Lab, AHP, diagnostics | Keeps model assumptions visible and editable. |
| Centre panel | MapLibre H3 spatial view and DFES chart | Prioritises spatial reasoning, zooming, filtering, and temporal stress-testing. |
| Right panel | Impact and scenarios | Turns candidate placements into comparable planning evidence. |

Design principles:

- Transparency first: weight changes are visible in the controls, score map, matrix diagnostics, and scenario comparison.
- Spatial overview plus detail on demand: H3 choropleths provide city-scale suitability, while map clicks expose LSOA, borough, raw values, normalised values, and placement impacts.
- Multivariate inspection: glyphs reveal per-cell criterion profiles instead of reducing everything to a single suitability colour.
- Scenario memory: saved scenarios appear as comparison traces so planners can see how policy priorities shift outcomes.
- Calm operational UI: restrained panels, compact typography, icon controls, and clear chart hierarchy support repeated analytical use rather than a marketing-style presentation.

## MCDA Criteria

The app currently loads ten criteria layers at H3 resolution 10.

| Criterion | Field | Category | Default polarity | Meaning |
| --- | --- | --- | --- | --- |
| Population Density | `pop_density` | Demand | Benefit | Higher residential density increases potential demand. |
| Car Ownership | `more_than_one` | Demand | Benefit | Households with more than one car. |
| Deprivation | `two_or_more` | Equity | Benefit | Households with two or more deprivation dimensions. |
| Disabled Population | `disabled_pct` | Equity | Benefit | Share of residents reporting disability. |
| Employment Access | `employment_30` | Accessibility | Benefit | Employment facilities reachable within 30 minutes by public transport. |
| Supermarket Access | `supermarket_30` | Accessibility | Benefit | Supermarkets reachable within 30 minutes by public transport. |
| CO2 Emissions | `road_2025` | Environment | Cost | Road transport emissions. |
| Grid Headroom | `normalised_capacity` | Infrastructure | Benefit | Available electricity demand headroom. |
| Traffic Index | `motorized_traffic_index` | Demand | Benefit | Observed annual motorised traffic count. |
| EVCP Distance | `time_limit` | Coverage | Cost | Driving time to nearest existing public EVCP. |

Each criterion has a normalised `[0, 1]` field used for MCDA scoring. Cost criteria are oriented as `1 - value` during scoring.

## Reproducible Workflow

### 1. Install Dependencies

Use the lockfile for deterministic dependency installation.

```bash
npm ci
```

Recommended runtime: Node.js 20 LTS or newer.

### 2. Configure Optional Environment Variables

The DFES panel queries the UK Power Networks OpenDataSoft API. The code includes a development fallback key, but reproducible runs should set an explicit key in `.env.local`.

```bash
VITE_DFES_API_KEY=your_api_key_here
```

The core MCDA workflow does not require a backend service. It loads local assets from `data_source/`.

### 3. Start the Development App

```bash
npm run dev
```

Open the Vite URL printed in the terminal. On load, the app fetches each Parquet file from `data_source/`, registers it in DuckDB WASM, creates the joined `mcda_base` view, and runs the current MCDA query.

### 4. Run Tests

```bash
npm run test:run
```

The test suite covers the MCDA engine, AHP solver, impact model, MCDA store, and scenario persistence.

### 5. Build the App

```bash
npm run build
```

For local production preview, copy the static analytical data into the build output before running Vite preview:

```bash
cp -R data_source dist/data_source
npm run preview
```

This is needed because the dashboard fetches `/data_source/...` at runtime.

## Data Workflow

The repository includes derived analysis-ready data:

```text
data_source/
  *.parquet              # H3 r10 criterion layers loaded into DuckDB WASM
  pmtiles/*.pmtiles      # Vector overlays for boundaries and existing chargepoints
```

Runtime pipeline:

1. Fetch Parquet layers from `data_source/`.
2. Register each file as an in-memory DuckDB table.
3. Join all tables by `h3_cell` into `mcda_base`.
4. Generate MCDA SQL from the active method, weights, polarities, and criteria.
5. Return scored H3 cells with raw values, normalised values, LSOA code, LSOA name, and borough metadata.
6. Render the map, glyphs, diagnostics, and impact panels from the shared result set.

The source provenance for the derived layers is documented in [paper_materials/raw/data sources.md](paper_materials/raw/data%20sources.md) and the field inventory is documented in [docs/data_attributes.md](docs/data_attributes.md).

Primary data sources include:

- OpenChargeMap for public operational rapid chargepoint locations.
- ONS Census 2021 for population density, car ownership, disability, and deprivation.
- UK Power Networks for secondary substation headroom and DFES projections.
- London Atmospheric Emissions Inventory for road transport emissions.
- Public transport accessibility indicators from Verduzco Torres and McArthur.

## Architecture

```text
Browser
  React + TypeScript UI
    Weight Lab, AHP, Matrix Diagnostics, Map, DFES, Impact, Scenarios
  Zustand state
    Criteria, weights, method, map selection, scenarios, placements
  Analysis
    MCDA SQL generation, AHP solver, impact model
  DuckDB WASM
    Parquet loading, joined base view, scored query results
  Visualisation
    MapLibre GL, H3, D3, PMTiles, ScreenGrid glyph rendering
```

Important source folders:

| Path | Purpose |
| --- | --- |
| `src/analysis/` | MCDA query generation, AHP calculations, and impact model. |
| `src/db/` | DuckDB WASM setup, Parquet registration, and data loading. |
| `src/store/` | Zustand stores for coordinated views and scenario state. |
| `src/components/mcda/` | Weight laboratory, AHP, and diagnostics views. |
| `src/components/map/` | MapLibre spatial view, H3 rendering, glyphs, overlays, and placement interactions. |
| `src/components/impact/` | Charger configuration, KPI cards, radar chart, and impact summaries. |
| `src/components/dfes/` | DFES demand projection chart and scenario supply comparison. |
| `data_source/` | Reproducible local analytical assets. |

## Scenario Workflow

Typical analysis session:

1. Choose the MCDA method: WSM, WPM, or TOPSIS.
2. Adjust criteria weights in the Weight Lab or derive them through AHP.
3. Inspect suitability changes on the H3 map and matrix diagnostics.
4. Enable placement simulation and click candidate H3 cells.
5. Configure charger type and charger count.
6. Review energy, carbon, revenue, grid, population, and equity impacts.
7. Save the scenario and compare it with alternative policy priorities.
8. Use the DFES panel to compare proposed supply against future demand pathways.

Saved scenarios persist in browser `localStorage`, including weights, method, active criteria, polarity settings, placements, and impact summaries.

## Quality Checks

```bash
npm run lint
npm run test:run
npm run build
```

Use these commands before sharing results or producing figures for the paper. For a fully reproducible analytical snapshot, also record:

- Git commit hash.
- Node.js version.
- Scenario JSON or exported scenario configuration.
- DFES API query date if using live projections.
- Any changes to `data_source/`.

## Limitations

- The raw ETL pipeline is not fully encoded as executable scripts in this repository; the included Parquet and PMTiles files are the reproducible analysis-ready inputs.
- DFES data is fetched from a live API, so exact temporal results should be archived when producing final reported numbers.
- Impact calculations are lightweight planning estimates designed for interactive comparison, not a replacement for electrical engineering feasibility studies.
- Production preview requires `data_source/` to be copied or otherwise served at `/data_source/`.

## Citation 

Laksono, D., Jianu, R., & Slingsby, A. (2026). Interactive Decision Support for Exploratory Planning of EV Charging Infrastructure. CGVC 2026.
