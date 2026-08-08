/**
 * Evacuation road capacity mathematics.
 *
 * Implements RESEARCH.md Part 3. Everything here answers one question a routing
 * engine on its own cannot: not "what is the route", but "can that route
 * actually carry these people in the time available, and who is left over".
 *
 * Sources are named per function. Where a figure is a modelling assumption
 * rather than a measurement it says so, because the difference matters when the
 * output is used to decide whether to evacuate.
 */

/** Standard lane widths in metres, by OSM highway class. */
const LANE_WIDTH_M: Record<string, number> = {
  motorway: 3.65,
  trunk: 3.65,
  primary: 3.25,
  secondary: 3.25,
  tertiary: 3.0,
  residential: 2.9,
  unclassified: 2.9,
  service: 2.75,
};
const DEFAULT_LANE_WIDTH_M = 3.25;

/** Narrowest carriageway a passenger car (~1.8 m) can actually move along. */
const MIN_USABLE_LANE_M = 2.5;

/**
 * Evacuation-condition lane capacity, vehicles/hour/lane.
 *
 * The Highway Capacity Manual gives ~2,000 pc/h/ln for multilane highways and
 * 1,500-2,000 veh/h/ln saturation flow, with 1,900 the common default. These
 * numbers are deliberately below that: evacuation traffic is unfamiliar
 * drivers, loaded vehicles, no shoulder recovery and frequent hesitation, and
 * assuming design capacity in an evacuation over-predicts how many people get
 * out — an error in the dangerous direction.
 */
const LANE_CAPACITY_VPH: Record<string, number> = {
  motorway: 1900,
  trunk: 1900,
  primary: 1700,
  secondary: 1600,
  tertiary: 1200,
  residential: 600,
  unclassified: 600,
  service: 500,
};
const DEFAULT_LANE_CAPACITY_VPH = 1200;

/**
 * Persons per vehicle in an evacuation. Hurricane evacuation studies put this
 * at 2.0-2.5; households frequently take more than one vehicle, which lowers
 * occupancy and raises vehicle count, so the low end of the range is the
 * conservative choice.
 */
export const EVACUATION_VEHICLE_OCCUPANCY = 2.2;

/**
 * Pedestrian flow at capacity, persons/second/metre of clear width.
 * Fruin's walkway capacity (LOS E). Key Fruin breakpoints are 7, 13, 20 and
 * 33 ped/min/m at 12.08, 6.04, 3.72 and 2.23 m²/pedestrian respectively.
 */
export const PEDESTRIAN_FLOW_PER_M_PER_S = 1.3;

/** Unimpeded walking speed, m/s. Slower than a fit adult's ~1.4 to allow for mixed crowds. */
export const WALKING_SPEED_MS = 1.2;

/** Space lost to each kerbside parking lane on a street, metres. */
const PARKED_LANE_M = 2.0;

export interface RoadSegment {
  /** OSM highway class, e.g. "primary". */
  highway: string;
  /** OSM `lanes` tag if present. */
  lanes?: number | null;
  /** OSM `width` tag in metres (carriageway, kerb to kerb) if present. */
  widthM?: number | null;
  /** Whether both kerbs are assumed parked — the Lahaina single-lane failure mode. */
  parkedBothSides?: boolean;
}

export interface LaneEstimate {
  usableLanes: number;
  laneWidthM: number;
  effectiveWidthM: number;
  /** How the lane count was arrived at, for display. */
  basis: "lanes tag" | "width tag" | "highway class default";
  note?: string;
}

/**
 * Usable lanes for a road segment.
 *
 * OSM tags carriageway width kerb-to-kerb in `width` and lane count in `lanes`;
 * where lanes are untagged the OSM convention is lane width = width / lanes, so
 * the inverse gives a usable-lane estimate from width alone.
 *
 * The parking correction is the important part. A 6 m residential street tagged
 * `lanes=2` carries one usable lane once both kerbs are parked, and that is
 * invisible if you trust the lane count alone.
 */
