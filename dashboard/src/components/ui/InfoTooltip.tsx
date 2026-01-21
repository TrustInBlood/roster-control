import { useState } from 'react'
import { HelpCircle } from 'lucide-react'

interface InfoTooltipProps {
  text: string
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  const [show, setShow] = useState(false)

  return (
    <div className="relative inline-block">
      <HelpCircle
        className="w-4 h-4 text-gray-500 hover:text-gray-300 cursor-help ml-1.5"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div className="absolute z-50 w-64 p-2.5 text-xs text-gray-200 bg-discord-darker border border-discord-lighter rounded-md shadow-lg -top-2 left-6 leading-relaxed">
          {text}
        </div>
      )}
    </div>
  )
}
