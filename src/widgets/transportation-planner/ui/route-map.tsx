'use client'

import type { PlanResult } from '@entities'
import { depotPoint, gridLetters, gridSize, parseGridCode } from '@entities'
import { useId, useMemo } from 'react'
import type { RequestLegendEntry } from './types'

interface RouteMapProps {
  plan: PlanResult
  colorMap: Map<string, RequestLegendEntry>
}

const CELL_SIZE = 72
const PADDING = 32

export function RouteMap({ plan, colorMap }: RouteMapProps) {
  const svgTitleId = useId()
  const depot = useMemo(() => parseGridCode(depotPoint.code), [])
  const { width, height } = useMemo(() => {
    return {
      width: gridSize * CELL_SIZE + PADDING * 2,
      height: gridSize * CELL_SIZE + PADDING * 2,
    }
  }, [])

  const points = useMemo(() => {
    const map = new Map<
      string,
      { x: number; y: number; label: string; isDepot: boolean }
    >()

    const convert = (code: string) => {
      const point = parseGridCode(code)
      if (!point) {
        return null
      }
      const x = PADDING + (point.column + 0.5) * CELL_SIZE
      const y = PADDING + (gridSize - point.row - 0.5) * CELL_SIZE
      return { x, y, label: code }
    }

    const depot = convert(depotPoint.code)
    if (depot) {
      map.set(depotPoint.code, { ...depot, isDepot: true })
    }

    for (const trip of plan.trips) {
      const shipper = convert(trip.shipperCode)
      const receiver = convert(trip.receiverCode)

      if (shipper && !map.has(trip.shipperCode)) {
        map.set(trip.shipperCode, { ...shipper, isDepot: false })
      }
      if (receiver && !map.has(trip.receiverCode)) {
        map.set(trip.receiverCode, { ...receiver, isDepot: false })
      }
    }

    return Array.from(map.values())
  }, [plan.trips])

  const routes = useMemo(() => {
    const grouped = new Map<
      string,
      { shipper: string; receiver: string; count: number; color: string }
    >()

    for (const trip of plan.trips) {
      if (!grouped.has(trip.requestId)) {
        grouped.set(trip.requestId, {
          shipper: trip.shipperCode,
          receiver: trip.receiverCode,
          count: 1,
          color: colorMap.get(trip.requestId)?.color ?? '#1f77b4',
        })
      } else {
        const existing = grouped.get(trip.requestId)
        if (existing) {
          existing.count += 1
        }
      }
    }

    return Array.from(grouped.values())
  }, [plan.trips, colorMap])

  const gridLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    for (let i = 0; i <= gridSize; i += 1) {
      const offset = PADDING + i * CELL_SIZE
      lines.push({ x1: PADDING, y1: offset, x2: width - PADDING, y2: offset })
      lines.push({ x1: offset, y1: PADDING, x2: offset, y2: height - PADDING })
    }
    return lines
  }, [height, width])

  return (
    <div className='space-y-3'>
      <h3 className='text-lg font-semibold'>Схема маршрутов</h3>
      <div className='overflow-x-auto'>
        <svg
          width={width}
          height={height}
          className='rounded-lg border bg-muted/20'
          role='img'
          aria-labelledby={svgTitleId}
        >
          <title id={svgTitleId}>Маршруты автомобилей на сетке района</title>
          <rect
            x={PADDING}
            y={PADDING}
            width={gridSize * CELL_SIZE}
            height={gridSize * CELL_SIZE}
            fill='white'
          />
          {gridLines.map((line) => (
            <line
              key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke='#e5e7eb'
              strokeWidth={1}
            />
          ))}

          {gridLetters.map((letter, index) => (
            <text
              key={`col-${letter}`}
              x={PADDING + index * CELL_SIZE + CELL_SIZE / 2}
              y={PADDING - 8}
              textAnchor='middle'
              className='fill-foreground text-xs'
            >
              {letter}
            </text>
          ))}
          {Array.from({ length: gridSize }, (_, index) => {
            const rowLabel = gridSize - index
            return (
              <text
                key={`row-${rowLabel}`}
                x={PADDING - 12}
                y={PADDING + index * CELL_SIZE + CELL_SIZE / 2 + 4}
                textAnchor='end'
                className='fill-foreground text-xs'
              >
                {rowLabel}
              </text>
            )
          })}

          {routes.map((route) => {
            const shipper = parseGridCode(route.shipper)
            const receiver = parseGridCode(route.receiver)
            if (!depot || !shipper || !receiver) {
              return null
            }
            const depotX = PADDING + (depot.column + 0.5) * CELL_SIZE
            const depotY = PADDING + (gridSize - depot.row - 0.5) * CELL_SIZE
            const shipperX = PADDING + (shipper.column + 0.5) * CELL_SIZE
            const shipperY =
              PADDING + (gridSize - shipper.row - 0.5) * CELL_SIZE
            const receiverX = PADDING + (receiver.column + 0.5) * CELL_SIZE
            const receiverY =
              PADDING + (gridSize - receiver.row - 0.5) * CELL_SIZE

            return (
              <polyline
                key={`${route.shipper}-${route.receiver}`}
                points={`${depotX},${depotY} ${shipperX},${shipperY} ${receiverX},${receiverY} ${depotX},${depotY}`}
                fill='none'
                stroke={route.color}
                strokeWidth={2 + route.count}
                strokeOpacity={0.75}
              />
            )
          })}

          {points.map((point) => (
            <g
              key={point.label}
              transform={`translate(${point.x}, ${point.y})`}
            >
              <circle
                r={point.isDepot ? 12 : 9}
                fill={point.isDepot ? '#111827' : '#2563eb'}
                opacity={0.9}
              />
              <text
                x={0}
                y={point.isDepot ? -18 : -14}
                textAnchor='middle'
                className='fill-foreground text-xs font-semibold'
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
