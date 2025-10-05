import type {
  PlannerParameters,
  PlanResult,
  RequestInput,
  RouteDistance,
  RouteTiming,
  TripPlan,
  VehicleSchedule,
} from './types'
import { calculateDistance, depotPoint, parseGridCode } from './utils'

interface VehicleState {
  id: number
  availableTime: number
  trips: TripPlan[]
  totalDistance: number
  totalTime: number
}

const HOURS_IN_DAY = 24

export function buildPlan(
  requests: RequestInput[],
  params: PlannerParameters,
): PlanResult {
  const errors: string[] = []
  const trips: TripPlan[] = []
  const vehicles: VehicleState[] = []

  const sanitizedRequests = requests.filter((request) => {
    if (!request.shipperCode || !request.receiverCode) {
      errors.push(`Заявка с кодом ${request.id} не содержит адресов.`)
      return false
    }
    if (request.volume <= 0) {
      errors.push(
        `Заявка ${request.shipperCode}-${request.receiverCode} имеет нулевой объём.`,
      )
      return false
    }
    const shipperPoint = parseGridCode(request.shipperCode)
    const receiverPoint = parseGridCode(request.receiverCode)
    if (!shipperPoint || !receiverPoint) {
      errors.push(
        `Заявка ${request.shipperCode}-${request.receiverCode}: неверный код клиента.`,
      )
      return false
    }
    return true
  })

  let totalVolume = 0

  for (const request of sanitizedRequests) {
    const shipperPoint = parseGridCode(request.shipperCode)
    const receiverPoint = parseGridCode(request.receiverCode)
    if (!shipperPoint || !receiverPoint) {
      continue
    }
    let remaining = request.volume
    let tripCounter = 1

    while (remaining > 0) {
      const load = Math.min(params.capacity, remaining)
      remaining -= load

      const distances: RouteDistance = {
        toShipper: calculateDistance(
          depotPoint,
          shipperPoint,
          params.cellSize,
          params.distanceMode,
        ),
        toReceiver: calculateDistance(
          shipperPoint,
          receiverPoint,
          params.cellSize,
          params.distanceMode,
        ),
        toDepot: calculateDistance(
          receiverPoint,
          depotPoint,
          params.cellSize,
          params.distanceMode,
        ),
        total: 0,
      }
      distances.total =
        distances.toShipper + distances.toReceiver + distances.toDepot

      const loadingTime = load * params.loadUnloadRate
      const unloadingTime = load * params.loadUnloadRate
      const travelTime =
        distances.toShipper / params.speed +
        distances.toReceiver / params.speed +
        distances.toDepot / params.speed

      const timing: RouteTiming = {
        travel: travelTime,
        loading: loadingTime,
        unloading: unloadingTime,
        total: travelTime + loadingTime + unloadingTime,
      }

      const vehicle = selectVehicle(
        vehicles,
        timing.total,
        params.workdayLength,
      )
      const startTime = vehicle.availableTime

      const schedule = {
        startTime,
        arrivalShipper: startTime + distances.toShipper / params.speed,
        departureShipper:
          startTime + distances.toShipper / params.speed + loadingTime,
        arrivalReceiver:
          startTime +
          distances.toShipper / params.speed +
          loadingTime +
          distances.toReceiver / params.speed,
        departureReceiver:
          startTime +
          distances.toShipper / params.speed +
          loadingTime +
          distances.toReceiver / params.speed +
          unloadingTime,
        endTime: startTime + timing.total,
      }

      const warnings: string[] = []
      if (schedule.departureReceiver > request.workingHours) {
        warnings.push(
          `Работы у клиента превышают рабочее время (${schedule.departureReceiver.toFixed(2)} ч > ${request.workingHours.toFixed(2)} ч).`,
        )
      }

      if (timing.total > params.workdayLength) {
        warnings.push(
          `Продолжительность рейса превышает смену (${timing.total.toFixed(2)} ч > ${params.workdayLength.toFixed(2)} ч).`,
        )
      }

      const trip: TripPlan = {
        id: crypto.randomUUID(),
        requestId: request.id,
        requestLabel: `${request.shipperCode} → ${request.receiverCode}`,
        shipperCode: request.shipperCode,
        receiverCode: request.receiverCode,
        tripNumber: tripCounter,
        load,
        distances,
        timing,
        schedule,
        vehicleId: vehicle.id,
        warnings,
      }

      vehicle.trips.push(trip)
      vehicle.availableTime = schedule.endTime
      vehicle.totalDistance += distances.total
      vehicle.totalTime += timing.total

      trips.push(trip)
      tripCounter += 1
    }

    totalVolume += request.volume
  }

  const vehicleSchedules: VehicleSchedule[] = vehicles.map((vehicle) => ({
    vehicleId: vehicle.id,
    trips: vehicle.trips,
    totalDistance: vehicle.totalDistance,
    totalTime: vehicle.totalTime,
  }))

  const totalDistance = trips.reduce(
    (acc, trip) => acc + trip.distances.total,
    0,
  )
  const loadedDistance = trips.reduce(
    (acc, trip) => acc + trip.distances.toReceiver,
    0,
  )
  const emptyDistance = totalDistance - loadedDistance
  const totalTime = trips.reduce((acc, trip) => acc + trip.timing.total, 0)
  const maxCompletionTime = trips.reduce(
    (acc, trip) => Math.max(acc, trip.schedule.endTime),
    0,
  )
  const vehiclesRequired = vehicleSchedules.length

  return {
    trips,
    vehicles: vehicleSchedules,
    summary: {
      totalTrips: trips.length,
      totalVolume,
      totalDistance,
      loadedDistance,
      emptyDistance,
      utilization: totalDistance === 0 ? 0 : loadedDistance / totalDistance,
      totalTime,
      maxCompletionTime,
      vehiclesRequired,
    },
    errors,
  }
}

function selectVehicle(
  vehicles: VehicleState[],
  tripDuration: number,
  workdayLength: number,
): VehicleState {
  if (vehicles.length === 0) {
    const newVehicle = createVehicle(1)
    vehicles.push(newVehicle)
    return newVehicle
  }

  vehicles.sort((a, b) => a.availableTime - b.availableTime)

  for (const vehicle of vehicles) {
    if (vehicle.availableTime + tripDuration <= workdayLength + 1e-6) {
      return vehicle
    }
  }

  const newVehicle = createVehicle(vehicles.length + 1)
  vehicles.push(newVehicle)
  return newVehicle
}

function createVehicle(id: number): VehicleState {
  return {
    id,
    availableTime: 0,
    trips: [],
    totalDistance: 0,
    totalTime: 0,
  }
}

export const defaultParameters: PlannerParameters = {
  capacity: 6,
  loadUnloadRate: 0.1,
  cellSize: 4,
  speed: 40,
  distanceMode: 'manhattan',
  workdayLength: HOURS_IN_DAY,
}
