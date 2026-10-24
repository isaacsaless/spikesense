// Tela completa do Coach — consome o chat global (CoachContext), então a
// conversa continua a mesma vindas das strips de outras telas.
import { useEffect, useRef, useState } from 'react'
import type { PlayerAgg, TeamAgg } from '../lib/metrics'
import { playerFindings, teamFindings, type Finding } from '../lib/coach'
import { useCoach } from '../coach/CoachContext'
import { RichCoachText } from '../coach/RichCoachText'

interface Props {
  playerAgg: PlayerAgg | null
  teamAgg: TeamAgg | null
}

const CHIPS_PLAYER = [
  'Como eu melhoro meu desempenho?',
  'Onde eu perdi rounds decisivos? (linka)',
  'Monte um plano de treino da semana',
]
const CHIPS_TEAM = [
  'Onde o time perde mais rounds?',
  'Rounds críticos que mudaram partidas (linka)',
  'O que treinar antes do próximo jogo?',
]
const CHIPS_GERAL = [
  'Quem são os melhores jogadores da base?',
  'Melhor clutch da temporada (linka)',
  'Compare os 2 melhores jogadores',
]

export default function CoachView({ playerAgg, teamAgg }: Props) {
  const { msgs, busy, send } = useCoach()
  const [mode, setMode] = useState<'player' | 'team'>(playerAgg ? 'player' : 'team')
  const [input, setInput] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMode(playerAgg ? 'player' : 'team')
  }, [playerAgg, teamAgg])

  const active = mode === 'player' ? playerAgg : teamAgg
  const findings: Finding[] =
    mode === 'player' && playerAgg
      ? playerFindings(playerAgg)
      : teamAgg
        ? teamFindings(teamAgg)
        : []

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [msgs, busy])

  const ask = (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    setInput('')
    const scope =
      mode === 'player' && playerAgg ? `(foco no jogador ${playerAgg.name}) `
      : mode === 'team' && teamAgg ? `(foco no time ${teamAgg.name}) `
      : ''
    send(scope + question, findings)
  }

  const chips = mode === 'player' && playerAgg ? CHIPS_PLAYER : teamAgg ? CHIPS_TEAM : CHIPS_GERAL
  const fraquezas = findings.filter((f) => f.kind === 'fraqueza')
  const forcas = findings.filter((f) => f.kind === 'forca')

  return (
    <div className="grid2">
      <div>
        <div className="card">
          <h3>
            📋 Relatório do Coach
            <small>{active ? (mode === 'player' ? playerAgg?.name : teamAgg?.name) : 'base completa'}</small>
          </h3>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className={mode === 'player' ? 'btn' : 'btn ghost'} disabled={!playerAgg} onClick={() => setMode('player')}>
              Jogador
            </button>
            <button className={mode === 'team' ? 'btn' : 'btn ghost'} disabled={!teamAgg} onClick={() => setMode('team')}>
              Time
            </button>
          </div>
          {!active && (
            <p className="sub">
              Selecione um jogador ou time na barra acima para o relatório priorizado — ou pergunte direto:
              o agente busca qualquer nome da base com as ferramentas dele.
            </p>
          )}
          {fraquezas.map((f) => (
            <div key={f.id} className={`finding sev${f.severity} ${f.kind}`}>
              <h4><span className="tag">{f.tag}</span> {f.title}</h4>
              <p>{f.evidence}</p>
              <p><b>✅ {f.recommendation}</b></p>
              {f.drill && <p className="sub">🎯 {f.drill}</p>}
            </div>
          ))}
          {forcas.map((f) => (
            <div key={f.id} className={`finding sev1 ${f.kind}`}>
              <h4><span className="tag">{f.tag}</span> {f.title}</h4>
              <p>{f.evidence}</p>
              <p>{f.recommendation}</p>
            </div>
          ))}
          {active && findings.length === 0 && (
            <p className="sub">Nenhum padrão crítico detectado — amostra pequena ou desempenho equilibrado.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>💬 Agente Coach</h3>
        <div className="chat">
          <div className="chatlog" ref={logRef}>
            {msgs.length === 0 && (
              <div className="msg model">
                Olá! Sou o coach do SpikeSense — pergunte qualquer coisa sobre jogadores, times,
                partidas ou momentos da base. Eu mesmo busco os dados e linko os rounds que viraram o jogo.
              </div>
            )}
            {msgs.map((m, i) => {
              if (m.role !== 'model') return <div key={i} className={`msg ${m.role}`}>{m.text}</div>
              const lines = m.text.split('\n')
              const traceStart = lines[0]?.startsWith('🔍') ? 1 : 0
              const trace = traceStart
                ? lines[0].slice(1).split('→').map((t) => t.trim()).filter(Boolean)
                : []
              const body = lines.slice(traceStart).join('\n').trim()
              return (
                <div key={i} className="msg model">
                  {trace.length > 0 && (
                    <div className="chips" style={{ marginBottom: 8 }}>
                      {trace.map((t, j) => <span key={j} className="chip">{t}</span>)}
                    </div>
                  )}
                  <RichCoachText text={body} />
                </div>
              )
            })}
            {busy && <div className="msg model">analisando os dados…</div>}
          </div>
          <div className="chips">
            {chips.map((c) => (
              <button key={c} className="chip" onClick={() => ask(c)} disabled={busy}>{c}</button>
            ))}
          </div>
          <div className="chatinput">
            <input
              value={input}
              placeholder="Pergunte ao coach…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask(input)}
              disabled={busy}
            />
            <button onClick={() => ask(input)} disabled={busy || !input.trim()}>Enviar</button>
          </div>
        </div>
        <p className="sub" style={{ marginTop: 8 }}>
          O agente responde exclusivamente com os dados oficiais do Hackathon — nada é coletado externamente.
        </p>
      </div>
    </div>
  )
}
