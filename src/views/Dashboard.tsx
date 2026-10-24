import type { Match } from '../types'
import type { PlayerAgg } from '../lib/metrics'
import { analyze } from '../lib/metrics'
import mappings from '../mappings.json'
 import { mapName, matchTitle, pct } from '../lib/load'

const icons = mappings as unknown as { maps: Record<string, { i: string }> }

interface Props {
  matches: Match[]
  aggs: Record<string, PlayerAgg>
  onMatch: (id: string) => void
  onPlayer: (p: string) => void
}

export default function Dashboard({ matches, aggs, onMatch, onPlayer }: Props) {
  const rounds = matches.reduce((s, m) => s + m.rounds.length, 0)
  const teams = new Set(matches.flatMap((m) => [m.teams.Red.name, m.teams.Blue.name]))
  const players = Object.keys(aggs).length

  const ranking = Object.values(aggs)
    .filter((g) => g.rounds >= 30)
    .sort((a, b) => b.acs - a.acs)
    .slice(0, 15)

   const sorted = [...matches].sort((a, b) => (a.date < b.date ? 1 : -1))
  const maxAcs = Math.max(...ranking.map((g) => g.acs), 1)
  return (
    <>
      <div className="card">
        <div className="kpis">
          <div className="kpi"><div className="kpi-v">{matches.length}</div><div className="kpi-l">Partidas</div></div>
          <div className="kpi"><div className="kpi-v">{rounds}</div><div className="kpi-l">Rounds</div></div>
          <div className="kpi"><div className="kpi-v">{teams.size}</div><div className="kpi-l">Times</div></div>
          <div className="kpi"><div className="kpi-v">{players}</div><div className="kpi-l">Jogadores</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Ranking de jogadores <small>ACS médio · mínimo 30 rounds</small></h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th><th>Jogador</th>
              <th className="num">ACS</th><th className="num">K/D</th><th className="num">ADR</th>
              <th className="num">HS%</th><th className="num">KAST</th><th className="num">FB−FD</th>
              <th className="num">Clutch</th><th className="num">+/-</th><th className="num">Jogos</th><th className="num">WR%</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((g, i) => (
              <tr key={g.p} className="click" onClick={() => onPlayer(g.p)}>
                <td className="sub">{i + 1}</td>
                <td>{g.name}</td>
                <td className="num">
                  <div className="statbar">
                    <b>{g.acs}</b>
                    <span className="bar"><i style={{ width: `${(g.acs / maxAcs) * 100}%` }} /></span>
                  </div>
                </td>
                <td className="num">{g.kd.toFixed(2)}</td>
                <td className="num">{g.adr}</td>
                <td className="num">{pct(g.hsPct)}</td>
                <td className="num">{pct(g.kast)}</td>
                <td className="num">{g.fb - g.fd > 0 ? '+' : ''}{g.fb - g.fd}</td>
                <td className="num">{g.clutchW}-{g.clutchL}</td>
                <td className="num" style={{ color: g.plusMinus >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                  {g.plusMinus > 0 ? '+' : ''}{g.plusMinus}
                </td>
                <td className="num sub">{g.matches}V{g.wins}</td>
                <td className={`num ${g.matches ? (g.wins / g.matches >= 0.5 ? 'wr-pos' : 'wr-neg') : ''}`}>{g.matches ? pct(g.wins / g.matches) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Partidas <small>clique para abrir</small></h3>
        <div className="matchlist">
          {sorted.map((m) => {
            const winner: 'Red' | 'Blue' = m.teams.Red.won > m.teams.Blue.won ? 'Red' : 'Blue'
            const splash = icons.maps[m.map]?.i
            // momentos: clutches 1v2+ e MVP (maior ACS)
            const a = analyze(m)
            const clutchBadge = a.rounds.find((r) => r.clutch && r.clutch.vs >= 2)
            const mvp = [...m.players].sort((x, y) => y.sc / Math.max(1, y.rp) - x.sc / Math.max(1, x.rp))[0]
            const badge = clutchBadge?.clutch
            return (
              <div key={m.id} className="mcard" onClick={() => onMatch(m.id)}>
                {splash && <img className="msplash" src={splash} alt="" loading="lazy" />}
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="tag">{m.event}</span>
                  <span className="sub">{m.date} · {mapName(m.map)}</span>
                </div>
                <div className="score" style={{ margin: '8px 0 4px' }}>
                  <span className={winner === 'Red' ? 'w' : 'l'}>{m.teams.Red.name}</span>
                  <span className={`num ${winner === 'Red' ? 'w' : 'l'}`}>{m.teams.Red.won}</span>
                  <span className="sub">×</span>
                  <span className={`num ${winner === 'Blue' ? 'w' : 'l'}`}>{m.teams.Blue.won}</span>
                  <span className={winner === 'Blue' ? 'w' : 'l'}>{m.teams.Blue.name}</span>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  {badge && (
                    <span className="pill" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
                      ★ 1v{badge.vs} {badge.won ? 'Clutch' : 'Lost'} · {m.players.find((p) => p.p === badge.p)?.n ?? ''}
                    </span>
                  )}
                  <span className="pill">
                    MVP {mvp?.n ?? ''} · {mvp ? Math.round(mvp.sc / Math.max(1, mvp.rp)) : 0}
                  </span>
                </div>
                <div className="sub">{m.rounds.length} rounds · {Math.round(m.dur / 60)} min</div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
