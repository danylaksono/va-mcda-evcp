# Implementation Plan: VA-MCDA-EVCP Dashboard

## Overview

A client-side visual analytics dashboard for Multi-Criteria Decision Analysis (MCDA) of EV Charging Point (EVCP) siting in Greater London. The system combines coordinated multi-view visualizations with real-time scenario evaluation, all running in the browser.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Client-Side)                 │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              UI Layer (React + TypeScript)        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │  PCP     │ │  AHP     │ │  Matrix View     │  │   │
│  │  │  Weight  │ │  Pairwise│ │  Diagnostics     │  │   │
│  │  │  Control │ │  Compare │ │                  │  │   │
│  │  └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │   │
│  │       │             │                │            │   │
│  │  ┌────▼─────────────▼────────────────▼─────────┐  │   │
│  │  │         State Management (Zustand)          │  │   │
│  │  │   weights │ scenarios │ selections │ map    │  │   │
│  │  └────┬──────────────────────────────┬─────────┘  │   │
│  │       │                              │            │   │
│  │  ┌────▼──────────┐  ┌───────────────▼──────────┐  │   │
│  │  │ Analysis Layer│  │  Visualization Layer     │  │   │
│  │  │ MCDA Engine   │  │  MapLibre + H3 Grid      │  │   │
│  │  │ Impact Model  │  │  D3 Charts               │  │   │
│  │  │ AHP Solver    │  │  Impact KPIs             │  │   │
│  │  └────┬──────────┘  └───────────────┬──────────┘  │   │
│  │       │                              │            │   │
│  │  ┌────▼──────────────────────────────▼──────────┐  │   │
│  │  │         Data Layer (DuckDB WASM)             │  │   │
│  │  │   SQL Templates │ Parquet Loading │ Queries  │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Static Assets                         │   │
│  │   /data_source/*.parquet  │  /data_source/pmtiles│   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 18 + TypeScript | UI components |
| Build | Vite 5 | Dev server & bundling |
| Computation | DuckDB WASM | SQL queries over Parquet |
| Map | MapLibre GL JS | Spatial visualization |
| Hex Grid | h3-js | H3 cell boundary generation |
| Charts | D3.js v7 | PCP, AHP, Matrix charts |
| State | Zustand | Lightweight state management |
| Styling | Tailwind CSS 3 | Utility-first CSS |
| Storage | localStorage | Scenario persistence |
| Testing | Vitest + React Testing Library | Unit & integration tests |

---

## Directory Structure

```
src/
├── main.tsx                    # App entry point
├── App.tsx                     # Root layout component
│
├── db/                         # Data Layer
│   ├── duckdb-client.ts        # DuckDB WASM init & query runner
│   ├── sql-templates.ts        # Parameterized SQL queries
│   └── data-loader.ts          # Parquet file loading
│
├── analysis/                   # Analysis Layer
│   ├── mcda-engine.ts          # WLC, WPM, TOPSIS scoring
│   ├── ahp-solver.ts           # AHP pairwise matrix & CR calc
│   ├── impact-model.ts         # What-if impact estimation
│   └── types.ts                # Shared analytical types
│
├── store/                      # State Management
│   ├── mcda-store.ts           # Weights, method, criteria state
│   ├── map-store.ts            # Map viewport, selection state
│   ├── scenario-store.ts       # Saved scenarios, localStorage
│   └── impact-store.ts         # EVCP selections & impact results
│
├── components/                 # UI Components
│   ├── layout/
│   │   ├── Dashboard.tsx       # Main dashboard grid layout
│   │   ├── Header.tsx          # Top bar with method selector
│   │   └── Panel.tsx           # Reusable panel wrapper
│   │
│   ├── mcda/
│   │   ├── ParallelCoordinates.tsx  # PCP weight adjustment
│   │   ├── AHPComparison.tsx        # Pairwise comparison UI
│   │   ├── MatrixView.tsx           # Criterion contribution matrix
│   │   └── WeightSummary.tsx        # Weight distribution display
│   │
│   ├── map/
│   │   ├── MapView.tsx              # MapLibre container
│   │   ├── H3Layer.tsx              # H3 grid MCDA overlay
│   │   ├── EVCPMarkers.tsx          # Selected EVCP locations
│   │   └── LayerControl.tsx         # Layer visibility toggle
│   │
│   ├── impact/
│   │   ├── ImpactPanel.tsx          # What-if simulation panel
│   │   ├── ChargerConfig.tsx        # Charger type selector
│   │   ├── KPICards.tsx             # Impact metric cards
│   │   └── ImpactCharts.tsx         # Impact visualization charts
│   │
│   └── scenarios/
│       ├── ScenarioManager.tsx      # Save/load/compare scenarios
│       └── ScenarioList.tsx         # Saved scenario list
│
├── hooks/                      # Custom React Hooks
│   ├── useDuckDB.ts            # DuckDB query hook
│   ├── useMCDA.ts              # MCDA computation hook
│   └── useMapInteraction.ts    # Map click/selection hook
│
├── utils/                      # Utilities
│   ├── color-scales.ts         # Color ramps for scoring
│   ├── h3-utils.ts             # H3 cell → GeoJSON helpers
│   └── format.ts               # Number/label formatting
│
└── __tests__/                  # Tests
    ├── analysis/
    │   ├── mcda-engine.test.ts
    │   ├── ahp-solver.test.ts
    │   └── impact-model.test.ts
    ├── db/
    │   └── sql-templates.test.ts
    ├── store/
    │   ├── mcda-store.test.ts
    │   └── scenario-store.test.ts
    └── components/
        ├── ParallelCoordinates.test.tsx
        └── MapView.test.tsx
```

---

## Implementation Phases

### Phase 1: Project Scaffolding
- [x] Initialize Vite + React + TypeScript project
- [x] Install all dependencies
- [x] Configure Tailwind CSS
- [x] Configure Vitest for testing
- [x] Set up project directory structure

### Phase 2: Data Layer
- [x] Initialize DuckDB WASM client with singleton pattern
- [x] Create SQL template system for parameterized queries
- [x] Load all 9 Parquet files into DuckDB tables
- [x] Create unified MCDA base view joining all layers by h3_cell
- [x] Test queries return expected schema

### Phase 3: MCDA Analysis Engine
- [x] Implement Weighted Linear Combination (WLC/WSM) scoring
- [x] Implement AHP pairwise comparison matrix solver
- [x] Implement AHP consistency ratio calculation
- [x] Implement TOPSIS scoring (stretch)
- [x] Unit tests for all scoring methods

### Phase 4: State Management
- [x] Create Zustand store for MCDA weights & method selection
- [x] Create store for map state (viewport, selected cells)
- [x] Create store for scenarios (save/load from localStorage)
- [x] Create store for impact simulation state
- [x] Wire stores with coordinated update logic

### Phase 5: Map Visualization
- [x] Initialize MapLibre GL map centered on Greater London
- [x] Implement H3 grid layer rendering from MCDA scores
- [x] Color-code H3 cells by suitability score
- [x] Implement cell click selection for EVCP placement
- [x] Add EVCP marker layer for selected locations
- [x] Add layer control panel for future layers
- [x] Viewport-based query optimization

### Phase 6: MCDA Interactive Views
- [x] Parallel Coordinate Plot with draggable weight handles
- [x] Real-time weight redistribution on drag
- [x] AHP pairwise comparison interface
- [x] Matrix view with criterion contributions
- [x] AHP diagnostics (CR, λ max)
- [x] Coordinated linking between all views

### Phase 7: Impact Simulation
- [x] Charger type configuration panel
- [x] Energy demand estimation model
- [x] Carbon reduction calculation
- [x] Grid headroom impact assessment
- [x] Socio-demographic coverage metrics
- [x] KPI cards and impact charts

### Phase 8: Scenario Management
- [x] Save current configuration to localStorage
- [x] Load and restore saved scenarios
- [x] Display saved scenarios as overlay lines on PCP
- [x] Compare multiple scenarios side-by-side
- [x] Export scenario configuration

### Phase 9: Testing & Polish
- [x] Unit tests for MCDA engine (13 tests)
- [x] Unit tests for AHP solver (11 tests)
- [x] Unit tests for impact model (16 tests)
- [x] Integration tests for MCDA store (7 tests)
- [x] Integration tests for scenario store (9 tests)
- [ ] Component rendering tests (future)
- [ ] UI polish and responsive layout (future)

---

## Test Summary

**56 tests passing** across 5 test files:
- `mcda-engine.test.ts` — SQL generation, weight normalization, weight adjustment
- `ahp-solver.test.ts` — Matrix construction, weight derivation, consistency checks, scale conversions
- `impact-model.test.ts` — Demand estimation, utilization, energy, carbon, aggregation
- `mcda-store.test.ts` — Weight management, method selection, comparison handling
- `scenario-store.test.ts` — Placements, scenario CRUD, localStorage persistence

---

## MCDA Criteria (9 Parameters)

| # | Criterion | Normalized Field | Category |
|---|-----------|-----------------|----------|
| 1 | Population Density | pop_density_normalized | Demand |
| 2 | Car Ownership (>1) | more_than_one_normalized | Demand |
| 3 | Deprivation (2+) | two_or_more_normalized | Equity |
| 4 | Employment Access (30min) | employment_30_normalized | Accessibility |
| 5 | Supermarket Access (30min) | supermarket_30_normalized | Accessibility |
| 6 | Transport CO₂ Emissions | road_2025_normalized | Environment |
| 7 | Grid Headroom Capacity | normalised_capacity_normalized | Infrastructure |
| 8 | Traffic Index | motorized_traffic_index_normalized | Demand |
| 9 | Distance to Nearest EVCP | time_limit_normalized | Coverage |

---

## Key Design Decisions

1. **All computation in DuckDB** — MCDA scoring via SQL, not JS loops
2. **H3 resolution 10 base, aggregated for display** — r10 stored, r7-r9 for map zoom levels
3. **Separation of concerns** — Data, Analysis, State, and UI are independent layers
4. **Coordinated multi-view** — All views react to shared state changes via Zustand
5. **Lightweight impact model** — Analytical equations, not simulation, for real-time feedback
6. **Client-side only** — No backend server; all data loaded from static Parquet files

---

## Impact Estimation Formulas

### Energy Delivered (kWh/year)
```
E_annual = N × P × H × U × 365
```
Where: N = chargers, P = power (kW), H = operating hours/day, U = utilization factor

### Utilization Factor
```
U = min(1, D / (N × P × H))
```
Where: D = estimated daily demand from population density & car ownership

### Carbon Reduction (tCO₂/year)
```
C_saved = E_annual × EF_grid × (1 - EF_ratio)
```
Where: EF_grid = grid emission factor, EF_ratio = EV vs ICE efficiency ratio

### Grid Impact
```
Peak_demand = N × P × diversity_factor
Headroom_remaining = substation_capacity - existing_load - Peak_demand
```

---

## Interaction Workflow

```
User adjusts weights (PCP / AHP)
        │
        ▼
Zustand store updates weights
        │
        ▼
DuckDB recomputes MCDA scores (SQL)
        │
        ├──▶ Map updates H3 grid colors
        ├──▶ Matrix view updates contributions
        └──▶ Rankings sidebar updates
        
User clicks H3 cell on map
        │
        ▼
Charger config panel opens
        │
        ▼
User selects charger type & count
        │
        ▼
Impact model computes estimates
        │
        ├──▶ KPI cards update
        └──▶ Impact charts update

User saves scenario
        │
        ▼
Config saved to localStorage
        │
        ├──▶ PCP shows ghost line for scenario
        └──▶ Scenario list updates
```
