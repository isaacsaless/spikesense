// Player de VOD embutido no chat do coach: botão 🎬 expande um <video>
// que dá seek no timestamp exato da referência profissional. Sem redirect.
import { useEffect, useRef, useState } from 'react'

interface Props {
  videoIdx: number
  start: number
  label: string
}

export default function VodPlayer({ videoIdx, start, label }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!open || !v) return
    const seek = () => {
      v.currentTime = start
    }
    if (v.readyState >= 1) seek()
    else v.addEventListener('loadedmetadata', seek, { once: true })
  }, [open, start])

  return (
    <div style={{ width: '100%', marginTop: 6 }}>
      <button
        className="chip"
        style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}
        onClick={() => setOpen((o) => !o)}
      >
        🎬 {open ? 'fechar' : label}
      </button>
      {open && (
        <video
          ref={ref}
          controls
          preload="metadata"
          src={`/vodapi/video/${videoIdx}#t=${Math.floor(start)}`}
          style={{ width: '100%', borderRadius: 10, marginTop: 8, background: '#000' }}
        />
      )}
    </div>
  )
}
