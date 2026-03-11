Below is a **VIS-style paper structure** tailored to your system and dataset. This format aligns well with expectations at venues like IEEE VIS, EuroVis, and IEEE PacificVis, where reviewers expect a clear **visual analytics contribution**, not just an application.

I also incorporated the datasets and modelling workflow you described.

---

# Proposed paper title

**Interactive Visual Analytics for Multi-Criteria EV Charging Infrastructure Planning: Integrating Site Selection and Policy Impact Exploration**

---

# 1. Introduction

Start with three problems.

### EV infrastructure planning complexity

Cities must plan EV charging infrastructure while balancing multiple competing objectives, including accessibility, grid capacity, demand potential, and social equity. These factors are typically derived from heterogeneous spatial datasets and involve complex trade-offs.

### Lack of transparent planning tools

Although multi-criteria decision analysis is commonly used for infrastructure siting, traditional workflows are static and opaque. Stakeholders often cannot explore how different priorities affect outcomes or understand why certain sites are selected.

### Need for interactive planning exploration

Urban planners increasingly require tools that allow them to explore decision trade-offs, adjust assumptions, and estimate policy impacts in real time.

---

### Contributions

A typical VIS contribution section should be explicit.

Example:

```text
This paper makes three contributions:

1. A visual analytics framework that integrates multi-criteria decision analysis with interactive scenario exploration for infrastructure planning.

2. A coordinated multi-view interface that enables planners to explore criteria weights, inspect ranking sensitivity, and understand decision trade-offs through linked visual representations.

3. A lightweight analytical impact model that allows real-time estimation of carbon reduction, electricity demand, and socio-economic reach of proposed EV charging infrastructure interventions.

We demonstrate the approach through a case study of EV charging point planning in Greater London.
```

---

# 2. Related Work

Break this into four subsections.

### 2.1 EV infrastructure planning

Discuss spatial planning for EV charging networks and typical optimisation approaches.

Focus on limitations of static planning tools.

---

### 2.2 Multi-criteria decision analysis in spatial planning

Discuss MCDA approaches such as

* Weighted Sum Model
* Weighted Product Model
* Technique for Order Preference by Similarity to Ideal Solution
* Analytic Hierarchy Process

Explain that these methods are widely used but often lack interactive exploration.

---

### 2.3 Visual analytics for urban planning

Discuss systems that combine visualisation and analytical modelling to support planning decisions.

Emphasise interactive exploration of complex trade-offs.

---

### 2.4 Scenario exploration in planning dashboards

Discuss "what-if" simulation interfaces for policy exploration.

Position your work as combining **site selection + impact modelling**.

---

# 3. Data and Case Study

Describe the Greater London dataset.

## EV charging infrastructure

Existing EV charging locations were obtained from
Open Charge Map.

The dataset was filtered to include:

* public access charging points
* operational status only
* rapid chargers with connection power ≥ 43 kW

Isochrone driving time surfaces were generated for these locations to represent accessibility to existing charging infrastructure.

---

## Socio-economic and demographic data

Population density, vehicle ownership, and deprivation indicators were derived from the
Office for National Statistics
Census 2021 datasets at the Lower Super Output Area level.

Additional accessibility indicators include:

* employment accessibility within 30 minutes
* supermarket accessibility within 30 minutes

---

## Energy infrastructure data

Electricity network infrastructure was obtained from
UK Power Networks.

Primary substation locations were processed into Voronoi service areas representing approximate distribution territories.

Future electricity demand projections were obtained from the Distribution Future Energy Scenarios dataset.

---

## MCDA criteria layers

Explain the criteria table clearly in the paper.

Example explanation:

```text
The MCDA model incorporates nine criteria representing demand potential, accessibility, infrastructure capacity, and socio-economic need. Each layer is normalised to a common scale and incorporated into the decision model as a weighted criterion.
```

---

# 4. Analytical Framework

Explain two components.

## 4.1 Multi-criteria suitability model

Site suitability is calculated using a weighted multi-criteria decision model:

[
Score = \sum_{i=1}^{n} w_i S_i
]

where

* (S_i) represents the normalised score of criterion (i)
* (w_i) represents the criterion weight

The platform also supports alternative scoring models including weighted product and distance-to-ideal ranking.

---

## 4.2 Impact estimation model

After a candidate location is selected, the system estimates the potential impacts of installing EV charging infrastructure.

The model estimates:

* energy delivered
* carbon emissions avoided
* grid load impact
* socio-demographic reach

These metrics are calculated using lightweight analytical equations designed for real-time evaluation in interactive environments.

For example:

[
U = \min\left(1, \frac{D}{NPH}\right)
]

where

* (D) is estimated daily demand
* (P) charger power
* (H) operating hours
* (N) number of chargers

Annual carbon reduction is estimated from annual delivered energy and regional emission factors.

---

# 5. System Design

Explain the interface.

## Design goals

Example goals:

```text
G1: Enable interactive exploration of MCDA weight sensitivity  
G2: Provide transparent explanations of ranking results  
G3: Support scenario exploration of infrastructure interventions  
G4: Integrate spatial, socio-economic, and energy datasets
```

---

## Visual interface components

### Parallel coordinate view

Allows users to explore criteria distributions and adjust weights interactively.

### Importance map

Supports pairwise comparison between criteria using spatial interaction.

### Matrix diagnostics view

Displays criterion contributions and ranking transparency.

### Impact simulation panel

Displays estimated outcomes of infrastructure deployment.

---

# 6. Case Study: EV Charging Planning in Greater London

Demonstrate several planning scenarios.

Example:

### Scenario 1

Accessibility priority.

### Scenario 2

Equity focused planning.

### Scenario 3

Grid constrained planning.

Show how rankings change.

---

# 7. Discussion

Discuss insights.

Examples:

* Trade-offs between accessibility and grid capacity
* Spatial inequality in charging infrastructure
* Sensitivity of MCDA outcomes to weight selection

Also discuss limitations.

---

# 8. Conclusion

Summarise the contribution.

Example:

```text
This work demonstrates how visual analytics can enhance transparency and interactivity in infrastructure planning workflows. By integrating multi-criteria decision analysis with impact modelling, the proposed platform enables planners to explore trade-offs, evaluate potential interventions, and better understand the consequences of infrastructure decisions.
```

---

# One important thing that will strengthen this paper a lot

VIS reviewers like **design insights**.

Add a section called:

```text
Design Lessons for Visual Decision Analytics
```

Examples:

* integrated weight manipulation improves decision transparency
* linking ranking with criteria explanation improves interpretability
* lightweight analytical models enable real-time planning exploration

---

If you want, I can also help you craft **three strong research questions** for the paper. Good VIS papers almost always include them, and they significantly improve acceptance chances.
