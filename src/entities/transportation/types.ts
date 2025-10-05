export type DistanceMode = 'manhattan' | 'euclidean'

export interface RequestInput {
  id: string
  shipperCode: string
  receiverCode: string
  volume: number
  workingHours: number
}

export interface PlannerParameters {
  capacity: number
  loadUnloadRate: number
  cellSize: number
  speed: number
  distanceMode: DistanceMode
  workdayLength: number
}

export interface GridPoint {
  code: string
  column: number
  row: number
}

export interface RouteDistance {
  toShipper: number
  toReceiver: number
  toDepot: number
  total: number
}

export interface RouteTiming {
  travel: number
  loading: number
  unloading: number
  total: number
}

export interface TripSchedule {
  startTime: number
  arrivalShipper: number
  departureShipper: number
  arrivalReceiver: number
  departureReceiver: number
  endTime: number
}

export interface TripPlan {
  id: string
  requestId: string
  requestLabel: string
  shipperCode: string
  receiverCode: string
  tripNumber: number
  load: number
  distances: RouteDistance
  timing: RouteTiming
  schedule: TripSchedule
  vehicleId: number
  warnings: string[]
}

export interface VehicleSchedule {
  vehicleId: number
  trips: TripPlan[]
  totalDistance: number
  totalTime: number
}

export interface PlanSummary {
  totalTrips: number
  totalVolume: number
  totalDistance: number
  loadedDistance: number
  emptyDistance: number
  utilization: number
  totalTime: number
  maxCompletionTime: number
  vehiclesRequired: number
}

export interface PlanResult {
  trips: TripPlan[]
  vehicles: VehicleSchedule[]
  summary: PlanSummary
  errors: string[]
}
