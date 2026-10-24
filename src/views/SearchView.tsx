// Busca semântica nos rounds da base oficial (Ollama nomic-embed-text).
// Referências de partidas profissionais ficam a cargo do agente coach
// (tool buscar_partidas_pro), não da busca do usuário.
import { useState } from 'react'
import { useCoach } from '../coach/CoachContext'
import { searchRounds, type RoundHit } from '../lib/roundsearch'

const EXAMPLES = [
  'retake falho no site A',
  'clutch 1v3 ganho',
  'anti-eco perdido com vandal',
  'plant rápido no site B e rotação lenta',
]

export default function SearchView() {
  const { onOpenMatch } = useCoach()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [roundHits, setRoundHits] = useState<RoundHit[]>([])
  const [searchMode, setSearchMode] = useState<'semantico' | 'lexical'>('semantico')
  const [err, setErr] = useState<string | null>(null)

  const run = async (query: string) => {
    const question = query.trim()
    if (!question || busy) return
    setBusy(true)
    setErr(null)
    try {
      const { hits, meta } = await searchRounds(question, 10)
      setRoundHits(hits)
      setSearchMode(meta.mode)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>
        🔍 Buscar rounds
        <small>922 rounds · {searchMode === 'semantico' ? 'semântica (nomic-embed-text)' : 'lexical'}</small>
      </h3>
      <div className="chatinput">
        <input
          value={q}
          placeholder="ex.: retake falho no site A com spike plantada…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run(q)}
          disabled={busy}
        />
        <button onClick={() => run(q)} disabled={busy || !q.trim()}>{busy ? 'buscando…' : 'Buscar'}</button>
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" onClick={() => { setQ(ex); void run(ex) }} disabled={busy}>{ex}</button>
        ))}
      </div>

      {err && <p className="sub" style={{ color: 'var(--bad)' }}>⚠️ {err}</p>}

      <div style={{ marginTop: 12 }}>
        {roundHits.map((h) => (
          <div key={`${h.matchId}#${h.round}`} className="finding" style={{ cursor: 'pointer' }} onClick={() => onOpenMatch(h.matchId, h.round)}>
            <h4>
              <span className="tag">{h.map}</span>
              <span className="tag">{h.event}</span>
              ▶ Round {h.round + 1}
              <span className="sub">similaridade {(h.score * 100).toFixed(0)}%</span>
            </h4>
            <p className="sub" style={{ maxHeight: 54, overflow: 'hidden' }}>{h.snippet.slice(0, 220)}…</p>
          </div>
        ))}
        {roundHits.length === 0 && !busy && <p className="sub">Busque rounds por situação, mapa, site, tipo de compra ou jogador.</p>}
      </div>
    </div>
  )
}