export function estimateUsableLanes(seg: RoadSegment): LaneEstimate {
  const laneWidthM = LANE_WIDTH_M[seg.highway] ?? DEFAULT_LANE_WIDTH_M;

  let effectiveWidthM = seg.widthM ?? null;
  if (effectiveWidthM != null && seg.parkedBothSides) {
    effectiveWidthM = Math.max(0, effectiveWidthM - 2 * PARKED_LANE_M);
  }

  // Width is the stronger signal when present, because it survives the parking
  // correction that a lane count cannot express.
  if (effectiveWidthM != null && effectiveWidthM > 0) {
    const usableLanes = Math.max(
      effectiveWidthM >= MIN_USABLE_LANE_M ? 1 : 0,
      Math.floor(effectiveWidthM / laneWidthM)
    );
    return {
      usableLanes,
      laneWidthM,
      effectiveWidthM,
      basis: "width tag",
      note: seg.parkedBothSides
        ? `${(2 * PARKED_LANE_M).toFixed(1)} m assumed lost to kerbside parking`
        : undefined,
    };
  }

  if (seg.lanes != null && seg.lanes > 0) {
    const lanes = seg.parkedBothSides ? Math.max(1, seg.lanes - 1) : seg.lanes;
    return {
      usableLanes: lanes,
      laneWidthM,
      effectiveWidthM: lanes * laneWidthM,
      basis: "lanes tag",
      note: seg.parkedBothSides ? "one lane assumed lost to kerbside parking" : undefined,
    };
  }

  // Nothing tagged: assume the minimum a road of this class would be built to.
  const assumed = seg.highway === "motorway" || seg.highway === "trunk" ? 2 : 1;
  return {
    usableLanes: assumed,
    laneWidthM,
    effectiveWidthM: assumed * laneWidthM,
    basis: "highway class default",
    note: "neither lanes nor width tagged in OpenStreetMap",
  };
}

/** Vehicles/hour a segment can carry, given its usable lanes. */
export function segmentCapacityVph(seg: RoadSegment, usableLanes: number): number {
  const perLane = LANE_CAPACITY_VPH[seg.highway] ?? DEFAULT_LANE_CAPACITY_VPH;
  return perLane * usableLanes;
}

/** People/hour a segment can carry: capacity x occupancy. */
export function peoplePerHour(capacityVph: number, occupancy = EVACUATION_VEHICLE_OCCUPANCY): number {
  return capacityVph * occupancy;
}

export interface ClearanceInput {
  population: number;
  /** Total outbound capacity across all usable routes, vehicles/hour. */
  outboundCapacityVph: number;
  /** Fraction of the population that actually leaves. 1.0 for a mandatory order. */
  participation?: number;
  occupancy?: number;
  /** Time before the hazard arrives, hours. Drives the unassignable count. */
  timeAvailableHours?: number;
  /** Time before the first vehicle moves — warning, packing, deciding. */
  mobilisationHours?: number;
  /** Route length and speed, for the travel-time term. */
  routeLengthKm?: number;
  effectiveSpeedKmh?: number;
}

export interface ClearanceResult {
  vehicles: number;
  /** Hours of pure queue discharge at capacity. */
  loadingHours: number;
  mobilisationHours: number;
  travelHours: number;
  /** Total time to clear the population. */
  clearanceHours: number;
  /** People who cannot clear before the hazard arrives — need shelter-in-place. */
  unassignablePeople: number;
  unassignableVehicles: number;
  /** Outbound lanes that would be needed to clear within timeAvailableHours. */
  lanesNeeded: number | null;
  peoplePerHour: number;
}

/**
 * Clearance time and, more importantly, who does not make it.
 *
 *   T_clear = T_mobilisation + N_vehicles / C_outbound + T_travel
 *
 * Real evacuations load onto the network along a sigmoid response curve rather
 * than instantly, and studies report 50% and 90% clearance times off that curve.
 * This models the 100% queue-discharge case, which is the right one for a
 * life-safety threshold: it answers "is there enough road for everyone".
 */
export function clearanceTime(input: ClearanceInput): ClearanceResult {
  const {
    population,
    outboundCapacityVph,
    participation = 1.0,
    occupancy = EVACUATION_VEHICLE_OCCUPANCY,
    timeAvailableHours,
    mobilisationHours = 0,
    routeLengthKm,
    effectiveSpeedKmh,
  } = input;

  const vehicles = (population * participation) / occupancy;
  const loadingHours = outboundCapacityVph > 0 ? vehicles / outboundCapacityVph : Infinity;
  const travelHours =
    routeLengthKm != null && effectiveSpeedKmh != null && effectiveSpeedKmh > 0
      ? routeLengthKm / effectiveSpeedKmh
      : 0;

  const clearanceHours = mobilisationHours + loadingHours + travelHours;

  let unassignableVehicles = 0;
  let lanesNeeded: number | null = null;
  if (timeAvailableHours != null && timeAvailableHours > 0) {
    // Only the window left after mobilisation and travel can be spent discharging.
    const dischargeWindow = Math.max(0, timeAvailableHours - mobilisationHours - travelHours);
    const clearable = outboundCapacityVph * dischargeWindow;
    unassignableVehicles = Math.max(0, vehicles - clearable);
    if (dischargeWindow > 0) {
      lanesNeeded = Math.ceil(vehicles / dischargeWindow / DEFAULT_LANE_CAPACITY_VPH);
    }
  }

  return {
    vehicles: Math.round(vehicles),
    loadingHours,
    mobilisationHours,
    travelHours,
    clearanceHours,
    unassignablePeople: Math.round(unassignableVehicles * occupancy),
    unassignableVehicles: Math.round(unassignableVehicles),
    lanesNeeded,
    peoplePerHour: peoplePerHour(outboundCapacityVph, occupancy),
  };
}

