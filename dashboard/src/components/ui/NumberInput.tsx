import { useState, useEffect } from 'react'

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  min?: number
  max?: number
  id?: string
  name?: string
  className?: string
}

export default function NumberInput({
  value,
  onChange,
  disabled,
  min,
  max,
  id,
  name,
  className = '',
}: NumberInputProps) {
  // Local string state for the input - allows empty and intermediate values
  const [localValue, setLocalValue] = useState(String(value))
  const [hasError, setHasError] = useState(false)

  // Sync local value when prop changes (e.g., from server)
  useEffect(() => {
    setLocalValue(String(value))
    setHasError(false)
  }, [value])

  const validate = (val: string): { valid: boolean; parsed: number } => {
    if (val === '' || val === '-') {
      return { valid: false, parsed: 0 }
    }
    const parsed = parseFloat(val)
    if (isNaN(parsed)) {
      return { valid: false, parsed: 0 }
    }
    if (min !== undefined && parsed < min) {
      return { valid: false, parsed: min }
    }
    if (max !== undefined && parsed > max) {
      return { valid: false, parsed: max }
    }
    return { valid: true, parsed }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalValue(val)
    // Clear error while typing
    if (hasError) {
      setHasError(false)
    }
  }

  const handleBlur = () => {
    const { valid, parsed } = validate(localValue)
    if (valid) {
      onChange(parsed)
      setHasError(false)
    } else {
      setHasError(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const { valid, parsed } = validate(localValue)
      if (valid) {
        onChange(parsed)
        setHasError(false)
      } else {
        setHasError(true)
      }
    }
  }

  return (
    <input
      type="number"
      step="any"
      min={min}
      max={max}
      id={id}
      name={name}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-form-type="other"
      data-lpignore="true"
      data-1p-ignore="true"
      className={`bg-discord-darker border rounded-md px-3 py-2 text-white text-right focus:outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
        hasError
          ? 'border-red-500 focus:border-red-500'
          : 'border-discord-lighter focus:border-discord-blurple'
      } ${className}`}
    />
  )
}
