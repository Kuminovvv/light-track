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

const HEADER_HEIGHT = 56
const ROW_HEIGHT = 92
const ROW_GAP = 12

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

  const timelineContentHeight = Math.max(
    vehicleTracks.length * ROW_HEIGHT +
      Math.max(vehicleTracks.length - 1, 0) * ROW_GAP,
    ROW_HEIGHT,
  )

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
        <div className='min-w-[960px] space-y-6'>
          <div className='grid grid-cols-[220px_minmax(0,1fr)] gap-4'>
            <div>
              <div
                className='flex h-[56px] items-end pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
                style={{ height: HEADER_HEIGHT }}
              >
                Автопарк
              </div>
              <div className='flex flex-col' style={{ gap: `${ROW_GAP}px` }}>
                {vehicleTracks.map(({ vehicle, timeline }) => (
                  <VehicleInfoPanel
                    key={vehicle.vehicleId}
                    vehicle={vehicle}
                    timeline={timeline}
                    height={ROW_HEIGHT}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className='rounded-xl border border-border/70 bg-background/80 shadow-sm'>
                <TimelineAxis axis={axis} />
                <div
                  className='relative px-6 py-4'
                  style={{ minHeight: timelineContentHeight }}
                >
                  <TimelineGrid axis={axis} height={timelineContentHeight} />
                  <div
                    className='flex flex-col'
                    style={{ gap: `${ROW_GAP}px` }}
                  >
                    {vehicleTracks.map(({ vehicle, timeline }) => (
                      <VehicleTimelineRow
                        key={vehicle.vehicleId}
                        axisEnd={axis.axisEnd}
                        colorMap={colorMap}
                        segments={timeline.segments}
                        height={ROW_HEIGHT}
                      />
                    ))}
                  </div>
                </div>
              </div>
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

interface VehicleInfoPanelProps {
  vehicle: VehicleSchedule
  timeline: VehicleTimeline
  height: number
}

function VehicleInfoPanel({
  vehicle,
  timeline,
  height,
}: VehicleInfoPanelProps) {
  const formatPercent = (value: number) =>
    (value * 100).toLocaleString('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })

  return (
    <div
      className='flex flex-col justify-center rounded-lg border border-border/60 bg-muted/40 px-3 py-2 shadow-inner'
      style={{ height }}
    >
      <div className='text-sm font-semibold text-muted-foreground'>
        Автомобиль #{vehicle.vehicleId}
      </div>
      <div className='mt-1 text-xs text-muted-foreground/80'>
        {vehicle.trips.length} рейс(а), пробег{' '}
        {formatDistance(vehicle.totalDistance)} км
      </div>
      <div className='text-xs text-muted-foreground/80'>
        Занятость {formatPercent(timeline.utilization)}%, простой{' '}
        {formatHours(timeline.idleTime)} ч
      </div>
    </div>
  )
}

interface VehicleTimelineRowProps {
  segments: TimelineSegment[]
  axisEnd: number
  colorMap: Map<string, RequestLegendEntry>
  height: number
}

function VehicleTimelineRow({
  segments,
  axisEnd,
  colorMap,
  height,
}: VehicleTimelineRowProps) {
  return (
    <div
      className='relative overflow-hidden rounded-lg border border-border/70 bg-white shadow-sm'
      style={{ height }}
    >
      {segments.map((segment) =>
        segment.type === 'trip' ? (
          <TripBlock
            key={segment.trip.id}
            trip={segment.trip}
            colorMap={colorMap}
            axisEnd={axisEnd}
          />
        ) : (
          <IdleBlock
            key={`idle-${segment.start.toFixed(2)}-${segment.end.toFixed(2)}`}
            start={segment.start}
            end={segment.end}
            axisEnd={axisEnd}
          />
        ),
      )}
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
  const width = (duration / safeAxis) * 100

  const phases = buildTripPhases(trip, baseColor)
  const totalDuration = Math.max(duration, 1e-4)
  const gradientStops = phases
    .map((phase) => {
      const startPercent = (phase.startOffset / totalDuration) * 100
      const endPercent =
        ((phase.startOffset + phase.duration) / totalDuration) * 100
      return `${phase.color} ${startPercent.toFixed(2)}% ${endPercent.toFixed(2)}%`
    })
    .join(', ')
  const horizontalGradient =
    gradientStops.length > 0
      ? `linear-gradient(90deg, ${gradientStops})`
      : undefined

  const travelTime = formatHours(trip.timing.travel)
  const handlingTime = formatHours(trip.timing.loading + trip.timing.unloading)
  const startTime = formatHours(trip.schedule.startTime)
  const endTime = formatHours(trip.schedule.endTime)
  const warnings = trip.warnings ?? []

  return (
    <div
      className='absolute inset-y-2 z-10 flex flex-col gap-1.5 rounded-md px-3 py-2 text-xs text-white shadow-md ring-1 ring-black/5'
      style={{
        left: `${offset}%`,
        width: `${width}%`,
        backgroundImage: horizontalGradient,
        backgroundColor: horizontalGradient
          ? undefined
          : darken(baseColor, 0.05),
      }}
      title={`Рейс ${trip.tripNumber}: ${startTime}–${endTime} ч`}
    >
      <div className='flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/85'>
        <span>Рейс #{trip.tripNumber}</span>
        <span className='tabular-nums'>
          {startTime} – {endTime} ч
        </span>
      </div>
      <div className='text-[11px] font-medium leading-tight text-white/90'>
        {trip.requestLabel}
      </div>
      <div className='text-[10px] text-white/85'>
        АТП → {trip.shipperCode} → {trip.receiverCode} → АТП
      </div>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-white/85'>
        <span className='tabular-nums'>Т: {trip.load.toFixed(2)} т</span>
        <span className='tabular-nums'>
          П: {formatDistance(trip.distances.total)} км
        </span>
        <span className='tabular-nums'>Р: {handlingTime} ч</span>
        <span className='tabular-nums'>В пути: {travelTime} ч</span>
      </div>
      {warnings.length > 0 && (
        <div className='rounded-sm border border-amber-300/60 bg-amber-400/30 px-2 py-1 text-[10px] font-semibold text-white shadow-inner'>
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
  const width = ((end - start) / safeAxis) * 100
  const duration = formatHours(end - start)

  return (
    <div
      className='absolute inset-y-3 z-0 flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300/80 bg-slate-100/80 px-2 text-[10px] font-medium text-slate-500'
      style={{
        left: `${offset}%`,
        width: `${width}%`,
      }}
      title={`Простой: ${start.toFixed(2)} – ${end.toFixed(2)} ч (${duration} ч)`}
    >
      <span className='whitespace-nowrap uppercase tracking-wide'>Простой</span>
      <span className='whitespace-nowrap overflow-hidden text-ellipsis text-slate-500/80'>
        {duration} ч
      </span>
    </div>
  )
}

interface TimelineGridProps {
  axis: TimeAxisConfig
  height: number
}

function TimelineGrid({ axis, height }: TimelineGridProps) {
  if (height <= 0) {
    return null
  }

  const safeAxis = axis.axisEnd || 1

  return (
    <div
      className='pointer-events-none absolute inset-x-6 top-4'
      style={{ height: Math.max(height, 1) }}
      aria-hidden
    >
      {axis.ticks.map((tick) => {
        if (axis.axisEnd === 0) {
          return null
        }

        const position = (tick / safeAxis) * 100
        return (
          <div
            key={`grid-${tick}`}
            className='absolute top-0 bottom-0 w-px bg-border/60'
            style={{ left: `${position}%` }}
          />
        )
      })}
    </div>
  )
}

interface TimelineAxisProps {
  axis: TimeAxisConfig
}

function TimelineAxis({ axis }: TimelineAxisProps) {
  const safeAxis = axis.axisEnd || 1

  return (
    <div
      className='relative h-[56px] border-b border-border/70 px-6 text-[11px] text-muted-foreground'
      style={{ minHeight: HEADER_HEIGHT }}
    >
      <span className='absolute left-6 top-2 font-semibold uppercase tracking-wide text-muted-foreground'>
        Время, ч
      </span>
      <div className='absolute inset-x-6 bottom-0 flex h-[32px] items-end'>
        <div className='relative flex-1'>
          {axis.ticks.map((tick, index) => {
            const label = tick.toFixed(Number.isInteger(tick) ? 0 : 1)

            if (index === 0) {
              return (
                <div
                  key={tick}
                  className='absolute bottom-0 left-0 flex flex-col items-start gap-1'
                >
                  <div className='h-3 w-px bg-border/70' />
                  <span className='tabular-nums font-medium'>{label}</span>
                </div>
              )
            }

            if (index === axis.ticks.length - 1) {
              return (
                <div
                  key={tick}
                  className='absolute bottom-0 right-0 flex flex-col items-end gap-1'
                >
                  <div className='h-3 w-px bg-border/70' />
                  <span className='tabular-nums font-medium'>{label}</span>
                </div>
              )
            }

            const position = (tick / safeAxis) * 100
            return (
              <div
                key={tick}
                className='absolute bottom-0 flex translate-x-[-50%] flex-col items-center gap-1'
                style={{ left: `${position}%` }}
              >
                <div className='h-3 w-px bg-border/70' />
                <span className='tabular-nums font-medium'>{label}</span>
              </div>
            )
          })}
        </div>
      </div>
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
