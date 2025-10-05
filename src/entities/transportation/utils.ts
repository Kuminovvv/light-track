import type { DistanceMode, GridPoint } from './types'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
const GRID_SIZE = 6

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export function parseGridCode(code: string): GridPoint | null {
  const normalized = normalizeCode(code)
  const match = normalized.match(/^([A-F])(\d)$/i)
  if (!match) {
    return null
  }
  const letter = match[1].toUpperCase()
  const number = Number.parseInt(match[2], 10)
  const column = LETTERS.indexOf(letter as (typeof LETTERS)[number])
  if (column === -1) {
    return null
  }
  if (number < 1 || number > GRID_SIZE) {
    return null
  }
  return {
    code: normalized,
    column,
    row: number - 1,
  }
}

export function calculateDistance(
  from: GridPoint,
  to: GridPoint,
  cellSize: number,
  mode: DistanceMode,
): number {
  const dx = Math.abs(from.column - to.column)
  const dy = Math.abs(from.row - to.row)

  if (mode === 'manhattan') {
    return cellSize * (dx + dy)
  }

  return cellSize * Math.hypot(dx, dy)
}

export function formatHours(value: number): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatDistance(value: number): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export const depotPoint: GridPoint = {
  code: 'D5',
  column: 3,
  row: 4,
}

export const gridSize = GRID_SIZE
export const gridLetters = LETTERS
