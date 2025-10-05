'use client'

import type { TripPlan, VehicleSchedule } from '@entities'

interface GanttChartProps {
  vehicles: VehicleSchedule[]
  colorMap: Map<string, string>
  horizon: number
}

interface TimeAxisConfig {
  ticks: number[]
  axisEnd: number
  majorStep: number
}

function buildTimeAxis(maxTime: number): TimeAxisConfig {
  if (maxTime === 0) {
    return { ticks: [0], axisEnd: 1, majorStep: 1 }
  }

  const safeMax = Math.max(maxTime, 1)
  const step = safeMax <= 6 ? 0.5 : safeMax <= 12 ? 1 : safeMax <= 24 ? 2 : 4
  const axisEnd = Math.ceil(safeMax / step) * step

  const ticks: number[] = []
  for (let value = 0; value <= axisEnd + 1e-6; value += step) {
    ticks.push(Number(value.toFixed(2)))
  }

  return { ticks, axisEnd, majorStep: step }
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

  const axis = buildTimeAxis(maxTime)
  const gridSize = `${(axis.majorStep / axis.axisEnd) * 100}%`

  const usedRequestIds = new Set(
    vehicles.flatMap((vehicle) => vehicle.trips.map((trip) => trip.requestId)),
  )
  const legendEntries = Array.from(colorMap.entries()).filter(([requestId]) =>
    usedRequestIds.has(requestId),
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
        <div className='text-sm text-muted-foreground'>
          Горизонт отображения: {axis.axisEnd.toFixed(2)} ч
        </div>
      </div>
      <div className='overflow-x-auto rounded-xl border bg-card p-4 shadow-sm'>
        <div className='min-w-[720px] space-y-5'>
          <div className='grid grid-cols-[140px_1fr] items-end gap-4 text-xs text-muted-foreground'>
            <div className='text-right font-medium uppercase tracking-wide'>
              Время, ч
            </div>
            <div className='relative h-10'>
              <div className='absolute bottom-0 left-0 right-0 border-b border-border' />
              {axis.ticks.map((tick) => {
                const position = (tick / axis.axisEnd) * 100
                return (
                  <div
                    key={tick}
                    className='absolute flex -translate-x-1/2 flex-col items-center text-[10px] font-medium text-muted-foreground'
                    style={{ left: `${position}%` }}
                  >
                    <div className='h-3 border-l border-border' />
                    <span className='mt-1'>
                      {tick.toFixed(Number.isInteger(tick) ? 0 : 1)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className='space-y-4'>
            {vehicles.map((vehicle) => (
              <div
                key={vehicle.vehicleId}
                className='grid grid-cols-[140px_1fr] gap-4'
              >
                <div className='flex flex-col items-end justify-center text-sm font-semibold text-muted-foreground'>
                  <span>Автомобиль #{vehicle.vehicleId}</span>
                  <span className='text-xs font-normal text-muted-foreground/70'>
                    {vehicle.trips.length} рейс(а)
                  </span>
                </div>
                <div
                  className='relative h-16 overflow-hidden rounded-lg border border-border bg-muted/40'
                  style={{
                    backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent calc(${gridSize} - 1px), rgba(15, 23, 42, 0.08) calc(${gridSize} - 1px), rgba(15, 23, 42, 0.08) ${gridSize})`,
                  }}
                >
                  {vehicle.trips.map((trip) => (
                    <TripBar
                      key={trip.id}
                      trip={trip}
                      colorMap={colorMap}
                      axisEnd={axis.axisEnd}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {legendEntries.length > 0 && (
        <div className='flex flex-wrap gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground'>
          <span className='font-semibold text-foreground'>Легенда заявок:</span>
          {legendEntries.map(([requestId, color]) => (
            <span key={requestId} className='flex items-center gap-2'>
              <span
                className='h-3 w-3 rounded-sm'
                style={{ backgroundColor: color }}
                aria-hidden
              />
              {requestId}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

interface TripBarProps {
  trip: TripPlan
  colorMap: Map<string, string>
  axisEnd: number
}

function TripBar({ trip, colorMap, axisEnd }: TripBarProps) {
  const color = colorMap.get(trip.requestId) ?? '#1f77b4'
  const offset = (trip.schedule.startTime / axisEnd) * 100
  const width =
    ((trip.schedule.endTime - trip.schedule.startTime) / axisEnd) * 100
  const start = trip.schedule.startTime.toFixed(2)
  const end = trip.schedule.endTime.toFixed(2)

  return (
    <div
      className='absolute top-2 flex h-12 flex-col justify-center rounded-md border border-white/40 px-3 py-1 text-left text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm'
      style={{
        left: `${offset}%`,
        width: `${Math.max(width, 7)}%`,
        backgroundColor: color,
      }}
      title={`Рейс ${trip.tripNumber}: ${trip.requestLabel} (${start}–${end} ч)`}
    >
      <span className='truncate text-xs uppercase tracking-wide'>
        Рейс №{trip.tripNumber}
      </span>
      <span className='truncate text-[11px] font-normal'>
        {trip.requestLabel}
      </span>
      <span className='text-[10px] font-medium text-white/90'>
        {start} – {end} ч
      </span>
    </div>
  )
}
