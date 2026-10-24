// Busca global: rounds da base (semântica via Ollama) + trechos de VODs do
// serviço local (8765). Rounds abrem no round exato via deep-link.
import { useState } from 'react'
import { useCoach } from '../coach/CoachContext'
import { searchRounds, type RoundHit } from '../lib/roundsearch'
import { searchVods, openVodSearch, type VodHit } from '../lib/vodsearch'

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
  const [mode, setMode] = useState<'rounds' | 'vods'>('rounds')
  const [roundHits, setRoundHits] = useState<RoundHit[]>([])
  const [vodHits, setVodHits] = useState<VodHit[]>([])
  const [searchMode, setSearchMode] = useState<'semantico' | 'lexical'>('semantico')
  const [err, setErr] = useState<string | null>(null)

  const run = async (query: string) => {
    const question = query.trim()
    if (!question || busy) return
    setBusy(true)
    setErr(null)
    try {
      if (mode === 'rounds') {
        const { hits, meta } = await searchRounds(question, 10)
        setRoundHits(hits)
        setSearchMode(meta.mode)
      } else {
        setVodHits(await searchVods(question, 8))
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>
        🔍 Busca
        <small>
          {mode === 'rounds'
            ? `922 rounds · ${searchMode === 'semantico' ? 'semântica (nomic-embed-text)' : 'lexical'}`
            : 'VODs com timestamps'}
        </small>
      </h3>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={mode === 'rounds' ? 'btn' : 'btn ghost'} onClick={() => setMode('rounds')}>
          Rounds da base
        </button>
        <button className={mode === 'vods' ? 'btn' : 'btn ghost'} onClick={() => setMode('vods')}>
          VODs (cast)
        </button>
      </div>
      <div className="chatinput">
        <input
          value={q}
          placeholder={mode === 'rounds' ? 'ex.: retake falho no site A com spike plantada…' : 'ex.: clutch no site B (em inglês funciona melhor)…'}
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

      {mode === 'rounds' && (
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
      )}

      {mode === 'vods' && (
        <div style={{ marginTop: 12 }}>
          {vodHits.map((h, i) => (
            <div key={i} className="finding">
              <h4>
                <span className="tag">VOD</span>
                ⏱ {h.mmss}
                <span className="sub">score {(h.score * 100).toFixed(0)}%</span>
              </h4>
              <p className="sub">{h.text.slice(0, 260)}…</p>
            </div>
          ))}
          {vodHits.length > 0 && (
            <button className="btn ghost" onClick={() => openVodSearch(q)}>
              ▶ abrir no serviço de VODs (com player)
            </button>
          )}
          {vodHits.length === 0 && !busy && <p className="sub">Busca no serviço local de VODs (127.0.0.1:8765) — precisa estar rodando.</p>}
        </div>
      )}
    </div>
  )
}
