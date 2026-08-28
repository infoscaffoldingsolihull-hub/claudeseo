/**
 * The rate card and the bill of quantities, in Pakistani Rupees.
 *
 * IMPORTANT — these rates are ILLUSTRATIVE.  They are a coherent, internally
 * consistent cost model calibrated to the general shape of high-end
 * residential construction in Lahore in 2025-26, but they are NOT a verified
 * quotation.  Cement, steel and imported-fitting prices in Pakistan move with
 * commodity and exchange-rate conditions.  Every number lives in this one
 * file precisely so it can be replaced with a current local quotation without
 * touching a line of application code, and the user interface says so.
 *
 * Cost flows one way and one way only:
 *
 *     RATES  ×  quantity   →   BOQ line   →   work package   →   control
 *                                                                account
 *                                                            →   project
 *                                                                budget
 *
 * The project budget is *derived* by summing the bill of quantities rather
 * than authored separately, so the cost panel can never disagree with the
 * bill of quantities: they are the same number computed once.
 */

/**
 * unit  — the unit of measure the rate is quoted in
 * pkr   — rate per unit, in Pakistani Rupees
 * note  — provenance / specification, shown in the inspect card
 */
export const RATES = {
  /* ---------------------------------------------------------- earthworks -- */
  'earth.excavate': { unit: 'm³', pkr: 420, note: 'Machine excavation incl. disposal within 15 km' },
  'earth.backfill': { unit: 'm³', pkr: 310, note: 'Compacted granular backfill in 200 mm layers' },
  'earth.antitermite': { unit: 'm²', pkr: 340, note: 'Chlorpyrifos 1% soil treatment, 10-year warranty' },
  'earth.levelling': { unit: 'm²', pkr: 180, note: 'Site clearance, grubbing and rough levelling' },

  /* ------------------------------------------------------------- concrete -- */
  'conc.pcc': { unit: 'm³', pkr: 12500, note: 'PCC 1:4:8 blinding, 75 mm' },
  'conc.raft': { unit: 'm³', pkr: 38000, note: 'RCC 4000 psi raft incl. steel, formwork and pour' },
  'conc.column': { unit: 'm³', pkr: 46000, note: 'RCC 4000 psi columns incl. steel and shuttering' },
  'conc.slab': { unit: 'm³', pkr: 42000, note: 'RCC 4000 psi suspended slab and beams' },
  'conc.stair': { unit: 'm³', pkr: 49000, note: 'RCC stair flights and landings, incl. formwork' },
  'conc.retaining': { unit: 'm³', pkr: 44000, note: 'RCC basement retaining wall, 300 mm' },

  /* -------------------------------------------------------------- masonry -- */
  'mas.block9': { unit: 'm²', pkr: 3900, note: '230 mm burnt-brick masonry in 1:5 cement mortar' },
  'mas.block4': { unit: 'm²', pkr: 2600, note: '115 mm partition masonry in 1:4 cement mortar' },
  'mas.boundary': { unit: 'm', pkr: 9800, note: 'Boundary wall 2.4 m, brick with plaster and coping' },
  'mas.parapet': { unit: 'm', pkr: 6400, note: 'Roof parapet 1.1 m with moulded stone coping' },

  /* ------------------------------------------------------------ finishing -- */
  'fin.plaster.int': { unit: 'm²', pkr: 1150, note: 'Two-coat internal cement plaster, 12 mm' },
  'fin.plaster.ext': { unit: 'm²', pkr: 1450, note: 'Weather-coat external plaster, 20 mm' },
  'fin.screed': { unit: 'm²', pkr: 890, note: 'Levelling screed, 50 mm, power-floated' },
  'fin.paint.emulsion': { unit: 'm²', pkr: 1250, note: 'Sealer plus three coats premium acrylic emulsion' },
  'fin.paint.enamel': { unit: 'm²', pkr: 1680, note: 'Primer plus two coats polyurethane enamel' },
  'fin.ceiling.gypsum': { unit: 'm²', pkr: 4800, note: 'Suspended gypsum ceiling with cove and shadow gap' },
  'fin.cornice.plaster': { unit: 'm', pkr: 3200, note: 'Run-in-situ plaster cornice, classical profile' },
  'fin.panel.wood': { unit: 'm²', pkr: 21500, note: 'Veneered MDF wall panelling, polished' },
  'fin.wallpaper': { unit: 'm²', pkr: 5400, note: 'Imported non-woven wallpaper, hung' },

  /* ---------------------------------------------------------------- stone -- */
  'stone.marble.import': { unit: 'm²', pkr: 26000, note: 'Italian Botticino marble, 20 mm, honed and sealed' },
  'stone.marble.local': { unit: 'm²', pkr: 9500, note: 'Ziarat White marble, 18 mm, polished' },
  'stone.facade': { unit: 'm²', pkr: 14500, note: 'Sandstone façade cladding, dry-fixed on SS anchors' },
  'stone.column': { unit: 'each', pkr: 465000, note: 'Carved stone Corinthian column, 4.6 m, incl. base and capital' },
  'stone.balustrade': { unit: 'm', pkr: 28000, note: 'Turned stone balustrade with moulded handrail' },
  'stone.pediment': { unit: 'lot', pkr: 3850000, note: 'Carved pediment, tympanum relief and entablature' },
  'stone.dome': { unit: 'lot', pkr: 7400000, note: 'Cupola drum, ribbed dome and finial' },

  /* ------------------------------------------------------------- flooring -- */
  'floor.wood': { unit: 'm²', pkr: 18000, note: 'Engineered oak plank, 15 mm, glued on screed' },
  'floor.tile': { unit: 'm²', pkr: 7200, note: 'Porcelain tile 800×800, rectified, epoxy grout' },
  'floor.carpet': { unit: 'm²', pkr: 11500, note: 'Wool-blend broadloom on underlay' },
  'floor.epoxy': { unit: 'm²', pkr: 3400, note: 'Self-levelling epoxy, plant and store areas' },
  'floor.skirting': { unit: 'm', pkr: 2450, note: 'Marble or polished timber skirting, 100 mm' },

  /* --------------------------------------------------------------- joinery -- */
  'door.main': { unit: 'each', pkr: 1850000, note: 'Carved teak double-leaf entrance door, brass furniture' },
  'door.internal': { unit: 'each', pkr: 165000, note: 'Solid-core flush door, veneered, with ironmongery' },
  'door.premium': { unit: 'each', pkr: 320000, note: 'Panelled hardwood door, moulded architrave' },
  'door.french': { unit: 'each', pkr: 540000, note: 'Double-glazed hardwood French door set' },
  'door.garage': { unit: 'each', pkr: 985000, note: 'Insulated sectional garage door with remote operator' },
  'door.fire': { unit: 'each', pkr: 240000, note: '60-minute fire-rated door with closer' },
  'joinery.wardrobe': { unit: 'each', pkr: 385000, note: 'Built-in wardrobe, veneered, soft-close, internal lighting' },
  'joinery.library': { unit: 'lot', pkr: 3250000, note: 'Floor-to-ceiling library joinery with ladder rail' },
  'joinery.stair': { unit: 'm', pkr: 42000, note: 'Hardwood stair cladding, treads, risers and stringer' },

  /* -------------------------------------------------------------- glazing -- */
  'glaz.window': { unit: 'm²', pkr: 42000, note: 'uPVC double-glazed casement, 24 mm argon-filled unit' },
  'glaz.window.arch': { unit: 'm²', pkr: 58000, note: 'Arched timber-clad double-glazed window, custom' },
  'glaz.balustrade': { unit: 'm', pkr: 34000, note: '12 mm toughened glass balustrade, SS handrail' },
  'glaz.skylight': { unit: 'm²', pkr: 68000, note: 'Laminated double-glazed skylight over the foyer' },
  'metal.railing': { unit: 'm', pkr: 48000, note: 'Hand-forged wrought-iron railing, powder-coated' },

  /* ------------------------------------------------------------------ MEP -- */
  'mep.elec.point': { unit: 'point', pkr: 4800, note: 'Wiring point in conduit, incl. accessory' },
  'mep.plumb.point': { unit: 'point', pkr: 9500, note: 'Hot and cold plumbing point in PPR-C' },
  'mep.drain': { unit: 'm', pkr: 3800, note: 'uPVC soil and waste drainage with fittings' },
  'mep.hvac.ton': { unit: 'ton', pkr: 385000, note: 'VRF indoor unit, ducting, diffusers and controls' },
  'mep.hvac.outdoor': { unit: 'each', pkr: 2650000, note: 'VRF outdoor condensing unit, 20 ton' },
  'mep.fire': { unit: 'm²', pkr: 1850, note: 'Sprinkler, detection and alarm coverage' },
  'mep.lv': { unit: 'point', pkr: 7400, note: 'Data, CCTV, intercom and automation point' },
  'mep.db': { unit: 'each', pkr: 285000, note: 'Distribution board with MCB/RCD protection' },
  'mep.solar': { unit: 'kW', pkr: 165000, note: 'Rooftop PV with hybrid inverter and mounting' },
  'mep.battery': { unit: 'kWh', pkr: 78000, note: 'Lithium storage bank with BMS' },
  'mep.generator': { unit: 'kVA', pkr: 22000, note: 'Diesel generator in acoustic canopy with ATS' },
  'mep.ufilter': { unit: 'lot', pkr: 1450000, note: 'Whole-house water filtration and softening plant' },
  'mep.lift': { unit: 'each', pkr: 6800000, note: 'Three-stop home lift, machine-room-less' },
  'mep.tank.under': { unit: 'lot', pkr: 1250000, note: 'Underground water tank, 45,000 litres, lined' },

  /* ---------------------------------------------------------------- baths -- */
  'bath.master': { unit: 'lot', pkr: 2850000, note: 'Imported sanitaryware, freestanding tub, marble vanity' },
  'bath.standard': { unit: 'lot', pkr: 1150000, note: 'Sanitaryware, shower enclosure and vanity' },
  'bath.powder': { unit: 'lot', pkr: 620000, note: 'Powder room: vessel basin, WC and mirror' },

  /* -------------------------------------------------------------- kitchen -- */
  'kit.modular': { unit: 'lot', pkr: 8500000, note: 'German modular kitchen, quartz tops, island' },
  'kit.appliance': { unit: 'lot', pkr: 4650000, note: 'Built-in oven, hob, hood, dishwasher, refrigeration' },
  'kit.pantry': { unit: 'lot', pkr: 1850000, note: 'Working pantry: units, sink and shelving' },

  /* ------------------------------------------------------------- lighting -- */
  'light.chandelier.grand': { unit: 'each', pkr: 3200000, note: 'Hand-cut crystal chandelier, 1.6 m, foyer' },
  'light.chandelier.room': { unit: 'each', pkr: 480000, note: 'Crystal chandelier, 0.8 m, reception rooms' },
  'light.recessed': { unit: 'each', pkr: 6500, note: 'Dimmable COB downlight, 90 CRI' },
  'light.wall': { unit: 'each', pkr: 34000, note: 'Brass wall sconce, antique finish' },
  'light.pendant': { unit: 'each', pkr: 78000, note: 'Designer pendant over island or stair' },
  'light.external': { unit: 'each', pkr: 26000, note: 'IP65 façade uplight or bollard' },

  /* ------------------------------------------------------------ furniture -- */
  'furn.majlis': { unit: 'lot', pkr: 9800000, note: 'Formal majlis: seating, consoles, occasional tables' },
  'furn.living': { unit: 'lot', pkr: 6400000, note: 'Family lounge: sectional, media wall, tables' },
  'furn.dining': { unit: 'lot', pkr: 4850000, note: 'Twelve-seat dining suite with buffet' },
  'furn.master': { unit: 'lot', pkr: 5200000, note: 'Master suite: bed, seating, dressing furniture' },
  'furn.bedroom': { unit: 'lot', pkr: 1950000, note: 'Bedroom: bed, side tables, desk, seating' },
  'furn.office': { unit: 'lot', pkr: 2450000, note: 'Study: desk, chair, reading seating' },
  'furn.outdoor': { unit: 'lot', pkr: 2850000, note: 'Terrace and poolside furniture, all-weather' },
  'furn.rug': { unit: 'each', pkr: 1250000, note: 'Hand-knotted silk-wool carpet' },
  'furn.art': { unit: 'lot', pkr: 6500000, note: 'Commissioned art, mirrors and objets' },
  'furn.drapery': { unit: 'm²', pkr: 8400, note: 'Lined drapery on motorised track' },

  /* ----------------------------------------------------------- specialist -- */
  'spec.theatre': { unit: 'lot', pkr: 12500000, note: 'Home cinema: 4K laser projector, Atmos, acoustics, seating' },
  'spec.gym': { unit: 'lot', pkr: 6500000, note: 'Gym equipment, mirrored wall and rubber flooring' },
  'spec.sauna': { unit: 'lot', pkr: 3200000, note: 'Cedar sauna cabin with heater and controls' },
  'spec.automation': { unit: 'lot', pkr: 5800000, note: 'Whole-home automation: lighting, HVAC, scenes, app' },
  'spec.security': { unit: 'lot', pkr: 3400000, note: '32-camera NVR, access control and perimeter beams' },

  /* ------------------------------------------------------- external works -- */
  'ext.driveway': { unit: 'm²', pkr: 4200, note: 'Interlocking paver driveway on compacted base' },
  'ext.pool': { unit: 'm³', pkr: 78000, note: 'RCC pool shell, tiling, filtration and heating' },
  'ext.pooldeck': { unit: 'm²', pkr: 9800, note: 'Anti-slip stone pool deck with coping' },
  'ext.fountain': { unit: 'each', pkr: 1650000, note: 'Carved stone fountain with pump and lighting' },
  'ext.lawn': { unit: 'm²', pkr: 1450, note: 'Topsoil, levelling and turf' },
  'ext.planting': { unit: 'm²', pkr: 2650, note: 'Shrub and ground-cover planting beds' },
  'ext.tree': { unit: 'each', pkr: 32000, note: 'Semi-mature specimen tree, staked and irrigated' },
  'ext.irrigation': { unit: 'm²', pkr: 780, note: 'Automatic pop-up irrigation with controller' },
  'ext.gate': { unit: 'each', pkr: 2400000, note: 'Wrought-iron motorised main gate with intercom' },
  'ext.guardpost': { unit: 'each', pkr: 850000, note: 'Guard cabin with WC and monitoring desk' },

  /* --------------------------------------------------------- preliminaries -- */
  'prelim.survey': { unit: 'lot', pkr: 650000, note: 'Topographic survey and geotechnical investigation' },
  'prelim.design': { unit: 'lot', pkr: 9500000, note: 'Architecture, structure, MEP and interior design fees' },
  'prelim.approval': { unit: 'lot', pkr: 2850000, note: 'LDA approval, utility NOCs and statutory fees' },
  'prelim.office': { unit: 'month', pkr: 285000, note: 'Site office, store, welfare and temporary utilities' },
  'prelim.crane': { unit: 'month', pkr: 850000, note: 'Tower crane hire, erection and dismantling amortised' },
  'prelim.scaffold': { unit: 'm²', pkr: 1240, note: 'Scaffold hire and erection over the contract' },
  'prelim.insurance': { unit: 'lot', pkr: 3200000, note: "Contractor's all-risk and third-party insurance" },
  'prelim.supervision': { unit: 'month', pkr: 950000, note: 'Project manager, engineers and quantity surveyor' },

  /* ------------------------------------------------------------- handover -- */
  'hand.commission': { unit: 'lot', pkr: 1850000, note: 'MEP testing, balancing and commissioning' },
  'hand.snag': { unit: 'lot', pkr: 2400000, note: 'Snagging, rectification and defect close-out' },
  'hand.clean': { unit: 'lot', pkr: 680000, note: 'Builders clean and final presentation clean' },
  'hand.dossier': { unit: 'lot', pkr: 450000, note: 'As-built drawings, O&M manuals and warranties' },
};

