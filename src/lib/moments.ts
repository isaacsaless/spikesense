// Momentos-chave com deep-link: clutches 1vX, anti-ecos perdidos, pós-plants perdidos,
// pistolas perdidas — cada momento carrega a partida, o round e a linha do tempo
// de kills para o agente narrar "onde dava pra mudar".
import type { Dataset, Match, TeamId } from '../types'
import { analyze, other } from './metrics'
import { agentName, mapName, weaponName } from './load'

export interface ClutchMoment {
  tipo: 'clutch'
  puuid: string
  jogador: string
  vs: number
  venceu: boolean
  matchId: string
  evento: string
  data: string
  mapa: string
  times: string
  round: number          // roundNum (0-indexado na base)
  roundLabel: number     // numeração humana (round+1)
  placarAteORound: string // ex: 8-7 (placar ANTES do round)
  roundVencidoPor: string
  plantado: boolean
  plantSeg: number | null
  killTimeline: string[]  // narrativa compacta: "0:34 Fulano matou Beltrano (Vandal)"
  link: string
}

export interface RoundMoment {
  tipo: 'anti-eco-perdido' | 'pos-plant-perdido' | 'pistola-perdida' | 'retake-perdido'
  matchId: string
  evento: string
  data: string
  mapa: string
  times: string
  round: number
  roundLabel: number
  placarAteORound: string
  compra: string
  site: string | null
  detalhe: string
  link: string
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function prefixScore(m: Match, roundN: number): string {
  let a = 0, b = 0
  for (const r of m.rounds) {
    if (r.n >= roundN) break
    if (r.win === 'Red') a++
    else b++
  }
  const red = m.teams.Red.name, blue = m.teams.Blue.name
  return `${red} ${a}-${b} ${blue}`
}

function killNarrative(m: Match, roundN: number, focusPuuid?: string): string[] {
  const r = m.rounds.find((x) => x.n === roundN)
  if (!r) return []
  const name = (pu: string) => {
    const p = m.players.find((x) => x.p === pu)
    return focusPuuid && pu === focusPuuid ? `>>${p?.n ?? pu}<<` : (p?.n ?? pu)
  }
  return [...r.kills]
    .sort((x, y) => x.t - y.t)
    .map((K) => `${mmss(K.t)} ${name(K.k)} eliminou ${name(K.v)} (${weaponName(K.w, K.dt)})`)
}

export function clutchMoments(data: Dataset, puuid?: string): ClutchMoment[] {
  const out: ClutchMoment[] = []
  for (const m of data.matches) {
    const a = analyze(m)
    for (const info of a.rounds) {
      if (!info.clutch || info.clutch.vs < 2) continue
      if (puuid && info.clutch.p !== puuid) continue
      out.push({
        tipo: 'clutch',
        puuid: info.clutch.p,
        jogador: data.players[info.clutch.p] ?? info.clutch.p,
        vs: info.clutch.vs,
        venceu: info.clutch.won,
        matchId: m.id,
        evento: m.event,
        data: m.date,
        mapa: mapName(m.map),
        times: `${m.teams.Red.name} vs ${m.teams.Blue.name}`,
        round: info.n,
        roundLabel: info.n + 1,
        placarAteORound: prefixScore(m, info.n),
        roundVencidoPor: m.teams[info.win].name,
        plantado: info.planted,
        plantSeg: info.plantT,
        killTimeline: killNarrative(m, info.n, info.clutch.p),
        link: `spike://match/${m.id}?round=${info.n}`,
      })
    }
  }
  return out.sort((x, y) => (x.data < y.data ? 1 : -1))
}

export function roundMoments(data: Dataset, teamName?: string): RoundMoment[] {
  const out: RoundMoment[] = []
  for (const m of data.matches) {
    const side = (['Red', 'Blue'] as TeamId[]).find(
      (t) => m.teams[t].name === teamName,
    )
    if (!side) continue
    const a = analyze(m)
    for (const info of a.rounds) {
      const atk = info.atk
      if (!atk) continue
      const lost = info.win !== side
      let tipo: RoundMoment['tipo'] | null = null
      let detalhe = ''
      const myBuy = info.buy[side]
      const oppBuy = info.buy[other(side)]
      if (lost && (myBuy === 'Full' || myBuy === 'Semi') && (oppBuy === 'Eco' || (myBuy === 'Full' && oppBuy === 'Pistol'))) {
        tipo = 'anti-eco-perdido'
        detalhe = `compra ${myBuy} (${Math.round(info.loadout[side])} cr) contra ${oppBuy} (${Math.round(info.loadout[other(side)])} cr)`
      } else if (lost && info.planted && atk === side) {
        tipo = 'pos-plant-perdido'
        detalhe = `plantou no site ${info.site || '?'} em ${info.plantT !== null ? mmss(info.plantT) : '?'} e perdeu o round`
      } else if (lost && info.planted && atk === other(side)) {
        tipo = 'retake-perdido'
        detalhe = `retake falhou no site ${info.site || '?'} (spike plantada)`
      } else if (lost && myBuy === 'Pistol') {
        tipo = 'pistola-perdida'
        detalhe = 'round de pistola perdido'
      }
      if (!tipo) continue
      out.push({
        tipo,
        matchId: m.id,
        evento: m.event,
        data: m.date,
        mapa: mapName(m.map),
        times: `${m.teams[side].name} vs ${m.teams[other(side)].name}`,
        round: info.n,
        roundLabel: info.n + 1,
        placarAteORound: prefixScore(m, info.n),
        compra: `${myBuy} vs ${oppBuy}`,
        site: info.site || null,
        detalhe,
        link: `spike://match/${m.id}?round=${info.n}`,
      })
    }
  }
  return out.sort((x, y) => (x.data < y.data ? 1 : -1))
}