/**
 * Pedestrian clearance. Included because per metre of street width, walking
 * moves roughly four times as many people as driving (~4,680 vs ~1,131
 * people/h/m), and it removes the failure mode where one stalled car blocks
 * everyone behind it. For short escape distances it is usually the faster
 * answer, and it is usually the one nobody models.
 */
export function pedestrianClearance(
  population: number,
  usableWidthM: number,
  escapeDistanceKm: number
): { flowPerHour: number; flowLimitedHours: number; travelHours: number; clearanceHours: number } {
  const flowPerHour = PEDESTRIAN_FLOW_PER_M_PER_S * usableWidthM * 3600;
  const flowLimitedHours = flowPerHour > 0 ? population / flowPerHour : Infinity;
  const travelHours = (escapeDistanceKm * 1000) / WALKING_SPEED_MS / 3600;
  return {
    flowPerHour,
    flowLimitedHours,
    travelHours,
    // Walking clearance is usually travel-time dominated, not flow limited.
    clearanceHours: Math.max(flowLimitedHours, travelHours),
  };
}

/**
 * BPR volume-delay function — travel time degrades as demand approaches capacity.
 *
 *   t = t0 * (1 + alpha * (V/C)^beta),  alpha = 0.15, beta = 4 conventionally
 *
 * At V/C = 1.0 travel time is 1.15x free-flow; at 1.5 it is roughly 1.9x.
 * Routing that assumes free-flow speed holds under evacuation load
 * systematically under-predicts clearance time.
 */
export function bprTravelTime(freeFlowTime: number, volume: number, capacity: number, alpha = 0.15, beta = 4): number {
  if (capacity <= 0) return Infinity;
  return freeFlowTime * (1 + alpha * Math.pow(volume / capacity, beta));
}

export interface RouteLoad {
  id: string;
  capacityVph: number;
  demandVehicles: number;
}

export interface OverflowResult {
  perRoute: { id: string; supply: number; demand: number; overflow: number; residual: number }[];
  totalOverflowVehicles: number;
  reassignedVehicles: number;
  /** Vehicles with nowhere to go — the shelter-in-place population. */
  unassignableVehicles: number;
  unassignablePeople: number;
}

/**
 * Overflow and reassignment across several outbound routes.
 *
 *   Supply_i   = C_i * T_available
 *   Overflow_i = max(0, Demand_i - Supply_i)
 *
 * Overflow is then absorbed by routes with residual capacity. Whatever cannot
 * be absorbed is the number this whole module exists to surface: people for
 * whom no road solution exists, who need vertical evacuation or a designated
 * refuge rather than a route. A router that silently assigns them to a road
 * that cannot take them is worse than one that admits it.
 */
export function computeOverflow(
  routes: RouteLoad[],
  timeAvailableHours: number,
  occupancy = EVACUATION_VEHICLE_OCCUPANCY
): OverflowResult {
  const perRoute = routes.map((r) => {
    const supply = r.capacityVph * timeAvailableHours;
    const overflow = Math.max(0, r.demandVehicles - supply);
    const residual = Math.max(0, supply - r.demandVehicles);
    return { id: r.id, supply, demand: r.demandVehicles, overflow, residual };
  });

  const totalOverflow = perRoute.reduce((a, r) => a + r.overflow, 0);
  const totalResidual = perRoute.reduce((a, r) => a + r.residual, 0);
  const reassigned = Math.min(totalOverflow, totalResidual);
  const unassignable = Math.max(0, totalOverflow - totalResidual);

  return {
    perRoute,
    totalOverflowVehicles: Math.round(totalOverflow),
    reassignedVehicles: Math.round(reassigned),
    unassignableVehicles: Math.round(unassignable),
    unassignablePeople: Math.round(unassignable * occupancy),
  };
}