/**
 * The bill of quantities.
 *
 *   id      — stable identifier; 3-D objects reference these to show a price
 *   pkg     — the work package that carries this cost (links to the WBS)
 *   rate    — key into RATES
 *   qty     — quantity in that rate's unit
 *   room    — optional room key, so cost can also be rolled up spatially
 *   label   — what a quantity surveyor would call this line
 */
export const BOQ = [
  /* ----------------------------------------------- CA-1  preliminaries ---- */
  { id: 'b.survey', pkg: 'P1', rate: 'prelim.survey', qty: 1, label: 'Topographic survey and soil investigation' },
  { id: 'b.design', pkg: 'P1', rate: 'prelim.design', qty: 1, label: 'Design and consultancy fees' },
  { id: 'b.approval', pkg: 'P5', rate: 'prelim.approval', qty: 1, label: 'Statutory approvals and utility NOCs' },
  { id: 'b.clear', pkg: 'P2', rate: 'earth.levelling', qty: 1011, label: 'Site clearance and rough levelling' },
  { id: 'b.office', pkg: 'P3', rate: 'prelim.office', qty: 18, label: 'Site establishment, 18 months' },
  { id: 'b.insurance', pkg: 'P3', rate: 'prelim.insurance', qty: 1, label: 'Insurances and bonds' },
  { id: 'b.supervision', pkg: 'P3', rate: 'prelim.supervision', qty: 18, label: 'Site supervision team, 18 months' },
  { id: 'b.boundary', pkg: 'P4', rate: 'mas.boundary', qty: 128, label: 'Boundary wall to the full perimeter' },
  { id: 'b.crane', pkg: 'P4', rate: 'prelim.crane', qty: 7, label: 'Tower crane, 7 months' },
  { id: 'b.scaffold', pkg: 'P4', rate: 'prelim.scaffold', qty: 1850, label: 'Scaffolding to all elevations' },

  /* ------------------------------------------------ CA-2  substructure ---- */
  { id: 'b.excavate', pkg: 'S1', rate: 'earth.excavate', qty: 1420, label: 'Bulk excavation for basement and footings' },
  { id: 'b.termite', pkg: 'S2', rate: 'earth.antitermite', qty: 372, label: 'Anti-termite soil treatment' },
  { id: 'b.pcc', pkg: 'S2', rate: 'conc.pcc', qty: 32, label: 'PCC blinding under raft' },
  { id: 'b.raft', pkg: 'S4', rate: 'conc.raft', qty: 186, label: 'RCC raft foundation, 500 mm' },
  { id: 'b.retain', pkg: 'S5', rate: 'conc.retaining', qty: 94, label: 'Basement retaining walls' },
  { id: 'b.tank', pkg: 'S5', rate: 'mep.tank.under', qty: 1, label: 'Underground water storage tank' },
  { id: 'b.wproof.base', pkg: 'S6', rate: 'stone.facade', qty: 0, label: '(reserved)' },
  { id: 'b.backfill', pkg: 'S6', rate: 'earth.backfill', qty: 640, label: 'Backfill and compaction to substructure' },
  { id: 'b.gfslab', pkg: 'S7', rate: 'conc.slab', qty: 82, label: 'Ground floor slab and grade beams' },

  /* ----------------------------------------------- CA-3  superstructure ---- */
  { id: 'b.col.gf', pkg: 'F1', rate: 'conc.column', qty: 46, label: 'Ground floor RCC columns' },
  { id: 'b.slab.ff', pkg: 'F2', rate: 'conc.slab', qty: 118, label: 'First floor slab and beams' },
  { id: 'b.col.ff', pkg: 'F3', rate: 'conc.column', qty: 41, label: 'First floor RCC columns' },
  { id: 'b.slab.rf', pkg: 'F4', rate: 'conc.slab', qty: 112, label: 'Roof slab and beams' },
  { id: 'b.stair', pkg: 'F5', rate: 'conc.stair', qty: 34, label: 'RCC staircases and landings' },
  { id: 'b.liftshaft', pkg: 'F5', rate: 'conc.retaining', qty: 18, label: 'Lift shaft walls' },
  { id: 'b.columns.stone', pkg: 'F6', rate: 'stone.column', qty: 8, label: 'Portico stone columns, Corinthian order' },
  { id: 'b.pediment', pkg: 'F6', rate: 'stone.pediment', qty: 1, label: 'Portico pediment and entablature' },
  { id: 'b.parapet', pkg: 'F7', rate: 'mas.parapet', qty: 96, label: 'Roof parapet with moulded coping' },
  { id: 'b.dome', pkg: 'F7', rate: 'stone.dome', qty: 1, label: 'Central cupola, dome and finial' },
  { id: 'b.balustrade.roof', pkg: 'F7', rate: 'stone.balustrade', qty: 62, label: 'Roof terrace stone balustrade' },

  /* ---------------------------------------------------- CA-4  envelope ---- */
  { id: 'b.mas.gf', pkg: 'E1', rate: 'mas.block9', qty: 486, label: 'Ground floor external and party masonry' },
  { id: 'b.mas.gf.int', pkg: 'E1', rate: 'mas.block4', qty: 318, label: 'Ground floor internal partitions' },
  { id: 'b.mas.ff', pkg: 'E2', rate: 'mas.block9', qty: 452, label: 'First floor external masonry' },
  { id: 'b.mas.ff.int', pkg: 'E2', rate: 'mas.block4', qty: 342, label: 'First floor internal partitions' },
  { id: 'b.roofwp', pkg: 'E3', rate: 'fin.plaster.ext', qty: 372, label: 'Roof waterproofing, insulation and screed to falls' },
  { id: 'b.facade', pkg: 'E4', rate: 'stone.facade', qty: 624, label: 'Sandstone façade cladding to all elevations' },
  { id: 'b.plaster.ext', pkg: 'E4', rate: 'fin.plaster.ext', qty: 340, label: 'External plaster to unclad elevations' },
  { id: 'b.cornice.ext', pkg: 'E5', rate: 'fin.cornice.plaster', qty: 184, label: 'External cornices, band courses and mouldings' },
  { id: 'b.balcony.bal', pkg: 'E5', rate: 'stone.balustrade', qty: 48, label: 'Balcony and terrace balustrades' },
  { id: 'b.win.gf', pkg: 'E6', rate: 'glaz.window', qty: 96, label: 'Ground floor double-glazed windows' },
  { id: 'b.win.ff', pkg: 'E6', rate: 'glaz.window', qty: 88, label: 'First floor double-glazed windows' },
  { id: 'b.win.arch', pkg: 'E6', rate: 'glaz.window.arch', qty: 34, label: 'Arched feature windows to the principal elevation' },
  { id: 'b.skylight', pkg: 'E6', rate: 'glaz.skylight', qty: 12, label: 'Foyer skylight over the double-height void' },
  { id: 'b.door.main', pkg: 'E7', rate: 'door.main', qty: 1, label: 'Carved teak main entrance door' },
  { id: 'b.door.french', pkg: 'E7', rate: 'door.french', qty: 6, label: 'French doors to terrace and garden' },
  { id: 'b.door.garage', pkg: 'E7', rate: 'door.garage', qty: 2, label: 'Sectional garage doors with operators' },
  { id: 'b.door.side', pkg: 'E7', rate: 'door.premium', qty: 4, label: 'Secondary external doors' },

  /* --------------------------------------------------------- CA-5  MEP ---- */
  { id: 'b.drain', pkg: 'M1', rate: 'mep.drain', qty: 385, label: 'Underground drainage and sewerage' },
  { id: 'b.elec.rough', pkg: 'M2', rate: 'mep.elec.point', qty: 742, label: 'Electrical points, conduit and wiring' },
  { id: 'b.db', pkg: 'M2', rate: 'mep.db', qty: 6, label: 'Distribution boards' },
  { id: 'b.plumb', pkg: 'M3', rate: 'mep.plumb.point', qty: 186, label: 'Plumbing points, risers and distribution' },
  { id: 'b.filter', pkg: 'M3', rate: 'mep.ufilter', qty: 1, label: 'Water filtration and softening plant' },
  { id: 'b.hvac', pkg: 'M4', rate: 'mep.hvac.ton', qty: 62, label: 'VRF indoor units and ductwork, 62 ton' },
  { id: 'b.hvac.out', pkg: 'M4', rate: 'mep.hvac.outdoor', qty: 3, label: 'VRF outdoor condensing units' },
  { id: 'b.fire', pkg: 'M5', rate: 'mep.fire', qty: 1180, label: 'Sprinklers, detection and alarm' },
  { id: 'b.lv', pkg: 'M6', rate: 'mep.lv', qty: 214, label: 'Data, CCTV, intercom and automation points' },
  { id: 'b.security', pkg: 'M6', rate: 'spec.security', qty: 1, label: 'Security system: NVR, access control, perimeter' },
  { id: 'b.automation', pkg: 'M6', rate: 'spec.automation', qty: 1, label: 'Whole-home automation system' },
  { id: 'b.solar', pkg: 'M7', rate: 'mep.solar', qty: 30, label: 'Rooftop solar PV, 30 kW' },
  { id: 'b.battery', pkg: 'M7', rate: 'mep.battery', qty: 40, label: 'Battery storage, 40 kWh' },
  { id: 'b.generator', pkg: 'M7', rate: 'mep.generator', qty: 100, label: 'Standby generator, 100 kVA' },
  { id: 'b.lift', pkg: 'M7', rate: 'mep.lift', qty: 1, label: 'Three-stop passenger lift' },

  /* ------------------------------------------------ CA-6  interior fit ---- */
  { id: 'b.plaster.int', pkg: 'I1', rate: 'fin.plaster.int', qty: 2340, label: 'Internal plaster to walls and soffits' },
  { id: 'b.screed', pkg: 'I2', rate: 'fin.screed', qty: 1180, label: 'Floor screed to all levels' },
  { id: 'b.marble.foyer', pkg: 'I3', rate: 'stone.marble.import', qty: 96, room: 'foyer', label: 'Imported marble floor — foyer and stair hall' },
  { id: 'b.marble.recep', pkg: 'I3', rate: 'stone.marble.import', qty: 148, room: 'majlis', label: 'Imported marble floor — majlis and dining' },
  { id: 'b.marble.local', pkg: 'I3', rate: 'stone.marble.local', qty: 214, label: 'Local marble floor — circulation and secondary rooms' },
  { id: 'b.wood.floor', pkg: 'I4', rate: 'floor.wood', qty: 268, label: 'Engineered oak flooring — bedrooms and study' },
  { id: 'b.tile', pkg: 'I4', rate: 'floor.tile', qty: 186, label: 'Porcelain tiling — bathrooms, kitchen, service' },
  { id: 'b.epoxy', pkg: 'I4', rate: 'floor.epoxy', qty: 148, label: 'Epoxy floor — plant, store and garage' },
  { id: 'b.skirting', pkg: 'I4', rate: 'floor.skirting', qty: 620, label: 'Skirting to all finished rooms' },
  { id: 'b.ceiling', pkg: 'I5', rate: 'fin.ceiling.gypsum', qty: 742, label: 'Suspended gypsum ceilings with coves' },
  { id: 'b.cornice.int', pkg: 'I5', rate: 'fin.cornice.plaster', qty: 486, label: 'Internal classical cornices' },
  { id: 'b.door.int', pkg: 'I6', rate: 'door.internal', qty: 21, label: 'Internal flush doors' },
  { id: 'b.door.prem', pkg: 'I6', rate: 'door.premium', qty: 14, label: 'Panelled hardwood doors to principal rooms' },
  { id: 'b.door.fire', pkg: 'I6', rate: 'door.fire', qty: 3, label: 'Fire doors to plant and garage' },
  { id: 'b.stair.joinery', pkg: 'I6', rate: 'joinery.stair', qty: 38, label: 'Hardwood cladding to the principal stair' },
  { id: 'b.balustrade.int', pkg: 'I6', rate: 'metal.railing', qty: 46, label: 'Wrought-iron stair and gallery balustrade' },
  { id: 'b.panelling', pkg: 'I7', rate: 'fin.panel.wood', qty: 168, label: 'Wall panelling — majlis, study, dining' },
  { id: 'b.wallpaper', pkg: 'I7', rate: 'fin.wallpaper', qty: 224, label: 'Wallpaper to bedrooms and lounge' },
  { id: 'b.paint.int', pkg: 'I8', rate: 'fin.paint.emulsion', qty: 2180, label: 'Internal emulsion to walls and ceilings' },
  { id: 'b.paint.enamel', pkg: 'I8', rate: 'fin.paint.enamel', qty: 340, label: 'Enamel to joinery and metalwork' },
  { id: 'b.bath.master', pkg: 'I9', rate: 'bath.master', qty: 1, room: 'master', label: 'Master bathroom fit-out' },
  { id: 'b.bath.std', pkg: 'I9', rate: 'bath.standard', qty: 6, label: 'En-suite and family bathroom fit-out' },
  { id: 'b.bath.powder', pkg: 'I9', rate: 'bath.powder', qty: 2, label: 'Powder rooms' },
  { id: 'b.kitchen', pkg: 'I10', rate: 'kit.modular', qty: 1, room: 'kitchen', label: 'Modular kitchen with island' },
  { id: 'b.kit.app', pkg: 'I10', rate: 'kit.appliance', qty: 1, room: 'kitchen', label: 'Built-in kitchen appliances' },
  { id: 'b.pantry', pkg: 'I10', rate: 'kit.pantry', qty: 1, room: 'pantry', label: 'Working pantry fit-out' },

  /* ----------------------------------------------------- CA-7  FF and E ---- */
  { id: 'b.wardrobe', pkg: 'X1', rate: 'joinery.wardrobe', qty: 11, label: 'Built-in wardrobes to all bedrooms' },
  { id: 'b.library', pkg: 'X1', rate: 'joinery.library', qty: 1, room: 'study', label: 'Library joinery to the study' },
  { id: 'b.chand.grand', pkg: 'X2', rate: 'light.chandelier.grand', qty: 1, room: 'foyer', label: 'Grand crystal chandelier — foyer void' },
  { id: 'b.chand.room', pkg: 'X2', rate: 'light.chandelier.room', qty: 5, label: 'Crystal chandeliers — reception rooms' },
  { id: 'b.downlight', pkg: 'X2', rate: 'light.recessed', qty: 386, label: 'Recessed downlights throughout' },
  { id: 'b.sconce', pkg: 'X2', rate: 'light.wall', qty: 64, label: 'Brass wall sconces' },
  { id: 'b.pendant', pkg: 'X2', rate: 'light.pendant', qty: 14, label: 'Feature pendants' },
  { id: 'b.furn.majlis', pkg: 'X3', rate: 'furn.majlis', qty: 1, room: 'majlis', label: 'Majlis furniture package' },
  { id: 'b.furn.living', pkg: 'X3', rate: 'furn.living', qty: 1, room: 'lounge', label: 'Family lounge furniture package' },
  { id: 'b.furn.dining', pkg: 'X3', rate: 'furn.dining', qty: 1, room: 'dining', label: 'Dining furniture package' },
  { id: 'b.furn.master', pkg: 'X4', rate: 'furn.master', qty: 1, room: 'master', label: 'Master suite furniture package' },
  { id: 'b.furn.bed', pkg: 'X4', rate: 'furn.bedroom', qty: 4, label: 'Bedroom furniture packages' },
  { id: 'b.furn.office', pkg: 'X4', rate: 'furn.office', qty: 1, room: 'study', label: 'Study furniture package' },
  { id: 'b.theatre', pkg: 'X5', rate: 'spec.theatre', qty: 1, room: 'theatre', label: 'Home cinema installation' },
  { id: 'b.gym', pkg: 'X6', rate: 'spec.gym', qty: 1, room: 'gym', label: 'Gymnasium equipment and finishes' },
  { id: 'b.sauna', pkg: 'X6', rate: 'spec.sauna', qty: 1, room: 'gym', label: 'Cedar sauna cabin' },
  { id: 'b.rugs', pkg: 'X7', rate: 'furn.rug', qty: 6, label: 'Hand-knotted carpets' },
  { id: 'b.art', pkg: 'X7', rate: 'furn.art', qty: 1, label: 'Art, mirrors and accessories' },
  { id: 'b.drapery', pkg: 'X7', rate: 'furn.drapery', qty: 296, label: 'Drapery and motorised tracks' },
  { id: 'b.furn.outdoor', pkg: 'X7', rate: 'furn.outdoor', qty: 1, label: 'Terrace and poolside furniture' },

  /* ----------------------------------------------- CA-8  external works ---- */
  { id: 'b.driveway', pkg: 'L1', rate: 'ext.driveway', qty: 268, label: 'Paved driveway and forecourt' },
  { id: 'b.irrigation', pkg: 'L2', rate: 'ext.irrigation', qty: 412, label: 'Automatic irrigation system' },
  { id: 'b.lawn', pkg: 'L3', rate: 'ext.lawn', qty: 318, label: 'Turf to front and rear lawns' },
  { id: 'b.planting', pkg: 'L3', rate: 'ext.planting', qty: 94, label: 'Shrub and ground-cover beds' },
  { id: 'b.trees', pkg: 'L3', rate: 'ext.tree', qty: 26, label: 'Semi-mature specimen trees' },
  { id: 'b.pool', pkg: 'L4', rate: 'ext.pool', qty: 68, label: 'Swimming pool shell and plant' },
  { id: 'b.pooldeck', pkg: 'L4', rate: 'ext.pooldeck', qty: 124, label: 'Pool deck and coping' },
  { id: 'b.fountain', pkg: 'L5', rate: 'ext.fountain', qty: 1, label: 'Forecourt fountain' },
  { id: 'b.extlight', pkg: 'L6', rate: 'light.external', qty: 58, label: 'External and landscape lighting' },
  { id: 'b.gate', pkg: 'L7', rate: 'ext.gate', qty: 1, label: 'Motorised main gate' },
  { id: 'b.guard', pkg: 'L7', rate: 'ext.guardpost', qty: 1, label: 'Guard post' },

  /* -------------------------------------------------------- CA-9 handover -- */
  { id: 'b.commission', pkg: 'H1', rate: 'hand.commission', qty: 1, label: 'MEP testing and commissioning' },
  { id: 'b.snag', pkg: 'H2', rate: 'hand.snag', qty: 1, label: 'Snagging and rectification' },
  { id: 'b.clean', pkg: 'H3', rate: 'hand.clean', qty: 1, label: 'Builders and presentation clean' },
  { id: 'b.dossier', pkg: 'H4', rate: 'hand.dossier', qty: 1, label: 'As-builts, O&M manuals and warranties' },
].filter((line) => line.qty > 0);

