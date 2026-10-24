import { useEffect, useRef, useState } from 'react'
import type { Match, MPlayer, TeamId } from '../types'
import { analyze, type RoundInfo } from '../lib/metrics'
import { agentName, agentIcon, fmt0, mapName, pct, weaponName, weaponIcon } from '../lib/load'
import CoachStrip from './CoachStrip'

const TEAMS: TeamId[] = ['Red', 'Blue']

interface Props { m: Match; focusRound?: number | null; onOpenCoach: () => void }

export default function MatchView({ m, focusRound, onOpenCoach }: Props) {
  const [sel, setSel] = useState<number | null>(focusRound ?? null)
  useEffect(() => {
    setSel(focusRound ?? null)
  }, [focusRound, m.id])
  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (sel !== null) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [sel])
  const a = analyze(m)
  const winner: TeamId = m.teams.Red.won > m.teams.Blue.won ? 'Red' : 'Blue'
  const names: Record<string, string> = {}
  for (const p of m.players) names[p.p] = p.n

  const maxAcs = Math.max(...m.players.map((p) => p.sc / p.rp), 1)
   const row = (p: MPlayer) => {
     const ps = a.byPlayer[p.p]
     const shots = ps ? ps.hs + ps.bs + ps.ls : 0
     const icon = agentIcon(p.a)
    const acs = p.sc / p.rp
     return (
       <tr key={p.p}>
        <td>{icon && <img className="aicon" src={icon} alt="" loading="lazy" />}{agentName(p.a)}</td>
         <td>{p.n}</td>
        <td className="num">
          <div className="statbar">
            <span>{fmt0(acs)}</span>
            <span className="bar"><i style={{ width: `${(acs / maxAcs) * 100}%` }} /></span>
          </div>
        </td>
        <td>{p.k}/{p.d}/{p.as}</td>
        <td>{p.k - p.d > 0 ? '+' : ''}{p.k - p.d}</td>
        <td>{fmt0(ps ? ps.dmg / p.rp : 0)}</td>
        <td>{shots ? pct(ps!.hs / shots) : '—'}</td>
        <td>{ps ? ps.fb : 0}</td>
        <td>{ps ? ps.trades : 0}</td>
        <td>{ps ? `${ps.clutchW}-${ps.clutchL}` : '0-0'}</td>
        <td>{ps ? pct(ps.kastRounds / m.rounds.length) : '—'}</td>
      </tr>
    )
  }

  const ri: RoundInfo | null = sel !== null ? a.rounds.find(x => x.n === sel) ?? null : null
  const rd = sel !== null ? m.rounds.find(x => x.n === sel) : null

  return (
    <div>
       <div className="card">
         <div className="row" style={{ justifyContent: 'space-between' }}>
           <h3>{mapName(m.map)}</h3>
           <span className="sub">{m.date} · {m.event} · v{m.ver}</span>
         </div>
        <div className="bigscore">
          <span className="t">{m.teams.Red.name}</span>
          <span className={`n ${winner === 'Red' ? 'w' : 'l'}`}>{m.teams.Red.won}</span>
          <span className="sub">×</span>
          <span className={`n ${winner === 'Blue' ? 'w' : 'l'}`}>{m.teams.Blue.won}</span>
          <span className="t">{m.teams.Blue.name}</span>
        </div>
       </div>

      <div className="card">
        <h3>Placar</h3>
        <table className="tbl">
          <thead>
            <tr><th>Agente</th><th>Jogador</th><th>ACS</th><th>K/D/A</th><th>+/-</th><th>ADR</th><th>HS%</th><th>FB</th><th>Trades</th><th>Clutch</th><th>KAST</th></tr>
          </thead>
          <tbody>
            {TEAMS.map(t => (
              [<tr key={t}><td colSpan={11} style={{ fontWeight: 600 }}>{m.teams[t].name} ({t})</td></tr>,
              ...m.players.filter(p => p.t === t).map(row)]
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Rounds</h3>
        <div className="rstrip">
          {a.rounds.map((r, i) => {
            const prev = a.rounds[i - 1]
            return (
              <div key={r.n} className="rcellwrap">
                {prev && prev.atk !== null && r.atk !== null && prev.atk !== r.atk && (
                  <span className="rside" title={`Troca de lado: ${r.atk} passou a atacar`} />
                )}
                {prev?.n === 11 && <span className="rhalf">2º HALF</span>}
                <button
                  type="button"
                  className={[
                    'rcell',
                    r.win === winner ? 'rcell-w' : 'rcell-l',
                    r.planted ? 'rcell-plant' : '',
                    sel === r.n ? 'rcell-sel' : '',
                  ].join(' ')}
                  title={`Round ${r.n + 1} — ${m.teams[r.win].name} venceu · compra ${r.buy.Red}/${r.buy.Blue} · site ${r.site || '—'}${r.clutch ? ` · clutch 1v${r.clutch.vs} ${names[r.clutch.p] ?? r.clutch.p} (${r.clutch.won ? 'ganhou' : 'perdeu'})` : ''}`}
                  onClick={() => setSel(sel === r.n ? null : r.n)}
                >
                  <span className="rcell-n">{r.clutch !== null && <span className="rstar">★</span>} {r.n + 1}</span>
                  <span className="rcell-buy">{BUY_LETTER[r.buy.Red]}/{BUY_LETTER[r.buy.Blue]}</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="rlegend">
          <span><i className="sw sw-w" /> ganho</span>
          <span><i className="sw sw-l" /> perdido</span>
          <span><i className="sw sw-plant" /> spike plantada</span>
          <span>★ clutch</span>
          <span>P pistola · E eco · F force · S semi · F full</span>
        </div>
      </div>

      {ri && rd && (
        <div className="card rpanel" ref={panelRef}>
          <h3>
            Round {ri.n + 1} — {m.teams[ri.win].name} venceu ·{' '}
            {ri.atk ? `Ataque de ${m.teams[ri.atk].name}` : 'lado desconhecido'} ·{' '}
            compra {ri.buy[ri.win]} · loadout {fmt0(ri.loadout.Red)} cr vs {fmt0(ri.loadout.Blue)} cr ·{' '}
            site {ri.site || '—'}
          </h3>
          <div className="rtimeline">
            {ri.plantT !== null && (
              <div className="revent">🌱 PLANT às {mmss(ri.plantT)}{ri.site ? ` — site ${ri.site}` : ''}</div>
            )}
            {rd.kills.map((k, idx) => (
              <div key={idx} className="rkill">
                <span className="rkill-t">{mmss(k.t)}</span>
                <span className="rk t-red">{names[k.k] ?? k.k}</span>
                <img className="rkill-w" src={weaponIcon(k.w, k.dt)} alt={weaponName(k.w, k.dt)} title={weaponName(k.w, k.dt)} />
                <span className="rkill-wn">{weaponName(k.w, k.dt)}</span>
                <span className="rkill-arrow">▸</span>
                <span className="rk t-blue">{names[k.v] ?? k.v}</span>
              </div>
            ))}
            {ri.defused && <div className="revent revent-def">✂ DEFUSE</div>}
            {rd.kills.length === 0 && ri.plantT === null && <p className="sub">Sem eventos registrados neste round.</p>}
          </div>
        </div>
      )}
      <CoachStrip
        title={`nesta partida — ${m.teams.Red.name} ${m.teams.Red.won}×${m.teams.Blue.won} ${m.teams.Blue.name}`}
        findings={[]}
        scopeHint={`(foco na partida ${mapName(m.map)}, ${m.teams.Red.name} vs ${m.teams.Blue.name}, ${m.date})`}
        chips={['Quais rounds decidiram esta partida? (linka)', 'Onde o perdedor perdeu o mapa?']}
        onOpenFull={onOpenCoach}
      />
    </div>
  )
}

const BUY_LETTER: Record<RoundInfo['buy']['Red'], string> = { Pistol: 'P', Eco: 'E', Force: 'F', Semi: 'S', Full: 'F' }
const mmss = (s: number): string => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
