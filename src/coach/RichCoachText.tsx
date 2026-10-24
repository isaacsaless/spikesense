// Renderizador das mensagens do coach com **negrito** e botões ▶ de deep-link
// (spike://match/ID?round=N) — puxa onOpenMatch direto do contexto global.
import { useCoach } from './CoachContext'

function RichLine({ line, onOpenMatch }: { line: string; onOpenMatch: (id: string, r: number) => void }) {
  const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(spike:\/\/match\/[^)]+\))/g)
  return (
    <>
      {parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) return <b key={j}>{part.slice(2, -2)}</b>
        const lm = part.match(/^\[([^\]]+)\]\(spike:\/\/match\/([^?)]+)\?round=(\d+)\)$/)
        if (lm)
          return (
            <button
              key={j}
              className="chip"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              onClick={() => onOpenMatch(lm[2], Number(lm[3]))}
            >
              ▶ {lm[1]}
            </button>
          )
        return <span key={j}>{part}</span>
      })}
    </>
  )
}

export function RichCoachText({ text }: { text: string }) {
  const { onOpenMatch } = useCoach()
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          <RichLine line={line} onOpenMatch={onOpenMatch} />
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}
