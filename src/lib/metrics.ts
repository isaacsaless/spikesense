import type { Dataset, Match, Round, TeamId } from '../types'

/** Complemento de time — usado em dezenas de pontos com semântica fixa. */
export const other = (t: TeamId): TeamId => (t === 'Red' ? 'Blue' : 'Red')

/** Time que ATACOU no round (via winningTeamRole). */
export function attackTeam(r: Round): TeamId | null {
  if (r.wr === 'Attacker') return r.win
  if (r.wr === 'Defender') return other(r.win)
  return null
}

// ---------- análise por partida ----------

export interface RoundInfo {
  n: number
  atk: TeamId | null
  win: TeamId
  site: string
  planted: boolean
  plantT: number | null
  defused: boolean
  firstKill: { k: string; v: string; t: number } | null
  loadout: Record<TeamId, number>
  buy: Record<TeamId, BuyType>
  clutch: { p: string; team: TeamId; vs: number; won: boolean } | null
}

export type BuyType = 'Pistol' | 'Eco' | 'Force' | 'Semi' | 'Full'

export function buyType(n: number, loadout: number): BuyType {
  if (n === 0 || n === 12) return 'Pistol'
  if (loadout < 8000) return 'Eco'
  if (loadout < 17000) return 'Force'
  if (loadout < 26000) return 'Semi'
  return 'Full'
}

export interface PlayerMatchStats {
  p: string
  kills: number; deaths: number; assists: number; dmg: number
  hs: number; bs: number; ls: number
  fb: number
  fd: number
  trades: number
  tradedDeaths: number
  kastRounds: number
  clutchW: number; clutchL: number
  multiKills: Record<number, number>
}

export interface MatchAnalysis {
  byPlayer: Record<string, PlayerMatchStats>
  rounds: RoundInfo[]
}

const TEAM_SIZE = 5
const TRADE_WINDOW_S = 5

