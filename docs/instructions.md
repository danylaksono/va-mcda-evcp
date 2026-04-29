# A Visual Analytics Platform for Multi-Criteria EV Charging Station Siting and Scenario Exploration

## Description

This project is a visual analytics platform to help decision makers on the case of electric vehicle charging station. The decision making process is aided by visual informations using Multicriteria Decision Making Analysis (MCDA), where the user could interactively adjust the weight of each parameter of the model and see how it impact the decision space on a map. in addition, the project also facilitate simulations: once the user decided on a location for EVCP installation, they could then click on the location (an h3 grid in this case) and see how it impact carbon saved, socio-demographic trends (e.g., deprivations), budget or headroom demand.

## Architecture

The javascript project utilises react and vite. Duckdb is used for the computational engine, while maplibre is employed to visualise the output. The base spatial unit is h3 grid at resolution 10, which will be handled by duckdb for computation and h3js for visualisation (of the aggregated decision score). 

./inspirations contains some inspiration for the design and computation concept, but improve it as you see fit.

local browser storage is used to store some of the user selected scenarios (configuration of parameter's weights and selected EVCP location)

The ovreall design is sleek and simple, representing this project as a visual analytics dashboard for an academic setting.

## Data
The data for MCDA model's parameters are stored in ./data_source. They are using parquet format, where each row is a H3 cell at resolution 10. the ./data_attributes.md details their properties. the normalised fields are the one that will be used for the weight calculations. 


## Visualisation

The project is a dashboard to facilitate MCDA decision making via visual analytics. the dashboard contains elements which are linked interactively (coordinated multi-view) which allows the user to quickly make sense of the data by interacting with the elements (in this case, decide where to put EVCP chargers and simulate the what-if scenario of putting the chargers there).


### Dashboard elements
the mcda_interactive_sample.html contains the main inspiration for the visualisation elements. they have parallel coordinate plot which acts as MCDA parameter weight selector, AHP interface to allow for pairwise comparison of weights in AHP method and matrix view. These elements can be adjusted as per our need for the dashboard.

Another component that is needed is a map viewer (based on maplibre) which allows the user to visualise the MCDA score (as h3 grids) which interactively updates as the weight adjusted. no need to visualise the other layers as they serve for 'computational' purpose only. in the future I might want to add another 'visual display' layers so add a layer selector to facilitate that. I might also want to add pmtiles later (./data_source/pmtiles).

In addition, the dashboard should also contains panels to visualise the what-if simulation output, e.g., as charts or KPIs of carbon saved, costs, socio-economic impact or headroom impact (e.g., 'substations need upgrade'). I might add DFES timeseries later so that the output can be compared with the plan.

Add other elements as you see needed.

### Visualisation and interaction Workflow

The PCP (Parallel coordinate) is where the user start, i.e., by adjusting the weights in PCP and in AHP, they determine the weights they want to allocate to the parameters. Use browse and learn how best to represent the MCDA model: I'm thinking WLC + AHP for now, although I might want to add TOPSIS+AHP later. the matrix of weight allows the user to quickly inspect how it is distributed.

The weight selection affects the map, which then shows the final decision score using h3 grids of the computed score. the map acts also as the tool for what-if scenario. when the user see the MCDA h3 score, they can then select a h3 grid (clicking on the grid on map), choose what types of charger they want to install there and other properties, then put the EVCP (the map shows a marker of the selected location). The what if panel then gets updated based on this, where the user can inspect. learn what computation model is best for the simulation.

When the user is satisfied with the above configuration, they can click on a 'Save scenario' button, which will save the current setting (i.e. parameter's weights, h3 index, selected evcp type) to local browser storage. a semi-transparent line is then added to the parallel coordinate plot to represent this setting. the user can save multiple scenarios so that they can compare the best result. 