/** Cost of one bill-of-quantities line, in PKR. */
export function lineCost(line) {
  const rate = RATES[line.rate];
  if (!rate) throw new Error(`BOQ line ${line.id} references unknown rate "${line.rate}"`);
  return rate.pkr * line.qty;
}

/** Index of BOQ lines by id, built once. */
export const BOQ_BY_ID = (() => {
  const map = new Map();
  for (const line of BOQ) {
    if (map.has(line.id)) throw new Error(`duplicate BOQ line id "${line.id}"`);
    map.set(line.id, line);
  }
  return map;
})();

/** Total of every BOQ line — the project's construction budget, in PKR. */
export const BOQ_TOTAL = BOQ.reduce((sum, line) => sum + lineCost(line), 0);

/** BOQ lines belonging to one work package. */
export function linesForPackage(pkgId) {
  return BOQ.filter((line) => line.pkg === pkgId);
}

/** Budget of one work package: the sum of its BOQ lines. */
export function packageBudget(pkgId) {
  return linesForPackage(pkgId).reduce((sum, line) => sum + lineCost(line), 0);
}

/**
 * Format a PKR amount the way a Pakistani quantity surveyor would read it:
 * lakh and crore above a million, plain grouped digits below.
 */
export function formatPKR(amount, opts = {}) {
  const n = Math.round(Number(amount) || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (!opts.plain) {
    if (abs >= 1e7) return `${sign}PKR ${(abs / 1e7).toFixed(2)} crore`;
    if (abs >= 1e5) return `${sign}PKR ${(abs / 1e5).toFixed(2)} lakh`;
  }
  return `${sign}PKR ${abs.toLocaleString('en-PK')}`;
}

/** Grouped digits with no unit suffix, for tables. */
export function formatPKRExact(amount) {
  const n = Math.round(Number(amount) || 0);
  return `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-PK')}`;
}