export function analyzeMatch(m: Match): MatchAnalysis {
  const teamOf: Record<string, TeamId> = {}
  for (const p of m.players) teamOf[p.p] = p.t

  const byPlayer: Record<string, PlayerMatchStats> = {}
  const P = (pu: string): PlayerMatchStats =>
    (byPlayer[pu] ??= {
      p: pu, kills: 0, deaths: 0, assists: 0, dmg: 0, hs: 0, bs: 0, ls: 0,
      fb: 0, fd: 0, trades: 0, tradedDeaths: 0, kastRounds: 0,
      clutchW: 0, clutchL: 0, multiKills: {},
    })

  for (const p of m.players) {
    const s = P(p.p)
    s.kills += p.k; s.deaths += p.d; s.assists += p.as
  }

  const rounds: RoundInfo[] = []
  for (const r of m.rounds) {
    const kills = [...r.kills].sort((a, b) => a.t - b.t)

    // dano (ignora friendly fire)
    for (const [att, rec, dmg, hs, bs, ls] of r.dmg) {
      if (teamOf[att] === teamOf[rec]) continue
      const s = P(att)
      s.dmg += dmg; s.hs += hs; s.bs += bs; s.ls += ls
    }

    // abertura + trades
    const tradedDeaths = new Set<string>()
    if (kills.length) {
      P(kills[0].k).fb += 1
      P(kills[0].v).fd += 1
    }
    for (let i = 0; i < kills.length; i++) {
      const K = kills[i]
      if (K.k === K.v) continue
      for (let j = i - 1; j >= 0 && K.t - kills[j].t <= TRADE_WINDOW_S; j--) {
        const D = kills[j]
        if (D.k === K.v && teamOf[D.v] === teamOf[K.k]) {
          P(K.k).trades += 1
          P(D.v).tradedDeaths += 1
          tradedDeaths.add(D.v)
          break
        }
      }
    }

    // KAST por jogador
    for (const p of m.players) {
      const pu = p.p
      const hadKill = kills.some((K) => K.k === pu)
      const hadAssist = kills.some((K) => K.as.includes(pu))
      const survived = !kills.some((K) => K.v === pu)
      if (hadKill || hadAssist || survived || tradedDeaths.has(pu)) P(pu).kastRounds += 1
    }

    // multi-kills
    const roundKills: Record<string, number> = {}
    for (const K of kills) {
      if (K.k === K.v) continue
      roundKills[K.k] = (roundKills[K.k] ?? 0) + 1
    }
    for (const [pu, n] of Object.entries(roundKills)) {
      if (n >= 3) P(pu).multiKills[n] = (P(pu).multiKills[n] ?? 0) + 1
    }

    // clutches 1vX (X>=2): primeiro momento em que resta 1 vivo de um time
    let clutch: RoundInfo['clutch'] = null
    const hasEcon = new Set(Object.keys(r.econ))
    const alive = new Set(m.players.filter((p) => hasEcon.has(p.p)).map((p) => p.p))
    const countAlive = (t: TeamId) =>
      m.players.filter((p) => p.t === t && alive.has(p.p)).length
    for (const K of kills) {
      alive.delete(K.v)
      for (const t of ['Red', 'Blue'] as TeamId[]) {
        const enemies = countAlive(other(t))
        if (countAlive(t) === 1 && enemies >= 2 && !clutch) {
          const solo = m.players.find((p) => p.t === t && alive.has(p.p))
          if (solo) clutch = { p: solo.p, team: t, vs: enemies, won: r.win === t }
        }
      }
    }
    if (clutch && clutch.vs >= 2) {
      if (clutch.won) P(clutch.p).clutchW += 1
      else P(clutch.p).clutchL += 1
    }

    // economia por time (normalizada p/ 5 jogadores)
    const loadout: Record<TeamId, number> = { Red: 0, Blue: 0 }
    const counted: Record<TeamId, number> = { Red: 0, Blue: 0 }
    for (const [pu, ec] of Object.entries(r.econ)) {
      const t = teamOf[pu]
      if (!t) continue
      loadout[t] += ec[0]
      counted[t] += 1
    }
    for (const t of ['Red', 'Blue'] as TeamId[]) {
      if (counted[t] > 0 && counted[t] < TEAM_SIZE)
        loadout[t] = Math.round((loadout[t] / counted[t]) * TEAM_SIZE)
    }
    const buy: Record<TeamId, BuyType> = {
      Red: buyType(r.n, loadout.Red),
      Blue: buyType(r.n, loadout.Blue),
    }

    rounds.push({
      n: r.n,
      atk: attackTeam(r),
      win: r.win,
      site: r.site,
      planted: !!r.plant,
      plantT: r.plant,
      defused: !!r.defuse,
      firstKill: kills.length ? { k: kills[0].k, v: kills[0].v, t: kills[0].t } : null,
      loadout,
      buy,
      clutch,
    })
  }

  return { byPlayer, rounds }
}

// memoização por id de partida (app inteiro opera sobre as mesmas 48+ partidas)
const cache = new Map<string, MatchAnalysis>()
export function analyze(m: Match): MatchAnalysis {
  const hit = cache.get(m.id)
  if (hit) return hit
  const a = analyzeMatch(m)
  cache.set(m.id, a)
  return a
}

// ---------- agregação por jogador ----------

export interface SeriesPoint {
  date: string; matchId: string; acs: number; kd: number
  plusMinus: number; agent: string; win: boolean
  opponent: string; map: string
}

export interface PlayerAgg {
  p: string
  name: string
  matches: number
  rounds: number
  kills: number; deaths: number; assists: number
  dmg: number; hs: number; bs: number; ls: number
  kastRounds: number
  fb: number; fd: number; trades: number; tradedDeaths: number
  fbAtk: number; fbDef: number; fdAtk: number; fdDef: number
  abCasts: number; ultCasts: number
  dmgByBuy: Record<BuyType, number>
  roundsByBuy: Record<BuyType, number>
  clutchW: number; clutchL: number
  multi3k: number; multi4k: number; multi5k: number
  plusMinus: number
  score: number
  wins: number
  acs: number; kd: number; adr: number; hsPct: number; kast: number
  series: SeriesPoint[]
  byAgent: Record<string, { matches: number; rounds: number; kills: number; deaths: number; score: number; wins: number }>
  byWeapon: Record<string, number>
}

