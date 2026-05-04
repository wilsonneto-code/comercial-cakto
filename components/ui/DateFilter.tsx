import { useEffect, useState } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Field } from '@/components/ui/Field'

export interface DateRange {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
}

interface DateFilterProps {
  value?: string
  onChange: (range: DateRange) => void
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

function buildPastMonthLabels(): string[] {
  const now = new Date()
  return [1, 2, 3].map(i => format(subMonths(now, i), 'MMMM yyyy', { locale: ptBR }))
}

function rangeFromOption(option: string): DateRange {
  const now = new Date()
  switch (option) {
    case 'Hoje':
      return { startDate: fmt(now), endDate: fmt(now) }
    case 'Esta Semana':
      return {
        startDate: fmt(startOfWeek(now, { weekStartsOn: 1 })),
        endDate: fmt(endOfWeek(now, { weekStartsOn: 1 })),
      }
    case 'Semana Anterior': {
      const prev = subWeeks(now, 1)
      return {
        startDate: fmt(startOfWeek(prev, { weekStartsOn: 1 })),
        endDate: fmt(endOfWeek(prev, { weekStartsOn: 1 })),
      }
    }
    case 'Mês Atual':
      return { startDate: fmt(startOfMonth(now)), endDate: fmt(endOfMonth(now)) }
    default: {
      for (let i = 1; i <= 3; i++) {
        const d = subMonths(now, i)
        if (option === format(d, 'MMMM yyyy', { locale: ptBR })) {
          return { startDate: fmt(startOfMonth(d)), endDate: fmt(endOfMonth(d)) }
        }
      }
      return { startDate: '', endDate: '' }
    }
  }
}

const PAST_MONTHS = buildPastMonthLabels()
const PRESET_OPTIONS = ['Hoje', 'Esta Semana', 'Semana Anterior', 'Mês Atual', ...PAST_MONTHS, 'Data Personalizada']

export function DateFilter({ value = 'Mês Atual', onChange }: DateFilterProps) {
  const [selected, setSelected] = useState(value)
  const [custom, setCustom] = useState({ start: '', end: '' })

  // Fire initial range on mount
  useEffect(() => {
    if (value !== 'Data Personalizada') {
      onChange(rangeFromOption(value))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSelect(opt: string) {
    setSelected(opt)
    if (opt !== 'Data Personalizada') {
      onChange(rangeFromOption(opt))
    }
  }

  function handleCustomChange(field: 'start' | 'end', val: string) {
    const next = { ...custom, [field]: val }
    setCustom(next)
    if (next.start && next.end && next.start <= next.end) {
      onChange({ startDate: next.start, endDate: next.end })
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 200 }}>
        <select
          className="inp"
          value={selected}
          onChange={e => handleSelect(e.target.value)}
          style={{ cursor: 'pointer', textTransform: 'capitalize' }}
        >
          {PRESET_OPTIONS.map(opt => (
            <option key={opt} value={opt} style={{ textTransform: 'capitalize' }}>{opt}</option>
          ))}
        </select>
      </div>

      {selected === 'Data Personalizada' && (
        <>
          <div style={{ minWidth: 160 }}>
            <Field label="Data Inicial">
              <input
                className="inp"
                type="date"
                value={custom.start}
                onChange={e => handleCustomChange('start', e.target.value)}
              />
            </Field>
          </div>
          <div style={{ minWidth: 160 }}>
            <Field label="Data Final">
              <input
                className="inp"
                type="date"
                value={custom.end}
                onChange={e => handleCustomChange('end', e.target.value)}
              />
            </Field>
          </div>
        </>
      )}
    </div>
  )
}
