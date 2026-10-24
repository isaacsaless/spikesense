import { teamFindings } from '../lib/coach'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import CoachStrip from './CoachStrip'
import type { BuyType, TeamAgg } from '../lib/metrics'
import mappings from '../mappings.json'
 import { mapName, pct } from '../lib/load'

const icons = mappings as unknown as { maps: Record<string, { i: string }> }

const BUYS: BuyType[] = ['Pistol', 'Eco', 'Force', 'Semi', 'Full']
const BUYS_PT: Record<BuyType, string> = {
  Pistol: 'Pistola', Eco: 'Eco', Force: 'Force', Semi: 'Semi', Full: 'Full',
}

interface Props { agg: TeamAgg; onOpenCoach: () => void }

const wr = (w: number, l: number) => (w + l ? w / (w + l) : 0)
const wrClass = (r: number) => (r >= 0.5 ? 'wr-pos' : 'wr-neg')

export default function TeamView({ agg, onOpenCoach }: Props) {
  const pistolsWR = wr(agg.pistols.won, agg.pistols.lost)
  const sites = Object.entries(agg.sites)
  const siteChart = sites.map(([site, s]) => ({ site, plants: s.plants }))
  const maps = Object.entries(agg.byMap)

  const cell = (w: number, l: number) => {
    const r = wr(w, l)
    return (
      <td className={w + l ? wrClass(r) : undefined}>
        {w}-{l} ({w + l ? pct(r) : '—'})
      </td>
    )
  }

  return (
    <div>
      <div className="card">
        <h3>{agg.name}</h3>
        <div className="kpis">
          <div className="kpi"><div className="kpi-v">{agg.matches}/{agg.wins}</div><div className="kpi-l">Partidas V</div></div>
          <div className="kpi"><div className="kpi-v">{agg.roundsWon}-{agg.roundsLost}</div><div className="kpi-l">Rounds W-L</div></div>
          <div className="kpi"><div className={`kpi-v ${wrClass(pistolsWR)}`}>{agg.pistols.won}-{agg.pistols.lost}</div><div className="kpi-l">Pistolas ({pct(pistolsWR)})</div></div>
          <div className="kpi"><div className="kpi-v">{agg.fbFor}/{agg.fbAgainst}</div><div className="kpi-l">FB pró/contra</div></div>
          <div className="kpi"><div className="kpi-v">{agg.tradesFor}/{agg.tradesAgainst}</div><div className="kpi-l">Trades pró/contra</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Mapas</h3>
        <table className="tbl">
          <thead><tr><th>Mapa</th><th>V-D</th><th>WR%</th></tr></thead>
          <tbody>
            {maps.map(([id, g]) => (
               <tr key={id}>
                <td>
                  <div className="row">
                    {icons.maps[id]?.i && <img className="mapsplash" src={icons.maps[id].i} alt="" loading="lazy" />}
                    <span>{mapName(id)}</span>
                  </div>
                </td>
                 <td>{g.wins}-{g.matches - g.wins}</td>
                <td className={g.matches ? wrClass(g.matches ? g.wins / g.matches : 0) : undefined}>{pct(g.matches ? g.wins / g.matches : 0)}</td>
               </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Matriz de compra</h3>
        <table className="tbl">
          <thead><tr><th>Fase</th>{BUYS.map(b => <th key={b}>{BUYS_PT[b]}</th>)}</tr></thead>
          <tbody>
            {(['Attack', 'Defense'] as const).map(fase => (
              <tr key={fase}>
                <td>{fase === 'Attack' ? 'Ataque' : 'Defesa'}</td>
                {BUYS.map(b => {
                  const c = agg.buyMatrix[fase][b]
                  return <td key={b} className={c.rounds ? wrClass(c.wins / c.rounds) : undefined}>
                    {c.wins}-{c.rounds - c.wins} ({c.rounds ? pct(c.wins / c.rounds) : '—'})
                  </td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Plants por site</h3>
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={siteChart}>
                <XAxis dataKey="site" tick={{ fontSize: 10, fill: '#8b93a7' }} />
                <YAxis tick={{ fontSize: 10, fill: '#8b93a7' }} />
                <Tooltip />
                <Bar dataKey="plants" fill="#4da3ff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>WR% por site</h3>
          <table className="tbl">
            <thead><tr><th>Site</th><th>Plants</th><th>WR%</th></tr></thead>
            <tbody>
              {sites.map(([site, s]) => {
                const r = s.plants ? s.won / s.plants : 0
                return (
                  <tr key={site}>
                    <td>{site}</td>
                    <td>{s.plants}</td>
                    <td className={s.plants ? wrClass(r) : undefined}>{s.plants ? pct(r) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2">
        <div className="card sev2">
          <h3>Pós-plant</h3>
          <div className="kpi"><div className={`kpi-v ${wrClass(wr(agg.postPlant.won, agg.postPlant.lost))}`}>{pct(wr(agg.postPlant.won, agg.postPlant.lost))}</div><div className="kpi-l">{agg.postPlant.won}-{agg.postPlant.lost} W-L</div></div>
        </div>
        <div className="card sev2">
          <h3>Retake</h3>
          <div className="kpi"><div className={`kpi-v ${wrClass(wr(agg.retake.won, agg.retake.lost))}`}>{pct(wr(agg.retake.won, agg.retake.lost))}</div><div className="kpi-l">{agg.retake.won}-{agg.retake.lost} W-L</div></div>
        </div>
        <div className="card sev3">
          <h3>Anti-eco perdido</h3>
          <div className="kpi"><div className="kpi-v">{agg.antiEcoLosses}/{agg.antiEcoRounds}</div><div className="kpi-l">perdidos/rounds favoritos</div></div>
        </div>
        <div className="card sev1">
          <h3>Pós-derrota</h3>
          <div className="kpi"><div className={`kpi-v ${wrClass(wr(agg.afterLoss.won, agg.afterLoss.lost))}`}>{pct(wr(agg.afterLoss.won, agg.afterLoss.lost))}</div><div className="kpi-l">{agg.afterLoss.won}-{agg.afterLoss.lost} W-L</div></div>
        </div>
      </div>
      <CoachStrip
        title={`sobre ${agg.name}`}
        findings={teamFindings(agg)}
        scopeHint={`(foco no time ${agg.name})`}
        chips={['Rounds críticos que mudaram partidas (linka)', 'O que treinar antes do próximo jogo?']}
        onOpenFull={onOpenCoach}
      />
    </div>
  )
}