export function aggregatePlayers(data: Dataset, matches: Match[]): Record<string, PlayerAgg> {
  const aggs: Record<string, PlayerAgg> = {}
  for (const m of matches) {
    const a = analyze(m)
    const winner: TeamId = m.teams.Red.won > m.teams.Blue.won ? 'Red' : 'Blue'
    for (const mp of m.players) {
      const g: PlayerAgg = (aggs[mp.p] ??= {
        p: mp.p, name: data.players[mp.p] ?? mp.n,
        matches: 0, rounds: 0, kills: 0, deaths: 0, assists: 0,
        dmg: 0, hs: 0, bs: 0, ls: 0, kastRounds: 0,
        fb: 0, fd: 0, trades: 0, tradedDeaths: 0,
        clutchW: 0, clutchL: 0, multi3k: 0, multi4k: 0, multi5k: 0,
        plusMinus: 0, score: 0, wins: 0,
        acs: 0, kd: 0, adr: 0, hsPct: 0, kast: 0,
        fbAtk: 0, fbDef: 0, fdAtk: 0, fdDef: 0, abCasts: 0, ultCasts: 0,
        dmgByBuy: { Pistol: 0, Eco: 0, Force: 0, Semi: 0, Full: 0 },
        roundsByBuy: { Pistol: 0, Eco: 0, Force: 0, Semi: 0, Full: 0 },
        series: [], byAgent: {}, byWeapon: {},
      })
      const ps = a.byPlayer[mp.p]
      const won = mp.t === winner
      g.matches += 1
      g.rounds += mp.rp
      g.kills += mp.k; g.deaths += mp.d; g.assists += mp.as
      g.plusMinus += mp.k - mp.d
      g.score += mp.sc
      g.abCasts += (mp.ab.grenadeCasts ?? 0) + (mp.ab.ability1Casts ?? 0) + (mp.ab.ability2Casts ?? 0)
      g.ultCasts += mp.ab.ultimateCasts ?? 0
      if (ps) {
        g.dmg += ps.dmg; g.hs += ps.hs; g.bs += ps.bs; g.ls += ps.ls
        g.kastRounds += ps.kastRounds
        g.fb += ps.fb; g.fd += ps.fd
        g.trades += ps.trades; g.tradedDeaths += ps.tradedDeaths
        g.clutchW += ps.clutchW; g.clutchL += ps.clutchL
        g.multi3k += ps.multiKills[3] ?? 0
        g.multi4k += ps.multiKills[4] ?? 0
        g.multi5k += ps.multiKills[5] ?? 0
      }
      const ag = (g.byAgent[mp.a] ??= { matches: 0, rounds: 0, kills: 0, deaths: 0, score: 0, wins: 0 })
      ag.matches += 1; ag.rounds += mp.rp; ag.kills += mp.k; ag.deaths += mp.d; ag.score += mp.sc
      if (won) ag.wins += 1
      g.series.push({
        date: m.date, matchId: m.id,
        acs: mp.rp ? Math.round(mp.sc / mp.rp) : 0,
        kd: mp.d ? mp.k / mp.d : mp.k,
        plusMinus: mp.k - mp.d, agent: mp.a, win: won,
        opponent: m.teams[other(mp.t)].name, map: m.map,
      })
    }
    // por round: FB/FD por lado, dano por tipo de compra
    const infoByN = new Map(a.rounds.map((x) => [x.n, x]))
    const teamOf: Record<string, TeamId> = {}
    for (const p of m.players) teamOf[p.p] = p.t
    for (const r of m.rounds) {
      const info = infoByN.get(r.n)
      if (!info) continue
      for (const mp of m.players) {
        const g = aggs[mp.p]
        if (g) g.roundsByBuy[info.buy[mp.t]] += 1
      }
      if (info.firstKill) {
        const fk = aggs[info.firstKill.k]
        const fv = aggs[info.firstKill.v]
        const onAtk = info.atk && teamOf[info.firstKill.k] === info.atk
        if (fk) onAtk ? (fk.fbAtk += 1) : (fk.fbDef += 1)
        if (fv) onAtk ? (fv.fdDef += 1) : (fv.fdAtk += 1)
      }
      for (const [att, , dmg] of r.dmg) {
        const g = aggs[att]
        if (g) g.dmgByBuy[info.buy[teamOf[att]]] = (g.dmgByBuy[info.buy[teamOf[att]]] ?? 0) + dmg
      }
      for (const K of r.kills) {
        const g = aggs[K.k]
        if (!g) continue
        const key = K.w || (K.dt === 'Bomb' ? 'BOMB' : K.dt === 'Melee' ? 'MELEE' : K.dt === 'Ability' ? 'ABILITY' : '')
        if (key) g.byWeapon[key] = (g.byWeapon[key] ?? 0) + 1
      }
    }
  }
  for (const g of Object.values(aggs)) {
    g.name = data.players[g.p] ?? g.name
    g.acs = g.rounds ? Math.round(g.score / g.rounds) : 0
    g.kd = g.deaths ? g.kills / g.deaths : g.kills
    g.adr = g.rounds ? Math.round(g.dmg / g.rounds) : 0
    const shots = g.hs + g.bs + g.ls
    g.hsPct = shots ? g.hs / shots : 0
    g.kast = g.rounds ? g.kastRounds / g.rounds : 0
    g.series.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  }
  return aggs
}

