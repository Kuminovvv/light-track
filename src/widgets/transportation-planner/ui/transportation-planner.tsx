'use client'

import type { PlannerParameters, PlanResult, RequestInput } from '@entities'
import {
  buildPlan,
  defaultParameters,
  formatDistance,
  formatHours,
} from '@entities'
import { Button } from '@shared/ui/button'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { GanttChart } from './gantt-chart'
import { RouteMap } from './route-map'
import type { RequestLegendEntry } from './types'

type EditableRequest = RequestInput

const colorPalette = [
  '#2563eb',
  '#fb923c',
  '#10b981',
  '#f97316',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
]

function createEmptyRequest(): EditableRequest {
  return {
    id: crypto.randomUUID(),
    shipperCode: '',
    receiverCode: '',
    volume: 0,
    workingHours: 8,
  }
}

export function TransportationPlanner() {
  const [requests, setRequests] = useState<EditableRequest[]>([
    {
      id: crypto.randomUUID(),
      shipperCode: 'B3',
      receiverCode: 'E2',
      volume: 8,
      workingHours: 10,
    },
  ])
  const [parameters, setParameters] =
    useState<PlannerParameters>(defaultParameters)
  const [plan, setPlan] = useState<PlanResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [visualizationTab, setVisualizationTab] = useState<'gantt' | 'map'>(
    'gantt',
  )

  const colorMap = useMemo(() => {
    const map = new Map<string, RequestLegendEntry>()
    if (!plan) {
      return map
    }
    plan.trips.forEach((trip, index) => {
      if (!map.has(trip.requestId)) {
        map.set(trip.requestId, {
          color: colorPalette[index % colorPalette.length],
          label: trip.requestLabel,
        })
      }
    })
    return map
  }, [plan])

  const handleRequestChange = <K extends keyof EditableRequest>(
    id: string,
    field: K,
    value: EditableRequest[K],
  ) => {
    setRequests((prev) =>
      prev.map((request) =>
        request.id === id
          ? {
              ...request,
              [field]: value,
            }
          : request,
      ),
    )
  }

  const handleAddRequest = () => {
    setRequests((prev) => [...prev, createEmptyRequest()])
  }

  const handleRemoveRequest = (id: string) => {
    setRequests((prev) =>
      prev.length === 1 ? prev : prev.filter((request) => request.id !== id),
    )
  }

  const handleParameterChange = <K extends keyof PlannerParameters>(
    field: K,
    value: PlannerParameters[K],
  ) => {
    setParameters((prev) => ({ ...prev, [field]: value }))
  }

  const handleCalculate = () => {
    const sanitized = requests
      .map((request) => ({
        ...request,
        shipperCode: request.shipperCode.trim().toUpperCase(),
        receiverCode: request.receiverCode.trim().toUpperCase(),
        workingHours:
          Number.isFinite(request.workingHours) && request.workingHours > 0
            ? request.workingHours
            : 8,
        volume:
          Number.isFinite(request.volume) && request.volume > 0
            ? request.volume
            : 0,
      }))
      .filter(
        (request) =>
          request.shipperCode && request.receiverCode && request.volume > 0,
      )

    if (sanitized.length === 0) {
      setPlan(null)
      setErrors(['Необходимо добавить хотя бы одну корректную заявку.'])
      return
    }

    if (
      parameters.capacity <= 0 ||
      parameters.speed <= 0 ||
      parameters.cellSize <= 0
    ) {
      setPlan(null)
      setErrors([
        'Проверьте параметры перевозки: вместимость, скорость и размер клетки должны быть больше нуля.',
      ])
      return
    }

    const calculation = buildPlan(sanitized, parameters)
    setPlan(calculation)
    setErrors(calculation.errors)
    if (calculation.trips.length === 0) {
      setVisualizationTab('gantt')
    }
  }

  const handleExportCsv = () => {
    if (!plan) {
      return
    }
    const rows: string[][] = []
    rows.push(['Сводка'])
    rows.push(['Количество рейсов', String(plan.summary.totalTrips)])
    rows.push(['Перевезённый объём, т', plan.summary.totalVolume.toFixed(2)])
    rows.push(['Пробег общий, км', plan.summary.totalDistance.toFixed(1)])
    rows.push(['Пробег с грузом, км', plan.summary.loadedDistance.toFixed(1)])
    rows.push(['Пробег без груза, км', plan.summary.emptyDistance.toFixed(1)])
    rows.push([
      'Коэффициент использования',
      plan.summary.utilization.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ])
    rows.push([
      'Автомобилей задействовано',
      String(plan.summary.vehiclesRequired),
    ])
    rows.push([])
    rows.push(['Рейсы'])
    rows.push([
      'Авто',
      'Рейс',
      'Маршрут',
      'Тоннаж, т',
      'Расстояние, км',
      'Время, ч',
      'Начало, ч',
      'Окончание, ч',
    ])

    plan.trips.forEach((trip) => {
      rows.push([
        `#${trip.vehicleId}`,
        String(trip.tripNumber),
        trip.requestLabel,
        trip.load.toFixed(2),
        trip.distances.total.toFixed(1),
        trip.timing.total.toFixed(2),
        trip.schedule.startTime.toFixed(2),
        trip.schedule.endTime.toFixed(2),
      ])
    })

    const csvContent = rows.map((row) => row.join(';')).join('\n')
    const blob = new Blob([`\ufeff${csvContent}`], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'operational-plan.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className='space-y-10'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-bold'>
          Оперативное планирование перевозок
        </h1>
        <p className='text-muted-foreground'>
          Введите заявки клиентов, настройте параметры перевозок и выполните
          расчёт.
        </p>
      </header>

      <section className='rounded-xl border bg-card p-6 shadow-sm'>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-xl font-semibold'>Заявки на перевозку</h2>
          <Button type='button' variant='outline' onClick={handleAddRequest}>
            Добавить заявку
          </Button>
        </div>
        <div className='overflow-x-auto'>
          <table className='min-w-full divide-y divide-border text-sm'>
            <thead className='bg-muted/50'>
              <tr>
                <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                  Грузоотправитель
                </th>
                <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                  Грузополучатель
                </th>
                <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                  Объём, т
                </th>
                <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                  Рабочее время, ч
                </th>
                <th className='px-3 py-2' />
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className='px-3 py-2'>
                    <input
                      className='w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-primary'
                      value={request.shipperCode}
                      onChange={(event) =>
                        handleRequestChange(
                          request.id,
                          'shipperCode',
                          event.target.value,
                        )
                      }
                      placeholder='Например, A2'
                    />
                  </td>
                  <td className='px-3 py-2'>
                    <input
                      className='w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-primary'
                      value={request.receiverCode}
                      onChange={(event) =>
                        handleRequestChange(
                          request.id,
                          'receiverCode',
                          event.target.value,
                        )
                      }
                      placeholder='Например, C5'
                    />
                  </td>
                  <td className='px-3 py-2'>
                    <input
                      type='number'
                      min={0}
                      step={0.1}
                      className='w-28 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-primary'
                      value={request.volume}
                      onChange={(event) =>
                        handleRequestChange(
                          request.id,
                          'volume',
                          Number(event.target.value),
                        )
                      }
                    />
                  </td>
                  <td className='px-3 py-2'>
                    <input
                      type='number'
                      min={0}
                      step={0.5}
                      className='w-28 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-primary'
                      value={request.workingHours}
                      onChange={(event) =>
                        handleRequestChange(
                          request.id,
                          'workingHours',
                          Number(event.target.value),
                        )
                      }
                    />
                  </td>
                  <td className='px-3 py-2 text-right'>
                    <Button
                      type='button'
                      variant='ghost'
                      onClick={() => handleRemoveRequest(request.id)}
                      disabled={requests.length === 1}
                    >
                      Удалить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className='rounded-xl border bg-card p-6 shadow-sm'>
        <h2 className='mb-4 text-xl font-semibold'>Параметры расчёта</h2>
        <div className='grid gap-4 md:grid-cols-3'>
          <ParameterField
            label='Грузоподъёмность автомобиля, т'
            value={parameters.capacity}
            min={1}
            step={0.5}
            onChange={(value) => handleParameterChange('capacity', value)}
          />
          <ParameterField
            label='Время на погрузку/выгрузку, ч/т'
            value={parameters.loadUnloadRate}
            min={0.01}
            step={0.01}
            onChange={(value) => handleParameterChange('loadUnloadRate', value)}
          />
          <ParameterField
            label='Размер клетки, км'
            value={parameters.cellSize}
            min={1}
            step={0.5}
            onChange={(value) => handleParameterChange('cellSize', value)}
          />
          <ParameterField
            label='Средняя скорость, км/ч'
            value={parameters.speed}
            min={1}
            step={1}
            onChange={(value) => handleParameterChange('speed', value)}
          />
          <ParameterField
            label='Длительность смены, ч'
            value={parameters.workdayLength}
            min={1}
            step={1}
            onChange={(value) => handleParameterChange('workdayLength', value)}
          />
          <div className='space-y-2'>
            <span className='block text-sm font-medium text-muted-foreground'>
              Метод расчёта расстояний
            </span>
            <select
              className='w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-primary'
              value={parameters.distanceMode}
              onChange={(event) =>
                handleParameterChange(
                  'distanceMode',
                  event.target.value as PlannerParameters['distanceMode'],
                )
              }
            >
              <option value='manhattan'>Изолированный (манхэттенский)</option>
              <option value='euclidean'>Топографический (евклидов)</option>
            </select>
          </div>
        </div>
        <div className='mt-6 flex flex-wrap gap-3'>
          <Button type='button' onClick={handleCalculate}>
            Рассчитать план
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={handleExportCsv}
            disabled={!plan}
          >
            Экспорт в CSV
          </Button>
        </div>
        {errors.length > 0 && (
          <ul className='mt-4 space-y-2 text-sm text-destructive'>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </section>

      {plan && (
        <section className='space-y-8'>
          <SummaryCards plan={plan} />
          <TripsTable plan={plan} />
          <VehicleTable plan={plan} />
          <section className='rounded-xl border bg-card p-6 shadow-sm'>
            <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
              <div>
                <h2 className='text-xl font-semibold'>Визуализации</h2>
                <p className='text-sm text-muted-foreground'>
                  Переключайтесь между схемой маршрутов и диаграммой Ганта.
                </p>
              </div>
              <div className='inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-1'>
                <TabButton
                  isActive={visualizationTab === 'gantt'}
                  onClick={() => setVisualizationTab('gantt')}
                >
                  Диаграмма Ганта
                </TabButton>
                <TabButton
                  isActive={visualizationTab === 'map'}
                  onClick={() => setVisualizationTab('map')}
                >
                  Схема маршрутов
                </TabButton>
              </div>
            </div>
            <div className='mt-6'>
              {visualizationTab === 'gantt' ? (
                <GanttChart
                  vehicles={plan.vehicles}
                  colorMap={colorMap}
                  horizon={parameters.workdayLength}
                />
              ) : (
                <RouteMap plan={plan} colorMap={colorMap} />
              )}
            </div>
          </section>
        </section>
      )}
    </div>
  )
}

interface ParameterFieldProps {
  label: string
  value: number
  min: number
  step: number
  onChange: (value: number) => void
}

function ParameterField({
  label,
  value,
  min,
  step,
  onChange,
}: ParameterFieldProps) {
  return (
    <label className='space-y-2'>
      <span className='block text-sm font-medium text-muted-foreground'>
        {label}
      </span>
      <input
        type='number'
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className='w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-primary'
      />
    </label>
  )
}

interface SummaryCardsProps {
  plan: PlanResult
}

function SummaryCards({ plan }: SummaryCardsProps) {
  const cards = [
    {
      title: 'Рейсов выполнено',
      value: plan.summary.totalTrips,
      description: 'Общее количество рейсов по всем заявкам',
    },
    {
      title: 'Перевезено, тонн',
      value: plan.summary.totalVolume.toFixed(2),
      description: 'Совокупный объём перевозок',
    },
    {
      title: 'Общий пробег, км',
      value: formatDistance(plan.summary.totalDistance),
      description: 'Пробег автомобилей за сутки',
    },
    {
      title: 'Коэффициент пробега',
      value: plan.summary.utilization.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      description: 'Отношение пробега с грузом к общему',
    },
    {
      title: 'Максимальное время, ч',
      value: formatHours(plan.summary.maxCompletionTime),
      description: 'Завершение последнего рейса',
    },
    {
      title: 'Автомобилей задействовано',
      value: plan.summary.vehiclesRequired,
      description: 'Минимальное число машин в работе',
    },
  ]

  return (
    <section className='grid gap-4 md:grid-cols-3'>
      {cards.map((card) => (
        <div
          key={card.title}
          className='rounded-xl border bg-card p-4 shadow-sm'
        >
          <div className='text-sm font-medium text-muted-foreground'>
            {card.title}
          </div>
          <div className='mt-2 text-2xl font-semibold'>{card.value}</div>
          <p className='mt-2 text-sm text-muted-foreground'>
            {card.description}
          </p>
        </div>
      ))}
    </section>
  )
}

interface TripsTableProps {
  plan: PlanResult
}

function TripsTable({ plan }: TripsTableProps) {
  return (
    <section className='rounded-xl border bg-card p-6 shadow-sm'>
      <h2 className='mb-4 text-xl font-semibold'>Детализация рейсов</h2>
      <div className='overflow-x-auto'>
        <table className='min-w-full divide-y divide-border text-sm'>
          <thead className='bg-muted/50'>
            <tr>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Автомобиль
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Рейс
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Маршрут
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Тоннаж, т
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Пробег, км
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Время, ч
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Начало
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Окончание
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Примечания
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border'>
            {plan.trips.map((trip) => (
              <tr key={trip.id}>
                <td className='px-3 py-2'>#{trip.vehicleId}</td>
                <td className='px-3 py-2'>{trip.tripNumber}</td>
                <td className='px-3 py-2'>{trip.requestLabel}</td>
                <td className='px-3 py-2'>{trip.load.toFixed(2)}</td>
                <td className='px-3 py-2'>{trip.distances.total.toFixed(1)}</td>
                <td className='px-3 py-2'>{trip.timing.total.toFixed(2)}</td>
                <td className='px-3 py-2'>
                  {trip.schedule.startTime.toFixed(2)}
                </td>
                <td className='px-3 py-2'>
                  {trip.schedule.endTime.toFixed(2)}
                </td>
                <td className='px-3 py-2 text-xs text-muted-foreground'>
                  {trip.warnings.length > 0 ? trip.warnings.join('; ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface VehicleTableProps {
  plan: PlanResult
}

function VehicleTable({ plan }: VehicleTableProps) {
  return (
    <section className='rounded-xl border bg-card p-6 shadow-sm'>
      <h2 className='mb-4 text-xl font-semibold'>Загрузка автопарка</h2>
      <div className='overflow-x-auto'>
        <table className='min-w-full divide-y divide-border text-sm'>
          <thead className='bg-muted/50'>
            <tr>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Автомобиль
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Рейсов
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Пробег, км
              </th>
              <th className='px-3 py-2 text-left font-medium text-muted-foreground'>
                Время, ч
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-border'>
            {plan.vehicles.map((vehicle) => (
              <tr key={vehicle.vehicleId}>
                <td className='px-3 py-2'>#{vehicle.vehicleId}</td>
                <td className='px-3 py-2'>{vehicle.trips.length}</td>
                <td className='px-3 py-2'>
                  {vehicle.totalDistance.toFixed(1)}
                </td>
                <td className='px-3 py-2'>{vehicle.totalTime.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface TabButtonProps {
  isActive: boolean
  onClick: () => void
  children: ReactNode
}

function TabButton({ isActive, onClick, children }: TabButtonProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        isActive
          ? 'bg-background text-foreground shadow'
          : 'text-muted-foreground hover:bg-background/60'
      }`}
    >
      {children}
    </button>
  )
}
