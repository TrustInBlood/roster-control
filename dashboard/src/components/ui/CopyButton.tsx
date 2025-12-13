import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { copyToClipboard } from '../../lib/utils'

interface CopyButtonProps {
  text: string
  className?: string
  size?: number
}

export default function CopyButton({ text, className = '', size = 3 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`hover:text-white transition-colors ${className}`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <Check className={`w-${size} h-${size} text-green-400`} style={{ width: `${size * 4}px`, height: `${size * 4}px` }} />
      ) : (
        <Copy style={{ width: `${size * 4}px`, height: `${size * 4}px` }} />
      )}
    </button>
  )
}
