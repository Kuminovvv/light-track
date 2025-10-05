'use client'

import {
  formatDistance,
  formatHours,
  type TripPlan,
  type VehicleSchedule,
} from '@entities'
import type { RequestLegendEntry } from './types'

interface GanttChartProps {
  vehicles: VehicleSchedule[]
  colorMap: Map<string, RequestLegendEntry>
  horizon: number
}

interface TimeAxisConfig {
  ticks: number[]
  axisEnd: number
  majorStep: number
}

interface VehicleTimeline {
  segments: TimelineSegment[]
  busyTime: number
  idleTime: number
  utilization: number
}

type TimelineSegment =
  | { type: 'trip'; trip: TripPlan }
  | { type: 'idle'; start: number; end: number }

interface TripPhase {
  key: string
  label: string
  color: string
  duration: number
  startOffset: number
}

interface PhaseDefinition {
  key: TripPhase['key']
  label: string
  bounds: (schedule: TripPlan['schedule']) => [number, number]
  color: (base: string) => string
}

const phaseDefinitions: PhaseDefinition[] = [
  {
    key: 'approach',
    label: 'Путь до отправителя',
    bounds: (schedule) => [schedule.startTime, schedule.arrivalShipper],
    color: (base) => darken(base, 0.25),
  },
  {
    key: 'loading',
    label: 'Погрузка',
    bounds: (schedule) => [schedule.arrivalShipper, schedule.departureShipper],
    color: (base) => lighten(base, 0.45),
  },
  {
    key: 'loaded-run',
    label: 'Движение с грузом',
    bounds: (schedule) => [schedule.departureShipper, schedule.arrivalReceiver],
    color: (base) => darken(base, 0.1),
  },
  {
    key: 'unloading',
    label: 'Выгрузка',
    bounds: (schedule) => [
      schedule.arrivalReceiver,
      schedule.departureReceiver,
    ],
    color: (base) => lighten(base, 0.55),
  },
  {
    key: 'return',
    label: 'Возврат в АТП',
    bounds: (schedule) => [schedule.departureReceiver, schedule.endTime],
    color: (base) => darken(base, 0.35),
  },
]

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function normalizeHex(hex: string): string {
  const cleaned = hex.trim().replace('#', '')
  if (cleaned.length === 3) {
    return cleaned
      .split('')
      .map((char) => char + char)
      .join('')
      .toLowerCase()
  }
  return cleaned.toLowerCase()
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex)
  const value = Number.parseInt(normalized.slice(0, 6), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function componentToHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

function mixColor(color: string, target: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(color)
  const [r2, g2, b2] = hexToRgb(target)
  const weight = clamp(ratio)
  const r = r1 * (1 - weight) + r2 * weight
  const g = g1 * (1 - weight) + g2 * weight
  const b = b1 * (1 - weight) + b2 * weight
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`
}

function lighten(color: string, amount: number) {
  return mixColor(color, '#ffffff', amount)
}

function darken(color: string, amount: number) {
  return mixColor(color, '#000000', amount)
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

function buildVehicleTimeline(
  vehicle: VehicleSchedule,
  axisEnd: number,
): VehicleTimeline {
  const sortedTrips = [...vehicle.trips].sort(
    (a, b) => a.schedule.startTime - b.schedule.startTime,
  )
  const segments: TimelineSegment[] = []
  let pointer = 0
  let busyTime = 0

  sortedTrips.forEach((trip) => {
    const start = trip.schedule.startTime
    const end = trip.schedule.endTime

    if (start > pointer + 1e-6) {
      segments.push({
        type: 'idle',
        start: pointer,
        end: start,
      })
    }

    segments.push({ type: 'trip', trip })
    busyTime += trip.timing.total
    pointer = Math.max(pointer, end)
  })

  if (pointer < axisEnd - 1e-6) {
    segments.push({ type: 'idle', start: pointer, end: axisEnd })
  }

  const idleTime = segments
    .filter(
      (segment): segment is Extract<TimelineSegment, { type: 'idle' }> =>
        segment.type === 'idle',
    )
    .reduce((total, segment) => total + (segment.end - segment.start), 0)

  const effectiveHorizon = Math.max(axisEnd, pointer, 1)

  return {
    segments,
    busyTime,
    idleTime,
    utilization: busyTime / effectiveHorizon,
  }
}

function buildTripPhases(trip: TripPlan, baseColor: string): TripPhase[] {
  const phases: TripPhase[] = []
  const start = trip.schedule.startTime

  phaseDefinitions.forEach((definition) => {
    const [phaseStart, phaseEnd] = definition.bounds(trip.schedule)
    const duration = Math.max(phaseEnd - phaseStart, 0)
    if (duration <= 1e-4) {
      return
    }

    phases.push({
      key: definition.key,
      label: definition.label,
      color: definition.color(baseColor),
      duration,
      startOffset: Math.max(phaseStart - start, 0),
    })
  })

  return phases
}

function buildPhaseLegend(baseColor: string) {
  return phaseDefinitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    color: definition.color(baseColor),
  }))
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
  const gridSize =
    axis.axisEnd > 0 ? `${(axis.majorStep / axis.axisEnd) * 100}%` : '100%'
  const chartHeight = Math.max(axis.axisEnd * 48, 320)

  const vehicleTracks = vehicles.map((vehicle) => ({
    vehicle,
    timeline: buildVehicleTimeline(vehicle, axis.axisEnd),
  }))

  const usedRequestIds = new Set(
    vehicles.flatMap((vehicle) => vehicle.trips.map((trip) => trip.requestId)),
  )
  const legendEntries = Array.from(colorMap.entries())
    .filter(([requestId]) => usedRequestIds.has(requestId))
    .map(([requestId, entry]) => ({
      requestId,
      color: entry.color,
      label: entry.label,
    }))

  const totalBusyTime = vehicleTracks.reduce(
    (total, track) => total + track.timeline.busyTime,
    0,
  )
  const totalIdleTime = vehicleTracks.reduce(
    (total, track) => total + track.timeline.idleTime,
    0,
  )
  const averageUtilization =
    vehicleTracks.length === 0
      ? 0
      : vehicleTracks.reduce(
          (total, track) => total + track.timeline.utilization,
          0,
        ) / vehicleTracks.length

  const phaseLegend = buildPhaseLegend('#2563eb')

  const formatPercent = (value: number) =>
    (value * 100).toLocaleString('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })

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
      <div className='grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-3'>
        <SummaryStat label='Автомобилей в работе' value={vehicles.length} />
        <SummaryStat
          label='Средняя загрузка'
          value={`${formatPercent(averageUtilization)}%`}
          hint='Доля времени, в течение которого автомобили задействованы в рейсах'
        />
        <SummaryStat
          label='Баланс занятости'
          value={`${formatHours(totalBusyTime)} ч / ${formatHours(totalIdleTime)} ч`}
          hint='Общее время занятости и простоя по автопарку'
        />
      </div>
      <div className='overflow-x-auto rounded-xl border bg-card p-4 shadow-sm'>
        <div className='min-w-[840px] space-y-5'>
          <div className='flex items-end gap-6 text-xs text-muted-foreground'>
            <div className='flex w-24 flex-col items-end gap-2 text-right font-medium uppercase tracking-wide'>
              <span className='text-sm font-semibold text-muted-foreground'>
                Время, ч
              </span>
              <div
                className='relative w-full flex-1'
                style={{ height: chartHeight }}
              >
                <div className='absolute left-[calc(50%-1px)] top-0 h-full w-px bg-border' />
                {axis.ticks.map((tick) => {
                  const position = (tick / axis.axisEnd) * 100
                  return (
                    <div
                      key={tick}
                      className='absolute -translate-y-1/2 text-[10px] font-medium text-muted-foreground'
                      style={{ top: `${position}%`, right: '-0.75rem' }}
                    >
                      <div className='absolute left-[0.75rem] top-1/2 h-px w-3 -translate-y-1/2 bg-border' />
                      <span className='relative -translate-y-1/2'>
                        {tick.toFixed(Number.isInteger(tick) ? 0 : 1)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className='flex flex-1 gap-6'>
              {vehicleTracks.map(({ vehicle, timeline }) => (
                <div
                  key={vehicle.vehicleId}
                  className='flex w-[220px] flex-col gap-3'
                >
                  <div className='flex flex-col items-center justify-center gap-1 text-center'>
                    <span className='text-sm font-semibold text-muted-foreground'>
                      Автомобиль #{vehicle.vehicleId}
                    </span>
                    <div className='flex flex-col text-xs text-muted-foreground/80'>
                      <span>
                        {vehicle.trips.length} рейс(а), пробег{' '}
                        {formatDistance(vehicle.totalDistance)} км
                      </span>
                      <span>
                        Занятость {formatPercent(timeline.utilization)}%,
                        простой {formatHours(timeline.idleTime)} ч
                      </span>
                    </div>
                  </div>
                  <div
                    className='relative flex-1 overflow-hidden rounded-lg border border-border bg-muted/40'
                    style={{
                      height: chartHeight,
                      backgroundImage: `repeating-linear-gradient(180deg, transparent, transparent calc(${gridSize} - 1px), rgba(15, 23, 42, 0.08) calc(${gridSize} - 1px), rgba(15, 23, 42, 0.08) ${gridSize})`,
                    }}
                  >
                    {timeline.segments.map((segment) =>
                      segment.type === 'trip' ? (
                        <TripBlock
                          key={segment.trip.id}
                          trip={segment.trip}
                          colorMap={colorMap}
                          axisEnd={axis.axisEnd}
                        />
                      ) : (
                        <IdleBlock
                          key={`idle-${vehicle.vehicleId}-${segment.start.toFixed(2)}`}
                          start={segment.start}
                          end={segment.end}
                          axisEnd={axis.axisEnd}
                        />
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {legendEntries.length > 0 && (
        <div className='flex flex-wrap gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground'>
          <span className='font-semibold text-foreground'>Легенда заявок:</span>
          {legendEntries.map((entry) => (
            <span key={entry.requestId} className='flex items-center gap-2'>
              <span
                className='h-3 w-3 rounded-sm'
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              {entry.label}
            </span>
          ))}
        </div>
      )}
      <div className='flex flex-wrap gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground'>
        <span className='font-semibold text-foreground'>Этапы рейса:</span>
        {phaseLegend.map((phase) => (
          <span key={phase.key} className='flex items-center gap-2'>
            <span
              className='h-3 w-3 rounded-sm'
              style={{ backgroundColor: phase.color }}
              aria-hidden
            />
            {phase.label}
          </span>
        ))}
      </div>
    </div>
  )
}

interface TripBlockProps {
  trip: TripPlan
  colorMap: Map<string, RequestLegendEntry>
  axisEnd: number
}

function TripBlock({ trip, colorMap, axisEnd }: TripBlockProps) {
  const legendEntry = colorMap.get(trip.requestId)
  const baseColor = legendEntry?.color ?? '#2563eb'
  const safeAxis = axisEnd || 1
  const offset = (trip.schedule.startTime / safeAxis) * 100
  const duration = Math.max(trip.schedule.endTime - trip.schedule.startTime, 0)
  const height = (duration / safeAxis) * 100

  const phases = buildTripPhases(trip, baseColor)
  const totalDuration = Math.max(duration, 1e-4)
  const gradientStops = phases.map((phase) => {
    const startPercent = (phase.startOffset / totalDuration) * 100
    const endPercent =
      ((phase.startOffset + phase.duration) / totalDuration) * 100
    return `${phase.color} ${startPercent}% ${endPercent}%`
  })

  const verticalGradient =
    gradientStops.length > 0
      ? `linear-gradient(180deg, ${gradientStops.join(', ')})`
      : undefined
  const horizontalGradient =
    gradientStops.length > 0
      ? `linear-gradient(90deg, ${gradientStops.join(', ')})`
      : undefined

  const travelTime = formatHours(trip.timing.travel)
  const handlingTime = formatHours(trip.timing.loading + trip.timing.unloading)
  const start = trip.schedule.startTime.toFixed(2)
  const end = trip.schedule.endTime.toFixed(2)
  const warnings = trip.warnings.filter(Boolean)
  const phaseDetails = phases
    .map((phase) => `${phase.label}: ${formatHours(phase.duration)} ч`)
    .join('; ')
  const tooltip =
    `Рейс №${trip.tripNumber}: ${trip.requestLabel} (${start}–${end} ч)` +
    (phaseDetails ? `. ${phaseDetails}` : '')

  return (
    <div
      className='group absolute left-2 right-2 z-[1] flex flex-col gap-1 rounded-xl border px-3 py-2 text-left text-[10px] text-slate-900 shadow-[0_8px_20px_-12px_rgba(15,23,42,0.6)] backdrop-blur-sm'
      style={{
        top: `${offset}%`,
        height: `${Math.max(height, 6)}%`,
        borderColor: lighten(baseColor, 0.45),
        backgroundColor: lighten(baseColor, 0.6),
        backgroundImage: verticalGradient,
      }}
      title={tooltip}
    >
      <div className='flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-wide text-slate-900/70'>
        <div className='flex items-center gap-2'>
          <span>Рейс №{trip.tripNumber}</span>
          {warnings.length > 0 && (
            <span className='flex h-4 w-4 items-center justify-center rounded-full bg-amber-300 text-[8px] font-bold text-amber-900 shadow-inner'>
              !
            </span>
          )}
        </div>
        <span className='tabular-nums text-slate-900/70'>
          {start} – {end} ч
        </span>
      </div>
      <div className='truncate text-sm font-semibold leading-tight text-slate-900'>
        {trip.requestLabel}
      </div>
      <div className='text-[9px] text-slate-900/70'>
        Маршрут: АТП → {trip.shipperCode} → {trip.receiverCode} → АТП
      </div>
      <div className='mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/70 shadow-inner'>
        <div
          className='h-full w-full'
          style={{
            backgroundImage: horizontalGradient,
            backgroundColor: horizontalGradient
              ? undefined
              : lighten(baseColor, 0.45),
          }}
        />
      </div>
      <dl className='grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-900/80'>
        <div className='flex flex-col leading-tight'>
          <dt className='font-medium uppercase tracking-wide text-slate-900/60'>
            Тоннаж
          </dt>
          <dd className='font-semibold text-slate-900'>
            {trip.load.toFixed(2)} т
          </dd>
        </div>
        <div className='flex flex-col leading-tight'>
          <dt className='font-medium uppercase tracking-wide text-slate-900/60'>
            Пробег
          </dt>
          <dd className='font-semibold text-slate-900'>
            {formatDistance(trip.distances.total)} км
          </dd>
        </div>
        <div className='flex flex-col leading-tight'>
          <dt className='font-medium uppercase tracking-wide text-slate-900/60'>
            В пути
          </dt>
          <dd className='font-semibold text-slate-900'>{travelTime} ч</dd>
        </div>
        <div className='flex flex-col leading-tight'>
          <dt className='font-medium uppercase tracking-wide text-slate-900/60'>
            Работы
          </dt>
          <dd className='font-semibold text-slate-900'>{handlingTime} ч</dd>
        </div>
      </dl>
      {warnings.length > 0 && (
        <div className='rounded-md border border-amber-400/50 bg-amber-50/80 px-2 py-1 text-[8px] font-medium text-amber-900 shadow-inner'>
          {warnings.map((warning, index) => (
            <div key={`${trip.id}-warning-${index}`} className='leading-tight'>
              {warning}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface IdleBlockProps {
  start: number
  end: number
  axisEnd: number
}

function IdleBlock({ start, end, axisEnd }: IdleBlockProps) {
  const safeAxis = axisEnd || 1
  const offset = (start / safeAxis) * 100
  const height = ((end - start) / safeAxis) * 100
  const duration = formatHours(end - start)

  return (
    <div
      className='absolute left-3 right-3 z-0 flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-100/70 px-3 py-1.5 text-[9px] font-medium text-slate-500 shadow-inner'
      style={{
        top: `${offset}%`,
        height: `${Math.max(height, 3)}%`,
      }}
      title={`Простой: ${start.toFixed(2)} – ${end.toFixed(2)} ч (${duration} ч)`}
    >
      <span className='uppercase tracking-wide'>Простой</span>
      <span className='tabular-nums text-slate-500/80'>
        {start.toFixed(2)} – {end.toFixed(2)} ч
      </span>
    </div>
  )
}

interface SummaryStatProps {
  label: string
  value: string | number
  hint?: string
}

function SummaryStat({ label, value, hint }: SummaryStatProps) {
  const displayValue =
    typeof value === 'number'
      ? value.toLocaleString('ru-RU', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : value

  return (
    <div className='flex flex-col gap-1 rounded-lg bg-muted/40 p-3 shadow-inner'>
      <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </span>
      <span className='text-lg font-semibold text-foreground'>
        {displayValue}
      </span>
      {hint ? (
        <span className='text-[11px] leading-snug text-muted-foreground/80'>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
