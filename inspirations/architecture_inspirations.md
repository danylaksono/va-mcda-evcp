## System Purpose

Client-side analytical application that evaluates spatial suitability using **multi-criteria decision analysis (MCDA)** over **H3** cells.

Processing engine: **DuckDB** WASM
Visualization: **MapLibre** with **h3-js**

Input data already prepared as **Parquet** containing normalized MCDA attributes.

No user file uploads. No heavy ingestion logic required.

---

# 1. Simplified System Architecture

```
Browser
│
├── UI Layer
│   sliders, weights, scenario controls
│
├── Visualization Layer
│   MapLibre + h3-js boundary generation
│
├── Analytical Engine
│   DuckDB WASM + H3 extension
│
├── Query Layer
│   SQL templates for aggregation + MCDA
│
└── Data Layer
    static Parquet datasets
```

All modelling occurs inside DuckDB.

JavaScript only:

* manages UI state
* runs SQL queries
* converts H3 cells to polygons for rendering.

---

# 2. Data Storage Model

Each dataset stored as **Parquet**.

Expected schema:

```
h3_cell            UBIGINT
resolution         INTEGER

pop_density
pop_density_normalized

one_or_more
one_or_more_normalized

two_or_more
two_or_more_normalized

employment_30
employment_30_normalized

supermarket_30
supermarket_30_normalized

road_2025
road_2025_normalized

normalised_capacity
normalised_capacity_normalized

motorized_traffic_index
motorized_traffic_index_normalized

time_limit
time_limit_normalized
```

Design decision:

* store **H3 cell ID**
* store **raw + normalized fields**
* keep normalization outside runtime pipeline

Advantages:

* deterministic MCDA
* no runtime normalization cost
* reproducibility across scenarios

---

# 3. Data Loading Workflow

At app initialization:

```
DuckDB WASM
│
└── load Parquet datasets
```

Example:

```sql
CREATE TABLE mcda_base AS
SELECT *
FROM read_parquet('mcda_cells.parquet');
```

Optional index:

```sql
CREATE INDEX idx_cell
ON mcda_base(h3_cell);
```

No preprocessing required.

---

# 4. MCDA Computation Model

MCDA score defined as weighted linear combination of normalized fields.

General equation:

```
score =
w1 * pop_density_normalized +
w2 * one_or_more_normalized +
w3 * two_or_more_normalized +
w4 * employment_30_normalized +
w5 * supermarket_30_normalized +
w6 * road_2025_normalized +
w7 * normalised_capacity_normalized +
w8 * motorized_traffic_index_normalized +
w9 * time_limit_normalized
```

This computation should occur **inside DuckDB**.

Reason:

* vectorized column operations
* scalable to millions of cells
* keeps analytical logic reproducible
* avoids transferring large arrays to JS.

Example SQL template:

```sql
SELECT
  h3_cell,
  (
    {w1} * pop_density_normalized +
    {w2} * one_or_more_normalized +
    {w3} * two_or_more_normalized +
    {w4} * employment_30_normalized +
    {w5} * supermarket_30_normalized +
    {w6} * road_2025_normalized +
    {w7} * normalised_capacity_normalized +
    {w8} * motorized_traffic_index_normalized +
    {w9} * time_limit_normalized
  ) AS mcda_score
FROM mcda_base;
```

JS only injects weight parameters.

---

# 5. Scenario Engine

Users adjust:

* criterion weights
* optional filters
* thresholds

Each change triggers SQL recomputation.

Example scenario query:

```sql
CREATE OR REPLACE TABLE scenario_result AS
SELECT
  h3_cell,
  score,
  RANK() OVER (ORDER BY score DESC) AS suitability_rank
FROM (
  SELECT
    h3_cell,
    (
      {w1} * pop_density_normalized +
      {w2} * one_or_more_normalized +
      {w3} * two_or_more_normalized +
      {w4} * employment_30_normalized +
      {w5} * supermarket_30_normalized +
      {w6} * road_2025_normalized +
      {w7} * normalised_capacity_normalized +
      {w8} * motorized_traffic_index_normalized +
      {w9} * time_limit_normalized
    ) AS score
  FROM mcda_base
);
```

DuckDB recomputes column-wise extremely quickly.

---

# 6. Visualization Pipeline

DuckDB returns:

```
h3_cell
mcda_score
rank
```

JS transforms for rendering.

### Step 1

Query results:

```sql
SELECT h3_cell, mcda_score
FROM scenario_result;
```

### Step 2

Convert cells to boundaries via **h3-js**

```
cell → polygon coordinates
```

### Step 3

Construct GeoJSON:

```
FeatureCollection
```

### Step 4

Load into **MapLibre** source.

MapLibre layer example:

```
fill-color → mcda_score
```

Boundary generation stays outside SQL because:

* geometry generation is lightweight
* avoids spatial extension overhead
* reduces WASM memory use.

---

# 7. Resolution Strategy

Dataset stored at **base resolution** (e.g., H3 r9).

Resolution change:

```
r10-> r9 → r8 → r7
```

DuckDB query:

```sql
SELECT
  h3_cell_to_parent(h3_cell, {target_resolution}) AS cell,
  AVG(mcda_score) AS score
FROM scenario_result
GROUP BY cell;
```

Rendering uses parent cells.

No recomputation of MCDA necessary.

---

# 8. Rendering Optimization

To avoid large GeoJSON:

Options:

1. Only render visible map extent
2. Cache boundary polygons
3. render only the mcda output. no need to render all the layers. their main purpose is for computation.

Typical pipeline:

```
viewport bbox
→ query cells intersecting viewport
→ generate polygons
→ render
```

---

# 9. Application Modules

Recommended structure:

```
/data
  dataset.parquet

/db
  duckdb-client.ts
  sql-templates.ts

/analysis
  mcda-engine.ts
  scenario-runner.ts

/map
  maplibre-controller.ts
  h3-geometry.ts

/ui
  weight-controls.ts
  scenario-panel.ts

/state
  scenario-state.ts
```

---

# 10. Query Template Layer

SQL templates stored separately:

```
/sql
  base_query.sql
  mcda_score.sql
  resolution_rollup.sql
```

LLMs modify parameters only.

Never generate ad-hoc SQL strings.

---

# 11. Performance Characteristics

Typical dataset scale:

```
H3 resolution 9
~700k cells for UK
```

DuckDB performance:

* score recomputation: milliseconds
* rollup aggregation: <100ms
* memory footprint small due to column compression

Visualization cost dominated by:

* polygon generation
* MapLibre rendering.

---

# 12. Core Design Principle

Separate three responsibilities:

```
DuckDB
  → computation

h3-js
  → geometry generation

MapLibre
  → visualization
```

Do not mix them.

The system remains:

**client-side analytical engine + hexagonal visualization layer.**
