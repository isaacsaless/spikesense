import { useEffect, useMemo, useState } from 'react'
import type { Dataset, Match, TeamId } from './types'
import { loadDataset, mapName } from './lib/load'
import { aggregatePlayers, aggregateTeam, type PlayerAgg } from './lib/metrics'
import { CoachProvider, useCoach } from './coach/CoachContext'
import Dashboard from './views/Dashboard'
import MatchView from './views/MatchView'
import PlayerView from './views/PlayerView'
import TeamView from './views/TeamView'
import CoachView from './views/CoachView'
import SearchView from './views/SearchView'

type Tab = 'coach' | 'dash' | 'busca' | 'match' | 'player' | 'team'

export interface AppSel {
  event: string
  team: string
  player: string
  matchId: string
}

function Shell({ data }: { data: Dataset }) {
  const [tab, setTab] = useState<Tab>('coach')
  const [sel, setSel] = useState<AppSel>({ event: 'all', team: 'all', player: '', matchId: '' })
  const [focusRound, setFocusRound] = useState<number | null>(null)
  const { reset } = useCoach()

  const matches = useMemo(
    () => (sel.event === 'all' ? data.matches : data.matches.filter((m) => m.event === sel.event)),
    [data, sel.event],
  )
  const events = useMemo(() => [...new Set(data.matches.map((m) => m.event))].sort(), [data])
  const teamNames = useMemo(
    () => [...new Set(matches.flatMap((m) => [m.teams.Red.name, m.teams.Blue.name]))].sort(),
    [matches],
  )

  const playerOptions = useMemo(() => {
    if (sel.team !== 'all') {
      const set = new Set<string>()
      for (const m of matches)
        for (const t of ['Red', 'Blue'] as TeamId[])
          if (m.teams[t].name === sel.team)
            for (const pl of m.players.filter((x) => x.t === t)) set.add(pl.p)
      return [...set].map((p) => ({ p, name: data.players[p] ?? p }))
    }
    return Object.entries(data.players).map(([p, name]) => ({ p, name }))
  }, [data, matches, sel.team])

  const aggs = useMemo(() => aggregatePlayers(data, matches), [data, matches])
  const playerAgg: PlayerAgg | null = sel.player ? aggs[sel.player] ?? null : null
  const teamAgg = useMemo(
    () => (sel.team !== 'all' ? aggregateTeam(sel.team, matches) : null),
    [sel.team, matches],
  )
  const selMatch: Match | undefined = useMemo(
    () => matches.find((m) => m.id === sel.matchId),
    [matches, sel.matchId],
  )

  const openMatch = (matchId: string, round: number | null) => {
    setFocusRound(round)
    setSel((s) => ({ ...s, matchId }))
    setTab('match')
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ matchId: string; round: number }>).detail
      openMatch(d.matchId, d.round)
    }
    window.addEventListener('spikesense:open-match', handler)
    return () => window.removeEventListener('spikesense:open-match', handler)
  }, [])
  // seleção NÃO navega: os filtros só mudam o contexto; navegação é explícita
  const pickTeam = (team: string) => setSel((s) => ({ ...s, team, player: '' }))
  const pickPlayer = (player: string) => setSel((s) => ({ ...s, player }))
  useEffect(() => {
    reset()
  }, [sel.player, sel.team, reset])

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'coach', label: '🤖 Coach IA' },
    { id: 'dash', label: 'Visão Geral' },
    { id: 'busca', label: '🔍 Busca' },
    { id: 'match', label: 'Partida', disabled: !selMatch },
    { id: 'player', label: 'Jogador', disabled: !playerAgg },
    { id: 'team', label: 'Time', disabled: !teamAgg },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <b>SPIKE<em>SENSE</em></b>
          <span>coach de dados · Hackathon SEMCOMP 2026</span>
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'on' : ''}
              disabled={t.disabled}
              onClick={() => !t.disabled && setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="selbar">
        <div className="seg">
          <button
            className={sel.event === 'all' ? 'on' : ''}
            onClick={() => setSel({ event: 'all', team: 'all', player: '', matchId: '' })}
          >
            Todas
          </button>
          {events.map((ev) => (
            <button
              key={ev}
              className={sel.event === ev ? 'on' : ''}
              onClick={() => setSel((s) => ({ ...s, event: ev, team: 'all', player: '', matchId: '' }))}
            >
              {ev}
            </button>
          ))}
        </div>
        <select value={sel.team} onChange={(e) => pickTeam(e.target.value)}>
          <option value="all">Time: todos</option>
          {teamNames.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={sel.player} onChange={(e) => pickPlayer(e.target.value)}>
          <option value="">Jogador: —</option>
          {playerOptions.map((p) => (
            <option key={p.p} value={p.p}>{p.name}</option>
          ))}
        </select>
        {playerAgg && (
          <button className="ctxchip" onClick={() => setTab('player')}>
            <b>{playerAgg.name}</b> · ACS {playerAgg.acs} · K/D {playerAgg.kd.toFixed(2)}
            <span className="x" onClick={(e) => { e.stopPropagation(); pickPlayer('') }}>✕</span>
          </button>
        )}
        {teamAgg && !playerAgg && (
          <button className="ctxchip" onClick={() => setTab('team')}>
            <b>{teamAgg.name}</b> · {teamAgg.wins}V-{teamAgg.matches - teamAgg.wins}D
            <span className="x" onClick={(e) => { e.stopPropagation(); pickTeam('all') }}>✕</span>
          </button>
        )}
      </div>

      {tab === 'busca' && <SearchView />}
      {tab === 'dash' && (
        <Dashboard
          matches={matches}
          aggs={aggs}
          onMatch={(id) => openMatch(id, null)}
          onPlayer={(p) => { pickPlayer(p); setTab('player') }}
        />
      )}
      {tab === 'match' && selMatch && (
        <MatchView
          m={selMatch}
          focusRound={focusRound}
          onOpenCoach={() => setTab('coach')}
        />
      )}
      {tab === 'player' && playerAgg && (
        <PlayerView agg={playerAgg} onOpenCoach={() => setTab('coach')} />
      )}
      {tab === 'team' && teamAgg && <TeamView agg={teamAgg} onOpenCoach={() => setTab('coach')} />}
      {tab === 'coach' && <CoachView playerAgg={playerAgg} teamAgg={teamAgg} />}

      <footer className="footer">
        SpikeSense · dados oficiais do Hackathon · análise pós-partada ·
        base: {data.matches.length} partidas ({mapName(data.matches[0]?.map ?? '')} e mais) · gerada em {data.generated}
      </footer>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    loadDataset()
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
  }, [])

  if (err)
    return (
      <div className="app">
        <div className="card">
          <h3>Erro ao carregar a base</h3>
          <p className="sub">{err}</p>
          <p className="sub">Rode <code>npm run build:data</code> para gerar public/data.json.</p>
        </div>
      </div>
    )

  if (!data)
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
          <div>Carregando base de partidas…</div>
        </div>
      </div>
    )

  return (
    <CoachProvider
      data={data}
      onOpenMatch={(matchId, round) => {
        // o handler real vive no Shell; o provider só repassa via contexto
        window.dispatchEvent(new CustomEvent('spikesense:open-match', { detail: { matchId, round } }))
      }}
    >
      <Shell data={data} />
    </CoachProvider>
  )
}
