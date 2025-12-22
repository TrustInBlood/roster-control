import type { DutyPeriod, DutyType } from '../../types/duty'
import { DUTY_PERIOD_LABELS, DUTY_TYPE_LABELS } from '../../types/duty'

interface DutyFiltersProps {
  period: DutyPeriod
  dutyType: DutyType
  onPeriodChange: (period: DutyPeriod) => void
  onDutyTypeChange: (type: DutyType) => void
}

export default function DutyFilters({
  period,
  dutyType,
  onPeriodChange,
  onDutyTypeChange,
}: DutyFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {/* Period Filter */}
      <select
        value={period}
        onChange={(e) => onPeriodChange(e.target.value as DutyPeriod)}
        className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
      >
        {Object.entries(DUTY_PERIOD_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Duty Type Filter */}
      <select
        value={dutyType}
        onChange={(e) => onDutyTypeChange(e.target.value as DutyType)}
        className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
      >
        {Object.entries(DUTY_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}
