// Fatia do coach embutida em qualquer tela: top findings + input conectado
// ao MESMO chat global (contexto) + atalho pro coach completo.
import { useState } from 'react'
import { useCoach } from '../coach/CoachContext'
import type { Finding } from '../lib/coach'

interface Props {
  title: string
  findings: Finding[]
  scopeHint: string
  chips?: string[]
  onOpenFull: () => void
}

const SEV_COLOR = { 1: 'var(--good)', 2: 'var(--warn)', 3: 'var(--bad)' } as const

export default function CoachStrip({ title, findings, scopeHint, chips, onOpenFull }: Props) {
  const { send, busy } = useCoach()
  const [input, setInput] = useState('')
  const top = [...findings]
    .sort((a, b) => b.severity - a.severity)
    .filter((f) => f.kind === 'fraqueza')
    .slice(0, 3)

  const ask = (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    setInput('')
    send(`${scopeHint} ${question}`.trim(), findings)
    onOpenFull()
  }

  return (
    <div className="card coachstrip">
      <h3>
        🤖 Coach <small>{title}</small>
        <button className="btn ghost" style={{ float: 'right', padding: '3px 10px' }} onClick={onOpenFull}>
          abrir coach completo →
        </button>
      </h3>
      {top.length === 0 && (
        <p className="sub" style={{ margin: '4px 0 10px' }}>Nenhum ponto crítico detectado nesta amostra.</p>
      )}
      {top.map((f) => (
        <div key={f.id} className="stripfinding">
          <span className="sevdot" style={{ background: SEV_COLOR[f.severity] }} />
          <div>
            <b>{f.title}</b>
            <div className="sub">{f.recommendation}</div>
          </div>
        </div>
      ))}
      <div className="chips" style={{ marginTop: 8 }}>
        {(chips ?? []).map((c) => (
          <button key={c} className="chip" onClick={() => ask(c)} disabled={busy}>{c}</button>
        ))}
      </div>
      <div className="chatinput" style={{ marginTop: 8 }}>
        <input
          value={input}
          placeholder="Pergunte ao coach sobre isso…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(input)}
          disabled={busy}
        />
        <button onClick={() => ask(input)} disabled={busy || !input.trim()}>Enviar</button>
      </div>
    </div>
  )
}
