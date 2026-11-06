# Facts and Sources - Sky Gateway Hyderabad

Maintained by A1 (Research). Machine-readable source of truth: `src/data/facts.json` (read via `fact(key)`). Last verification pass: 2026-11-06.

## Method and limits

* Direct page fetches to en.wikipedia.org, skyvector.com, airport-data.com, thenews.com.pk and pmi.org failed in the build sandbox (hosts not on the network allow-list). Facts were therefore checked through web-search result snippets of those pages plus mirrors and corroborating outlets. Each entry records the URL that supplied the information. Where only a snippet was seen, confidence is capped at "medium" unless several independent sources agree.
* The PAA eAIP (June 2025) that Wikipedia cites for runway data was not opened.
* Not verified (shown as `low` with a note, or omitted): runway surface, exact elevation, Hyderabad-specific land-ownership dispute, PAPI/ILS basics, ISO 21502 / PRINCE2 / APM BoK / IPMA ICB details, code-4E runway width of 45 m, runway strip dimensions.
* A figure of "1,473 acres" appeared in one search summary but could not be corroborated; it is deliberately NOT in facts.json.

## Conflicts

* Elevation: Wikipedia 135 ft; SkyVector 145 ft (airport) with runway ends 145 ft (02) / 130 ft (20); Great Circle Mapper and metarcentral 130 ft; airfield.directory 121 ft. The UI should say "about 130-145 ft" (`airport.elevationRange`).
* Surface: asphalt (Wikipedia, acukwik) vs concrete (airport-data.com).
* Reopening date: 19 August 2008 (Wikipedia) vs a planned 3 August 2008 (Dawn).
* Operational status: Wikipedia shows closed since 2013; one aggregator says operational. The News (Oct 2026) confirms no commercial flights for 13 years.
* Hottest month: June (about 40 C, WorldClim) vs May (41.3 C) in different third-party sources.
* Climate class: BWh (Wikipedia) vs semi-arid (BSh) in the same article text.
* Source discrepancy on PAA: one Wikipedia article calls it a regulator; news reports (Profit, ProPakistani) say PAA operates airports and PCAA regulates.
* PMBOK 8 domain names come from third-party summaries; the 7th edition used a different set of eight domains - UI chips using old names must be updated.

## Fact table

