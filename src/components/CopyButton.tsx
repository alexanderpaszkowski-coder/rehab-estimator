import { useState } from 'react'

interface Props {
  getText: () => string
  label?: string
}

export function CopyButton({ getText, label = 'Copy for AI' }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText())
      setState('copied')
      setTimeout(() => setState('idle'), 2200)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2200)
    }
  }

  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm copy-btn ${state !== 'idle' ? `copy-btn-${state}` : ''}`}
      onClick={handleCopy}
    >
      {state === 'copied' ? '✓ Copied' : state === 'error' ? 'Failed' : label}
    </button>
  )
}
