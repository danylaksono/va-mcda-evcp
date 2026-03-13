	

Charge point locations are obtained from OpenChargeMap API (https://openchargemap.com). For the MCDA analysis, we sieve out the charging point by selecting public access only, operational status only, and rapid chargers only using max connection power >= 43 kW. Based on this, we created isochrone driving time to these locations, which we use for the MCDA layer.

Population density, vehicle ownership, disability and household deprivation layers are obtained from ONS Census 2021 (https://data.london.gov.uk/census/2021-ward-and-lsoa-estimates/) at Lower Super Output Area (LSOA) Level. Primary substation is obtained from UK Power Network (UKPN), which subsequently preprocessed as Voronoi polygons. Distribution Future Energy Scenarios (DFES) also obtained from UKPN, with future energy use projections at LSOA level.

Emission is from https://data.london.gov.uk/dataset/london-atmospheric-emissions-inventory-laei-2022-2lg5g/

Accessibilities (supermarket and employment) are from https://zenodo.org/records/8037156:
1. Verduzco Torres, J. R., & McArthur, D. P. (2024). Public transport accessibility indicators to urban and regional services in Great Britain. Scientific Data, 11(1), Article 1. https://doi.org/10.1038/s41597-023-02890-w
2. Verduzco Torres, J. R., & McArthur, D. (2022). Public Transport Accessibility Indicators for Great Britain [dataset]. Zenodo. https://doi.org/10.5281/zenodo.8037156


@article{VerduzcoTorres2024,
  title = {Public Transport Accessibility Indicators to Urban and Regional Services in {{Great Britain}}},
  author = {Verduzco Torres, J. Rafael and McArthur, David Philip},
  year = {2024},
  month = jan,
  journal = {Scientific Data},
  volume = {11},
  number = {1},
  pages = {53},
  publisher = {{Nature Publishing Group}},
  doi = {10.1038/s41597-023-02890-w},
  urldate = {2024-01-15},
 }

@misc{VerduzcoTorres2022a,
	title = {Public {Transport} {Accessibility} {Indicators} for {Great} {Britain}},
	url = {https://zenodo.org/record/8037156},
	doi = {10.5281/zenodo.8037156},
	publisher = {Zenodo},
	author = {Verduzco Torres, J. Rafael and McArthur, David},
	month = jun,
	year = {2022},
	keywords = {accessibility, employment, public transport, education services, publich health services, urban services},
}

Layer details

| layer                | mcda field              | explanation                                                                     |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| population_density   | pop_density             | population density                                                              |
| car_ownership        | one_car                 | households with at least one car                                                |
| deprived_households  | deprived_two            | households with two deprivations or more                                        |
| access_employment    | employment_30           | Number of employment facilities accessible from 30 minutes on public transport  |
| access_supermarket   | supermarket_30          | Number of supermarket facilities accessible from 30 minutes on public transport |
| transport_emission   | road_2025               | All road CO2 tonnes/year emission by 2025                                       |
| secondary_substation | demand_headroom         | Available demand headroom                                                       |
| traffic_index        | motorized_traffic_index | Observed annual traffic count in road segments, normalised from 0 to 100        |
| existing_evcp        | max_minutes             | Driving distance to nearest existing public EVCP                                |

demand headroom is translated from UKPN's Secondary Substation data:

|Band|Meaning|
|---|---|
|0–20%|almost full|
|20–40%|constrained|
|40–60%|moderate|
|60–80%|good|
|80–100%|very good|