// ---------- agregação por time (nome) ----------

export interface BuyCell { rounds: number; wins: number }

export interface TeamAgg {
  name: string
  matches: number
  wins: number
  roundsWon: number
  roundsLost: number
  byMap: Record<string, { matches: number; wins: number }>
  pistols: { won: number; lost: number }
  afterPistolWin: { won: number; lost: number }
  afterPistolLoss: { won: number; lost: number }
  afterLoss: { won: number; lost: number }   // mentalidade: ganhar round após perder o anterior
  antiEcoLosses: number
  antiEcoRounds: number
  buyMatrix: Record<'Attack' | 'Defense', Record<BuyType, BuyCell>>
  postPlant: { won: number; lost: number }
  retake: { won: number; lost: number }
  fastPlants: { won: number; lost: number }   // execução direta: plant < 25s
  latePlants: { won: number; lost: number }   // default/rotação lenta: plant > 60s
  retakeDefuses: number
  sites: Record<string, { plants: number; won: number }>
  fbFor: number; fbAgainst: number
  tradesFor: number; tradesAgainst: number
  roster: Record<string, number>
}

const emptyCell = (): BuyCell => ({ rounds: 0, wins: 0 })

export function aggregateTeam(name: string, matches: Match[]): TeamAgg {
  const agg: TeamAgg = {
    name, matches: 0, wins: 0, roundsWon: 0, roundsLost: 0,
    byMap: {}, pistols: { won: 0, lost: 0 },
    afterPistolWin: { won: 0, lost: 0 }, afterPistolLoss: { won: 0, lost: 0 },
    fastPlants: { won: 0, lost: 0 }, latePlants: { won: 0, lost: 0 }, retakeDefuses: 0,
    afterLoss: { won: 0, lost: 0 }, antiEcoLosses: 0, antiEcoRounds: 0,
    buyMatrix: {
      Attack: { Pistol: emptyCell(), Eco: emptyCell(), Force: emptyCell(), Semi: emptyCell(), Full: emptyCell() },
      Defense: { Pistol: emptyCell(), Eco: emptyCell(), Force: emptyCell(), Semi: emptyCell(), Full: emptyCell() },
    },
    postPlant: { won: 0, lost: 0 },
    retake: { won: 0, lost: 0 },
    sites: {}, fbFor: 0, fbAgainst: 0, tradesFor: 0, tradesAgainst: 0,
    roster: {},
  }

  for (const m of matches) {
    const side = (m.teams.Red.name === name ? 'Red' : m.teams.Blue.name === name ? 'Blue' : null) as TeamId | null
    if (!side) continue
    const a = analyze(m)
    const won = m.teams[side].won > m.teams[other(side)].won
    agg.matches += 1
    if (won) agg.wins += 1
    agg.roundsWon += m.teams[side].won
    agg.roundsLost += m.teams[other(side)].won
    const mapAgg = (agg.byMap[m.map] ??= { matches: 0, wins: 0 })
    mapAgg.matches += 1
    if (won) mapAgg.wins += 1
    for (const mp of m.players.filter((p) => p.t === side))
      agg.roster[mp.p] = (agg.roster[mp.p] ?? 0) + 1

    const teamOf: Record<string, TeamId> = {}
    for (const p of m.players) teamOf[p.p] = p.t

    let prevWon: boolean | null = null
    let pistolDone = false
    for (const r of m.rounds) {
      const info = a.rounds.find((x) => x.n === r.n)
      if (!info) continue
      const isMine = info.win === side
      const atk = info.atk
      const buy = info.buy[side]
      const oppBuy = info.buy[other(side)]

      // pistolas (round 1 e 13)
      if (buy === 'Pistol') {
        if (!pistolDone || r.n === 12) {
          if (isMine) agg.pistols.won += 1
          else agg.pistols.lost += 1
        }
      }

      // matriz de compra por lado
      if (atk) {
        const phase = atk === side ? 'Attack' : 'Defense'
        const cell = agg.buyMatrix[phase][buy]
        cell.rounds += 1
        if (isMine) cell.wins += 1
      }

      // anti-eco: full buy contra eco perdida
      if ((buy === 'Full' || buy === 'Semi') && (oppBuy === 'Eco' || oppBuy === 'Pistol' && buy === 'Full')) {
        agg.antiEcoRounds += 1
        if (!isMine) agg.antiEcoLosses += 1
      }

      // pós-plant (ataque) e retake (defesa)
      if (info.planted && atk === side) {
        if (isMine) agg.postPlant.won += 1
        else agg.postPlant.lost += 1
        // tempo de execução: direta <25s, rotação/default lento >60s
        if (info.plantT !== null && info.plantT !== undefined) {
          if (info.plantT < 25) isMine ? agg.fastPlants.won++ : agg.fastPlants.lost++
          else if (info.plantT > 60) isMine ? agg.latePlants.won++ : agg.latePlants.lost++
        }
      }
      if (info.planted && atk === other(side)) {
        if (isMine) agg.retake.won += 1
        else agg.retake.lost += 1
        if (info.defused && isMine) agg.retakeDefuses += 1
      }

      // sites de ataque
      if (info.planted && atk === side && info.site) {
        const s = (agg.sites[info.site] ??= { plants: 0, won: 0 })
        s.plants += 1
        if (isMine) s.won += 1
      }

      // first bloods
      if (info.firstKill && teamOf[info.firstKill.k] === side) agg.fbFor += 1
      else if (info.firstKill) agg.fbAgainst += 1

      // sequência pós-pistola e mentalidade
      if (prevWon === false) {
        if (isMine) agg.afterLoss.won += 1
        else agg.afterLoss.lost += 1
      }
      prevWon = isMine
      if (r.n === 0) pistolDone = true
    }

    // trades por time
    for (const ps of Object.values(a.byPlayer)) {
      if (teamOf[ps.p] === side) {
        agg.tradesFor += ps.trades
        agg.tradesAgainst += ps.tradedDeaths
      }
    }

    // rounds pós-pistola (round 0→1 e 12→13; numeração 0-indexada)
    for (const r of m.rounds) {
      if (r.n !== 1 && r.n !== 13) continue
      const info = a.rounds.find((x) => x.n === (r.n === 1 ? 0 : 12))
      const next = a.rounds.find((x) => x.n === r.n)
      if (!info || !next) continue
      const pistolWon = info.win === side
      const target = pistolWon ? agg.afterPistolWin : agg.afterPistolLoss
      if (next.win === side) target.won += 1
      else target.lost += 1
    }
  }
  return agg
}

// ---------- utilidades ----------

/** Tendência linear (inclinação) de uma série — ACS por partida, ex. */
export function slope(values: number[]): number {
  const n = values.length
  if (n < 3) return 0
  const mx = (n - 1) / 2
  const my = values.reduce((s, v) => s + v, 0) / n
  let num = 0; let den = 0
  values.forEach((y, i) => {
    num += (i - mx) * (y - my)
    den += (i - mx) ** 2
  })
  return den ? num / den : 0
}