| Key | Value | Source | Retrieved | Conf. | Notes |
|---|---|---|---|---|---|
| `airport.name` | Hyderabad Airport | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | high | Verified via search-result snippets (direct page fetch blocked by sandbox network). |
| `airport.city` | Hyderabad, Sindh, Pakistan | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | high |  |
| `airport.iata` | HDD | https://airport-data.com/world-airports/OPKD-HDD | 2026-11-06 | high | Also listed on Wikipedia, Great Circle Mapper and other aggregators. |
| `airport.icao` | OPKD | https://skyvector.com/node/53466 | 2026-11-06 | high | Also airport-data.com (OPKD-HDD). |
| `airport.type` | Domestic airport | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | high | Listed as a domestic airport; no scheduled commercial service since 2013 (see history.lastFlight2013). |
| `airport.lat` | 25.318 | https://airport-data.com/world-airports/OPKD-HDD | 2026-11-06 | high | Aggregators give 25.3181 / 68.3661 (25°19'05"N 68°21'59"E). |
| `airport.lon` | 68.366 | https://airport-data.com/world-airports/OPKD-HDD | 2026-11-06 | high |  |
| `airport.elevation` | ≈ 41 m / 135 ft | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | low | Published values conflict: Wikipedia 135 ft; SkyVector 145 ft (airport) with runway ends 145 ft (RWY 02) and 130 ft (RWY 20); Great Circle Mapper / metarcentral 130 ft; airfield.directory 121 ft. eAIP value not seen. Display as approximate (130-145 ft). |
| `airport.elevationRange` | ≈ 130-145 ft (≈ 40-44 m) above mean sea level; sources differ | https://skyvector.com/node/53466 | 2026-11-06 | medium | Use this wording where a range is acceptable. SkyVector: airport 145 ft; runway ends 145 / 130 ft. |
| `airport.timezone` | UTC+5 (Asia/Karachi) | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | medium | Pakistan Standard Time, UTC+5. Not re-fetched in this pass; general knowledge. |
| `airport.climate` | Hot desert / semi-arid climate (Köppen BWh per Wikipedia) | https://en.wikipedia.org/wiki/Climate_of_Hyderabad,_Sindh | 2026-11-06 | medium | Wikipedia's climate article describes the climate as semi-arid with very low rainfall; BWh vs BSh classification varies by dataset. |
| `runway.designators` | 02/20 | https://skyvector.com/node/53466 | 2026-11-06 | high | All aggregators agree on a single runway 02/20. |
| `runway.length` | 2,133 m (6,998 ft) | https://airport-data.com/world-airports/OPKD-HDD | 2026-11-06 | high | airport-data.com, SkyVector and other aggregators agree; Wikipedia reportedly cites the PAA eAIP (June 2025) - eAIP itself not opened. |
| `runway.width` | 30 m (98 ft) | https://airport-data.com/world-airports/OPKD-HDD | 2026-11-06 | high | Aggregators: 98 ft / 29.9 m. |
| `runway.surface` | Asphalt (one aggregator lists concrete) | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | low | Wikipedia and Aviation Weather (acukwik) list asphalt; airport-data.com lists concrete. Do not display as certain. |
| `runway.threshold02` | N25°18.57′ E68°21.70′ | https://skyvector.com/node/53466 | 2026-11-06 | high | SkyVector runway-end coordinates as seen in search snippet. |
| `runway.threshold20` | N25°19.61′ E68°22.25′ | https://skyvector.com/node/53466 | 2026-11-06 | high |  |
| `runway.derivedLength` | ≈ 2,136 m between the two published thresholds (published length 2,133 m) | computed from runway.threshold02 and runway.threshold20 | 2026-11-06 | high | Great-circle distance, spherical Earth R=6,371.0088 km. 0.01' rounding = about 18 m, so agreement with 2,133 m is within coordinate precision. See docs/FACTS_AND_SOURCES.md. |
| `runway.derivedBearing` | ≈ 25.5° true (RWY 02 end towards RWY 20 end); reciprocal ≈ 205.5° | computed from runway.threshold02 and runway.threshold20 | 2026-11-06 | high | Initial great-circle bearing 25.55°. Runway numbers 02/20 are magnetic (~20°), so a ~5° difference is expected from magnetic variation. |
| `history.closed1998` | Closed to commercial traffic in 1998 (for about ten years) | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | medium | Wikipedia; ARY News 2022 report also says closed in 1998 for ten years. |
| `history.reopened2008` | Reopened to commercial flights in August 2008 with PIA (19 August 2008 per Wikipedia) | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | medium | Dawn reported an earlier planned reopening of 3 August 2008 (https://www.dawn.com/news/312232), so the start date shifted; use 'August 2008' unless the exact date matters. |
| `history.lastFlight2013` | Last commercial flight (PIA) in 2013; no scheduled commercial service since | https://www.thenews.pk/print/1440954-hyderabad-airport-set-for-revival-after-13-years | 2026-11-06 | high | The News (4 Oct 2026) and Wikipedia agree on 2013. Exact month not found. |
| `history.closedPeriod` | About 13 years without commercial flights (2013 to 2026) | https://www.thenews.pk/print/1440954-hyderabad-airport-set-for-revival-after-13-years | 2026-11-06 | medium | Headline of The News piece: 'set for revival after 13 years'. |
| `revival.proposal` | Proposed revival: runway extension from ~7,000 ft to ~11,500 ft for Boeing 777-class aircraft, with improved passenger facilities (proposed, per press reports) | https://www.thenews.pk/print/1440954-hyderabad-airport-set-for-revival-after-13-years | 2026-11-06 | medium | The News, 4 Oct 2026, citing unnamed PAA sources; corroborated by techjuice.pk and thepakistanconnect.com. A proposal, not an approved/funded project; no formal PAA statement seen. Which runway end would be extended is NOT stated - the game chooses one (simulated). |
| `revival.proposalDate` | 4 October 2026 (The News) | https://www.thenews.pk/print/1440954-hyderabad-airport-set-for-revival-after-13-years | 2026-11-06 | medium | Date taken from the search summary of the article; page itself not opened. |
| `revival.uses` | Developed as an alternate airport for Karachi, Sukkur and Nawabshah in case of emergencies or adverse weather (diversions); stakeholders likely to be consulted on regional flights (proposed, per press reports) | https://www.thenews.pk/print/1440954-hyderabad-airport-set-for-revival-after-13-years | 2026-11-06 | medium | Per sources in PAA quoted by The News. |
| `revival.stakeholderMeeting` | Sindh Chief Minister and a PAA delegation reviewed Sukkur, Karachi and Hyderabad airport projects (Sept 2026); CM assured full cooperation | https://radio.gov.pk/19-09-2026/cm-murad-assures-paa-of-full-cooperation-for-aviation-projects | 2026-11-06 | medium | Radio Pakistan; page date shows 19/20 Sept 2026 - verify before quoting a day. |
| `constraints.encroachment` | Land encroachment around the airport is reported as a constraint | https://gulfnews.com/world/asia/pakistan/pakistan-federal-sindh-governments-join-hands-to-make-3-airports-fully-functional-1.88852571 | 2026-11-06 | medium | Gulf News: federal aviation minister was told encroachments were the main reason Hyderabad airport was not functional; Sindh minister said they could be sorted out soon. Report is from a 2022 meeting (date inferred ~25 June 2022 from a Tribune report of the same meeting). Not confirmed in the retrieved snippets of The News 2026 article. |
| `constraints.landOwnership` | Disputes over land ownership between aviation and provincial authorities have been reported for Sindh airport land | https://gulfnews.com/world/asia/pakistan/pakistan-federal-sindh-governments-join-hands-to-make-3-airports-fully-functional-1.88852571 | 2026-11-06 | low | Gulf News reports a CAA land-ownership claim only for ~80 acres near Karachi airport. A Hyderabad-specific ownership dispute was NOT confirmed in retrieved snippets; a '1,473 acres' figure surfaced in one search summary and could not be corroborated - not used. |
| `governance.federalSindhAgreement` | Federal and Sindh governments agreed to work to make three Sindh airports (Sehwan Sharif, Hyderabad, Thar) fully functional; a technical committee was to survey them | https://gulfnews.com/world/asia/pakistan/pakistan-federal-sindh-governments-join-hands-to-make-3-airports-fully-functional-1.88852571 | 2026-11-06 | medium | Gulf News; meeting c. June 2022 (date inferred, not shown in snippet). |
| `org.operator` | Pakistan Airports Authority (PAA) | https://en.wikipedia.org/wiki/Hyderabad_Airport_(Sindh) | 2026-11-06 | high | Also named as the body reviving the airport in The News (Oct 2026). |
| `org.regulator` | Pakistan Civil Aviation Authority (PCAA) | https://profit.pakistantoday.com.pk/2024/08/13/civil-aviation-authority-reorganised-into-three-separate-entities/ | 2026-11-06 | high | From 2024 the PCAA keeps regulatory functions. |
| `org.split2024` | PAA Act 2023; from 9 August 2024 the former CAA was reorganised into the PCAA (regulator), the Pakistan Airports Authority (airport operator) and a Bureau of Aircraft Safety Investigation | https://profit.pakistantoday.com.pk/2024/08/13/civil-aviation-authority-reorganised-into-three-separate-entities/ | 2026-11-06 | medium | Profit / ProPakistani reports; the 9 Aug 2024 effective date is from one aggregated summary. |
| `city.population2023` | Hyderabad city: 1,921,275 (2023 census); district 2,432,540; second-largest city in Sindh | https://en.wikipedia.org/wiki/List_of_cities_in_Sindh_by_population | 2026-11-06 | medium | Boundary-dependent: citypopulation.de lists the 'Hyderabad City' taluka at 778,132. PBS tables: https://www.pbs.gov.pk/sites/default/files/population/2023/tables/table_2_sindh_districts.pdf. Say 'about 1.9 million (2023 census, urban agglomeration)'. |
| `city.distanceKarachi` | ≈ 136 km by the M-9 Karachi-Hyderabad Motorway (older Super Highway ≈ 160 km) | https://en.wikipedia.org/wiki/M-9_motorway_(Pakistan) | 2026-11-06 | high | Wikipedia and AARoads give 136 km for the M-9; the 160 km figure is the older Super Highway. |
| `city.mehran` | 'Mehran' is a local Sindhi name for the Indus River, and a poetic name for Sindh | https://en.wikipedia.org/wiki/Mehran | 2026-11-06 | medium | Wikipedia 'Mehran' / Indus River pages. Burnes (1835) said the name was little used by natives, so the AI assistant's name 'Mehran' is a cultural allusion, not an official term. |
| `climate.recordHighMayJun` | Record highs: 49.5 °C (May) and 48.5 °C (June) | https://en.wikipedia.org/wiki/Climate_of_Hyderabad,_Sindh | 2026-11-06 | medium | Wikipedia climate table (read via a mirror snippet); station/period not confirmed. |
| `climate.typicalSummerHigh` | Mean daily maximum in the hottest months (May-June) is roughly 40-41 °C | https://www.climate-zone.com/climate/pakistan/celsius/hyderabad-airport.htm | 2026-11-06 | low | Third-party sources disagree (June ≈ 40 °C WorldClim; May 41.3 °C elsewhere). PMD normals not retrieved. |
| `climate.monsoon` | Monsoon rain mainly July-September; traditional onset around mid-July, recently sometimes a month earlier | https://tribune.com.pk/story/2305579/wet-spell-expected | 2026-11-06 | medium | Express Tribune. Monsoon is the main rainy season; remainder of year is very dry. |
| `climate.monsoonRainfall` | Average monsoon rainfall ≈ 205 mm | https://en.wikipedia.org/wiki/Climate_of_Hyderabad,_Sindh | 2026-11-06 | low | From Wikipedia snippet; period not stated. |
| `climate.dust` | Dust and thunderstorms can occur in the pre-monsoon period; e.g. a July 2025 storm hit Hyderabad with ~42 knot winds | https://www.dawn.com/news/1924210 | 2026-11-06 | low | Seasonality not established: Wikipedia says dust storms are rare in May-June; Dawn reports one preceding monsoon rain in 2025. |
| `aviation.codeE` | ICAO Aerodrome Reference Code letter E = aeroplane wingspan from 52 m up to but not including 65 m (Boeing 777 is code E) | https://skybrary.aero/articles/icao-aerodrome-reference-code | 2026-11-06 | medium | Wingspan alone defines the letter since Annex 14 Amendment 14 (outer main gear wheel span handled separately). Boeing 777 = code E: general knowledge, not confirmed in the retrieved snippets. |
| `aviation.runwayWidthE` | Minimum runway width for code 4E is 45 m | https://www.icao.int/ | 2026-11-06 | low | Annex 14 Vol I Table 3-1 (4E = 45 m) is from training knowledge; NOT confirmed in retrieved snippets - verify against the current Annex 14. Current runway width 30 m (code 4C/D range is 30/45 m). |
| `aviation.resa` | Runway End Safety Area (RESA): at least 90 m, recommended 240 m for code 3/4 runways | https://www.icao.int:443/NACC/Documents/Meetings/2016/ACI/D1-05-RESA.pdf | 2026-11-06 | medium | ICAO NACC paper. |
| `aviation.strip` | Runway strip extends at least 60 m beyond each runway end (instrument runways) | https://www.icao.int/ | 2026-11-06 | low | From an FAA/ICAO presentation snippet; check Annex 14 §3.4. |
| `aviation.papi` | PAPI (Precision Approach Path Indicator): lights showing red/white to indicate position relative to the approach slope; typical slope 3° | https://www.icao.int/ | 2026-11-06 | low | General aviation knowledge; not source-verified this pass. |
| `aviation.ils` | ILS (Instrument Landing System): localiser gives lateral guidance, glide slope gives vertical guidance (typically 3°); categories I-III differ by decision height and RVR | https://www.icao.int/ | 2026-11-06 | low | General aviation knowledge (ICAO Annex 10); not source-verified this pass. |
| `pm.pmbok8.edition` | PMBOK Guide, Eighth Edition (PMI), published November 2025 | https://www.pmi.org/pmbok-guide-standards/foundational/PMBOK | 2026-11-06 | medium | PMI page plus Learning Tree / PM Study Circle summaries. |
| `pm.pmbok8.principles` | Six principles: holistic view; value focus; embedded quality; accountable leadership; sustainability integration; empowered teams | https://www.pmi.org/pmbok-guide-standards/foundational/PMBOK | 2026-11-06 | medium | From PMI (Spanish page) snippet; 7th edition had 12 principles. |
| `pm.pmbok8.domains` | Seven performance domains: Governance, Scope, Schedule, Finance, Stakeholders, Resources, Risk | https://www.pmi.org/pmbok-guide-standards/foundational/PMBOK | 2026-11-06 | medium | Per third-party summaries (Learning Tree, 4PMTI, PM Study Circle); 7th edition had eight different domains (Stakeholder, Team, Development Approach & Life Cycle, Planning, Project Work, Delivery, Measurement, Uncertainty). Check the book before quoting. |
| `pm.pmbok8.processes` | 40 processes organised in five focus areas | https://www.pmi.org/pmbok-guide-standards/foundational/PMBOK | 2026-11-06 | medium | Focus-area names not retrieved - do not display them. |
| `pm.iso21502` | ISO 21502: Project, programme and portfolio management - Guidance on project management (2020) | https://www.iso.org/ | 2026-11-06 | low | From training knowledge; not source-verified this pass. |
| `pm.prince2` | PRINCE2 (7th edition, 2023): principles, people, practices, processes; stage-gated, 'management by exception' | https://www.axelos.com/ | 2026-11-06 | low | From training knowledge; not source-verified this pass. |
| `pm.apmbok` | APM Body of Knowledge, 7th edition (2019) | https://www.apm.org.uk/ | 2026-11-06 | low | From training knowledge; not source-verified this pass. |
| `pm.ipmaICB` | IPMA Individual Competence Baseline (ICB4): people, practice and perspective competence areas | https://www.ipma.world/ | 2026-11-06 | low | From training knowledge; not source-verified this pass. |

## Simulated vs real policy

Real-world facts are only those in the table above and appear in the UI through `fact(key)`, with source and confidence available through `factSource(key)`. Everything else is invented for teaching and must be labelled "Simulated scenario data" (`SIM_LABEL` / the simulated badge).

Invented by the game (always simulated):

* All budgets, costs, contingency reserves, funding sources and exchange rates.
* All durations, start/finish dates, the project calendar and the critical path.
* Vendors, contractors, consultants, suppliers and contract terms.
* Airlines, flight schedules, aircraft movements, passenger and worker crowds, worker and staff names.
* Random events, decision events, weather draws, incidents, risks and their probabilities.
* The masterplan layout (terminal, apron, tower, landside, roads), including which end of runway 02/20 is extended and by how much of the proposed 11,500 ft. The press reports state a target length only, not the direction.
* AI assistant "Mehran" answers and scores, quiz content and course-week mapping.
* Stakeholder positions, power/interest ratings and satisfaction numbers.

Labelling: simulated panels show the simulated badge; real facts show a source chip; where a real proposal is described it is phrased as "proposed, per press reports"; any low-confidence fact must carry a caveat or be hidden.

## Runway geometry derivation

Published thresholds (SkyVector): RWY 02 N25 18.57' E68 21.70' = (25.30950, 68.36167); RWY 20 N25 19.61' E68 22.25' = (25.32683, 68.37083). Midpoint = (25.31817, 68.36625), matching the aerodrome reference point (25.3181, 68.3661).

* Distance: haversine on a sphere of radius 6,371,008.8 m gives 2,136 m (7,009 ft). The published runway length is 2,133 m (6,998 ft); the 3 m difference is below the precision of coordinates rounded to 0.01' (about 18 m). The game uses 2,133 m for the length and the thresholds for placement (`runway.derivedLength`).
* True bearing RWY 02 end to RWY 20 end: atan2(sin dLon cos lat2, cos lat1 sin lat2 - sin lat1 cos lat2 cos dLon) = 25.55 degrees; reciprocal 205.55 degrees (`runway.derivedBearing`). Runway designators 02/20 are rounded magnetic headings (about 20 degrees), so a ~5 degree gap between true and magnetic is expected for Sindh.
* Rendering rule: lay the 2,133 m by 30 m runway along the 25.55 degree true axis through the midpoint above.
