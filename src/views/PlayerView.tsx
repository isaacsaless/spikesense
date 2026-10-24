import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import type { PlayerAgg } from '../lib/metrics'
import { slope } from '../lib/metrics'
import { agentName, agentIcon, agentRole, weaponName, weaponIcon, weaponCat, fmt1, pct } from '../lib/load'
import { playerFindings } from '../lib/coach'
import CoachStrip from './CoachStrip'


const ROLE_EMOJI: Record<string, string> = {
  Duelista: '⚔️', Iniciador: '🎯', Controlador: '🌫️', Sentinela: '🛡️',
}
const ROLE_PT: Record<string, string> = {
  Duelist: 'Duelista', Initiator: 'Iniciador', Controller: 'Controlador', Sentinel: 'Sentinela',
}
const WEAPON_LABEL: Record<string, string> = {
  BOMB: 'Spike', MELEE: 'Faca', ABILITY: 'Habilidade',
}

interface Props { agg: PlayerAgg; onOpenCoach: () => void }

export default function PlayerView({ agg, onOpenCoach }: Props) {
  const chart = agg.series.map(s => ({ x: `${s.date} ${s.opponent}`, acs: s.acs }))
  const s = slope(agg.series.map(p => p.acs))
  const trend = s > 3 ? 'alta' : s < -3 ? 'queda' : 'estável'
  const agents = Object.entries(agg.byAgent).map(([uuid, g]) => ({
    uuid, matches: g.matches, acs: g.rounds ? Math.round(g.score / g.rounds) : 0,
    kd: g.deaths ? g.kills / g.deaths : g.kills, wr: g.matches ? g.wins / g.matches : 0,
  })).sort((x, y) => y.matches - x.matches)
  const weapons = Object.entries(agg.byWeapon).sort((x, y) => y[1] - x[1])

  const byRole = new Map<string, { matches: number; wins: number; kills: number; deaths: number; score: number; rounds: number }>()
  for (const [uuid, g] of Object.entries(agg.byAgent)) {
    const key = agentRole(uuid)
    const cur = byRole.get(key) ?? { matches: 0, wins: 0, kills: 0, deaths: 0, score: 0, rounds: 0 }
    cur.matches += g.matches; cur.wins += g.wins; cur.kills += g.kills
    cur.deaths += g.deaths; cur.score += g.score; cur.rounds += g.rounds
    byRole.set(key, cur)
  }
  const roles = [...byRole.entries()].sort((a, b) => b[1].matches - a[1].matches)

  return (
    <div>
      <div className="card">
        <div className="pheader">
          <span className="pname">{agg.name}</span>
          <span className="pill">{agg.matches} partidas · {agg.wins}V</span>
          <span className={`pill ${agg.wins / agg.matches >= 0.5 ? 'wr-pos' : 'wr-neg'}`}>WR {pct(agg.wins / agg.matches)}</span>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="kpi-v">{agg.acs}</div><div className="kpi-l">ACS</div></div>
          <div className="kpi"><div className="kpi-v">{fmt1(agg.kd)}</div><div className="kpi-l">K/D</div></div>
          <div className="kpi"><div className="kpi-v">{agg.adr}</div><div className="kpi-l">ADR</div></div>
          <div className="kpi"><div className="kpi-v">{pct(agg.hsPct)}</div><div className="kpi-l">HS%</div></div>
          <div className="kpi"><div className="kpi-v">{pct(agg.kast)}</div><div className="kpi-l">KAST</div></div>
          <div className="kpi"><div className="kpi-v">{agg.plusMinus > 0 ? '+' : ''}{agg.plusMinus}</div><div className="kpi-l">+/-</div></div>
          <div className="kpi"><div className="kpi-v">{agg.fb}-{agg.fd}</div><div className="kpi-l">FB-FD</div></div>
          <div className="kpi"><div className="kpi-v">{agg.clutchW}-{agg.clutchL}</div><div className="kpi-l">Clutch W-L</div></div>
        </div>
      </div>

      <div className="card">
        <h3>ACS por partida <span className="tag">tendência: {trend}</span></h3>
        <div className="chart">
          <ResponsiveContainer>
            <LineChart data={chart}>
              <XAxis dataKey="x" tick={{ fontSize: 10, fill: '#8b93a7' }} />
              <YAxis tick={{ fontSize: 10, fill: '#8b93a7' }} />
              <Tooltip />
              <ReferenceLine y={agg.acs} stroke="#e6c86e" strokeDasharray="4 4" />
              <Line dataKey="acs" stroke="#4da3ff" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid2">
        <div className="rolegrid">
          {roles.map(([role, r]) => {
            const label = ROLE_PT[role] ?? (role || 'Outros')
            const wrR = r.matches ? r.wins / r.matches : 0
            const kda = r.deaths ? r.kills / r.deaths : r.kills
            const acsR = r.rounds ? Math.round(r.score / r.rounds) : 0
            return (
              <div key={role || 'outros'} className="rolecard">
                <div className="rname">{ROLE_EMOJI[label] ?? '🎮'} {label}</div>
                <div className={`rwr ${wrR >= 0.5 ? 'wr-pos' : 'wr-neg'}`}>{pct(wrR)}</div>
                <div className="rsub">{r.wins}V-{r.matches - r.wins}D · KDA {fmt1(kda)} · ACS {acsR}</div>
              </div>
            )
          })}
        </div>
        <div className="card">
          <h3>Agentes</h3>
          <table className="tbl">
            <thead><tr><th>Agente</th><th>Partidas</th><th>ACS</th><th>K/D</th><th>WR%</th></tr></thead>
            <tbody>
              {agents.map(a2 => (
                <tr key={a2.uuid}>
                  <td>
                    {agentIcon(a2.uuid) && (
                      <img className="aicon" src={agentIcon(a2.uuid)} alt="" loading="lazy" />
                    )}
                    {agentName(a2.uuid)}
                  </td>
                  <td>{a2.matches}</td>
                  <td>{a2.acs}</td>
                  <td>{fmt1(a2.kd)}</td>
                  <td className={a2.wr >= 0.5 ? 'wr-pos' : 'wr-neg'}>{pct(a2.wr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Armas</h3>
          <table className="tbl">
            <thead><tr><th>Arma</th><th>Categoria</th><th className="num">Kills</th></tr></thead>
            <tbody>
              {weapons.map(([w, k]) => (
                <tr key={w}>
                  <td>
                    {weaponIcon(w) && <img className="wicon" src={weaponIcon(w)} alt="" loading="lazy" />}
                    {WEAPON_LABEL[w] ?? weaponName(w)}
                  </td>
                  <td className="sub">{weaponCat(w) || '—'}</td>
                  <td className="num">{k}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="pill">3k: {agg.multi3k}</span>
            <span className="pill">4k: {agg.multi4k}</span>
            <span className="pill">5k: {agg.multi5k}</span>
          </div>
        </div>
      </div>
      <CoachStrip
        title={`sobre ${agg.name}`}
        findings={playerFindings(agg)}
        scopeHint={`(foco no jogador ${agg.name})`}
        chips={['Onde eu perdi rounds decisivos? (linka)', 'Plano de treino da semana']}
        onOpenFull={onOpenCoach}
      />
    </div>
  )
}
