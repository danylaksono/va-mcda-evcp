Identifying Parameters for EVCS Siting Analysis
What parameters to use?
Decisions on what parameters to use for EVCS Siting analysis can be broken down into three sources: 1) Reviews from previous literature discussing EVCS location analysis; 2) Regulations and rulings regarding the siting of EVCS; and 3) Use-case scenarios from clients who have the need to identify possible locations for EVCS.

Based on literature studies, the analysis itself falls into two categories: heuristic and exact methods (GIS analysis). Both methodologies employ different sets of parameters to support decision-making. This notebook will look further into the latter.

Paper	Parameters	Remarks
(Kizhakkan et al., 2019) ¹	Review paper. Different dataset, focusing on heuristics and exact (GIS) methods	Reviews of various methods with which EVCS location analysis are conducted
(Kaya et al., 2020)²	19 parameters, categorized by Economic, Geographical, Energy, Social and Transportation	Using AHP and GIS analysis for decision making based on PROMETHEE and VIKOR method
(Hisoglu & Comert, 2021)	Solar radiation, slope, aspect, land use/land cover, traffic volume and proximity to the road	Utilizing Multi-criteria Decision Making (MCDM) and GIS for site selection. Solar radiation is included as an analysis parameter since the paper discuss about solar-powered EVCS
(Priefer & Steiger, 2022)	Accessibility (parking space, traffic and road); proximity to users (population density, proximity to POI, educational medical and gastronomy, public transport); Environmental impact (protected areas, water bodies); power grid (proximity to transformer stations)	Using Analytical Hierarchy Process (AHP) to factorize the weight of each parameters, then model the probable location for EVCS using GIS
(Vansola et al., 2023)	OD Data for each grid. Parameters for the grids are taken from land use maps	Considers type of vehicle and mixed traffic flow, as well as types of and EVCS based on the charging speed. Divides the charging demand by grids, and calculate the suitability for EVCS in the grid
(Banegas & Mamkhezri, 2023)	Divided into 6 categories: Geographic; Energy, CS attributes, EV characteristics; Transportation, traffic, route features; Economic; Socio-demographic; Environmental	Systematic review of EVCS Siting methodologies
Banegas and Mamkhezri (2023)⁹ conducted a systematic reviews on these parameters, which also aligns with Kaya et. al. (2020)¹⁰ as shown below. These parameters depict possible locations that can be used to place an EV charging site.


Other references for selecting parameters of EVCS location are based on existing regulations and guidelines