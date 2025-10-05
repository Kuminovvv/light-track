'use client'

import type { TripPlan, VehicleSchedule } from '@entities'

interface GanttChartProps {
  vehicles: VehicleSchedule[]
  colorMap: Map<string, string>
  horizon: number
}

export function GanttChart({ vehicles, colorMap, horizon }: GanttChartProps) {
  const maxTime = Math.max(
    horizon,
    ...vehicles.map((vehicle) =>
      vehicle.trips.reduce(
        (acc, trip) => Math.max(acc, trip.schedule.endTime),
        0,
      ),
    ),
  )

  if (vehicles.length === 0 || maxTime === 0) {
    return (
      <div className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
        Добавьте заявки и выполните расчёт, чтобы увидеть диаграмму Ганта.
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-lg font-semibold'>Диаграмма Ганта</h3>
        <span className='text-sm text-muted-foreground'>
          Горизонт отображения: {maxTime.toFixed(2)} ч
        </span>
      </div>
      <div className='space-y-3'>
        {vehicles.map((vehicle) => (
          <div key={vehicle.vehicleId} className='space-y-1'>
            <div className='text-sm font-medium'>
              Автомобиль #{vehicle.vehicleId}
            </div>
            <div className='relative h-12 rounded-md border border-border bg-muted/50'>
              {vehicle.trips.map((trip) => (
                <TripBar
                  key={trip.id}
                  trip={trip}
                  colorMap={colorMap}
                  maxTime={maxTime}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface TripBarProps {
  trip: TripPlan
  colorMap: Map<string, string>
  maxTime: number
}

function TripBar({ trip, colorMap, maxTime }: TripBarProps) {
  const color = colorMap.get(trip.requestId) ?? '#1f77b4'
  const offset = (trip.schedule.startTime / maxTime) * 100
  const width =
    ((trip.schedule.endTime - trip.schedule.startTime) / maxTime) * 100

  return (
    <div
      className='absolute top-1.5 flex h-9 items-center justify-center rounded-md px-2 text-center text-xs font-semibold text-white shadow-sm'
      style={{
        left: `${offset}%`,
        width: `${Math.max(width, 5)}%`,
        backgroundColor: color,
      }}
      title={`Рейс ${trip.tripNumber}: ${trip.requestLabel}`}
    >
      <span className='truncate'>
        Рейс {trip.tripNumber} ({trip.requestLabel})
      </span>
    </div>
  )
}
