// Ferramentas do agente coach: consultas dinâmicas sobre a base oficial.
// Padrão inspirado no harness pi (earendil-works/pi): tools declaradas com
// schema, executadas localmente, resultado devolvido ao LLM como functionResponse.
import type { Dataset, Match, TeamId } from '../types'
import { aggregatePlayers, aggregateTeam, analyze, type PlayerAgg, type TeamAgg } from './metrics'
import { clutchMoments, roundMoments } from './moments'
import { agentName, mapName, weaponName, trackerUrl } from './load'
import { searchRounds } from './roundsearch'
import { searchVods } from './vodsearch'

export interface ToolDef {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: 'string' | 'number'; description: string }>
    required?: string[]
  }
}

export type ToolFn = (args: Record<string, string | number>) => string | Promise<string>

export interface Tool {
  declaration: ToolDef
  fn: ToolFn
}

const pc = (x: number) => `${Math.round(x * 100)}%`

// ---------- helpers de busca ----------

function findPlayer(data: Dataset, query: string): PlayerAgg | null {
  const aggs = aggregatePlayers(data, data.matches)
  const q = query.toLowerCase().replace(/#\S+/, '').trim()
  const exact = Object.values(aggs).find((g) => g.name.toLowerCase().startsWith(q))
  if (exact) return exact
  const partial = Object.values(aggs).find((g) => g.name.toLowerCase().includes(q))
  return partial ?? null
}

function playerSummary(g: PlayerAgg): string {
  const agents = Object.entries(g.byAgent)
    .map(([uuid, v]) => `${agentName(uuid)}(${v.matches}j, ACS ${Math.round(v.score / v.rounds)}, WR ${pc(v.wins / v.matches)})`)
    .join(', ')
  const weapons = Object.entries(g.byWeapon).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([w, n]) => `${weaponName(w)}:${n}`).join(', ')
  return JSON.stringify({
    jogador: g.name, tracker: trackerUrl(g.name), partidas: g.matches, vitorias: g.wins, rounds: g.rounds,
    acs: g.acs, kd: Math.round(g.kd * 100) / 100, kda: `${g.kills}/${g.deaths}/${g.assists}`,
    adr: g.adr, hsPct: pc(g.hsPct), kast: pc(g.kast), plusMinus: g.plusMinus,
    fb: g.fb, fd: g.fd, fbAtaque: g.fbAtk, fbDefesa: g.fbDef, fdAtaque: g.fdAtk, fdDefesa: g.fdDef,
    tradesFeitos: g.trades, mortesTradadas: g.tradedDeaths,
    clutch: `${g.clutchW}V-${g.clutchL}D`, multi3k: g.multi3k, multi4k: g.multi4k, multi5k: g.multi5k,
    utilPorRound: Math.round((g.abCasts / Math.max(1, g.rounds)) * 10) / 10, ultis: g.ultCasts,
    adrFullBuy: Math.round(g.dmgByBuy.Full / Math.max(1, g.roundsByBuy.Full)),
    adrEco: Math.round(g.dmgByBuy.Eco / Math.max(1, g.roundsByBuy.Eco)),
    acsPorPartida: g.series.map((s) => s.acs),
    agentes: agents, armasTop: weapons,
  })
}

function teamSummary(t: TeamAgg): string {
  const maps = Object.entries(t.byMap).map(([mp, v]) => `${mapName(mp)}:${v.wins}V-${v.matches - v.wins}D`).join(', ')
  const sites = Object.entries(t.sites).map(([s, v]) => `${s}:${v.plants} plants, ${pc(v.won / v.plants)} WR`).join(', ')
  const matrix = (phase: 'Attack' | 'Defense') =>
    (Object.entries(t.buyMatrix[phase]) as [string, { rounds: number; wins: number }][])
      .map(([b, c]) => `${b}:${c.wins}-${c.rounds - c.wins}`).join(', ')
  return JSON.stringify({
    time: t.name, partidas: t.matches, vitorias: t.wins, rounds: `${t.roundsWon}-${t.roundsLost}`,
    mapas: maps,
    pistolas: `${t.pistols.won}V-${t.pistols.lost}D`,
    posPlant: `${t.postPlant.won}V-${t.postPlant.lost}D`,
    retake: `${t.retake.won}V-${t.retake.lost}D (defuses: ${t.retakeDefuses})`,
    plantsRapidosMenos25s: `${t.fastPlants.won}V-${t.fastPlants.lost}D`,
    plantsTardiosMais60s: `${t.latePlants.won}V-${t.latePlants.lost}D`,
    sitesAtaque: sites,
    compraAtaque: matrix('Attack'), compraDefesa: matrix('Defense'),
    antiEcoPerdido: `${t.antiEcoLosses}/${t.antiEcoRounds}`,
    fb: `${t.fbFor} pró/${t.fbAgainst} contra`,
    trades: `${t.tradesFor} feitos/${t.tradesAgainst} sofridos`,
    wrAposDerrota: pc(t.afterLoss.won / Math.max(1, t.afterLoss.won + t.afterLoss.lost)),
  })
}

function matchSummary(m: Match, i: number): string {
  const a = analyze(m)
  const top = m.players
    .map((p) => ({ p, ps: a.byPlayer[p.p] }))
    .sort((x, y) => y.p.sc / Math.max(1, y.p.rp) - x.p.sc / Math.max(1, x.p.rp))
    .slice(0, 3)
    .map(({ p }) => `${p.n}(${agentName(p.a)}, ACS ${Math.round(p.sc / Math.max(1, p.rp))})`)
  return `${i + 1}. [${m.event} ${m.num}] ${m.date} ${mapName(m.map)}: ${m.teams.Red.name} ${m.teams.Red.won}x${m.teams.Blue.won} ${m.teams.Blue.name} — destaques: ${top.join('; ')}`
}

// ---------- registro de ferramentas ----------

export function buildTools(data: Dataset): Tool[] {
  const tools: Tool[] = []

  tools.push({
    declaration: {
      name: 'buscar_jogador',
      description: 'Busca um jogador pelo nome (parcial ok) e devolve todas as estatísticas agregadas: ACS, K/D, ADR, HS%, KAST, aberturas por lado, trades, clutches, util por round, ADR por tipo de compra, agentes e armas.',
      parameters: { type: 'object', properties: { nome: { type: 'string', description: 'Nome do jogador (ou parte dele)' } }, required: ['nome'] },
    },
    fn: (args) => {
      const q = String(args.nome ?? '')
      const g = findPlayer(data, q)
      return g ? playerSummary(g) : `Jogador "${q}" não encontrado. Peça a lista de partidas para ver nomes disponíveis.`
    },
  })

  tools.push({
    declaration: {
      name: 'buscar_time',
      description: 'Busca um time pelo nome e devolve estatísticas coletivas: mapa WR, pistol rounds, pós-plant, retake, tempo de execução (plants rápidos/tardios), sites de ataque, matriz de compra por fase, anti-eco, first bloods e trades.',
      parameters: { type: 'object', properties: { nome: { type: 'string', description: 'Nome do time (ou parte)' } }, required: ['nome'] },
    },
    fn: (args) => {
      const q = String(args.nome ?? '').toLowerCase()
      const names = [...new Set(data.matches.flatMap((m) => [m.teams.Red.name, m.teams.Blue.name]))]
      const hit = names.find((n) => n.toLowerCase().includes(q))
      return hit ? teamSummary(aggregateTeam(hit, data.matches)) : `Time "${q}" não encontrado. Times: ${names.join(', ')}`
    },
  })

  tools.push({
    declaration: {
      name: 'listar_partidas',
      description: 'Lista as partidas da base (placar, mapa, data, evento e destaques). Use filtro de time ou mapa opcional. Índice da lista serve para detalhes.',
      parameters: {
        type: 'object',
        properties: {
          time: { type: 'string', description: 'Filtrar por time (opcional)' },
          mapa: { type: 'string', description: 'Filtrar por mapa (opcional, ex: Ascent)' },
          limite: { type: 'number', description: 'Máximo de partidas (padrão 10)' },
        },
      },
    },
    fn: (args) => {
      const team = String(args.time ?? '').toLowerCase()
      const map = String(args.mapa ?? '').toLowerCase()
      const limit = Number(args.limite ?? 10)
      let idx = 0
      const lines: string[] = []
      for (const m of data.matches) {
        if (team && !m.teams.Red.name.toLowerCase().includes(team) && !m.teams.Blue.name.toLowerCase().includes(team)) continue
        if (map && !mapName(m.map).toLowerCase().includes(map)) continue
        lines.push(matchSummary(m, idx))
        if (lines.length >= limit) break
        idx++
      }
      return lines.length ? lines.join('\n') : 'Nenhuma partida com esse filtro.'
    },
  })

  tools.push({
    declaration: {
      name: 'detalhar_partida',
      description: 'Detalhes de uma partida pelo índice da listar_partidas (1-based): placar, scoreboard completo com agentes/ACS, rounds (compra, site, vencedor) e momentos-chave (clutches, aberturas).',
      parameters: { type: 'object', properties: { indice: { type: 'number', description: 'Índice 1-based da partida na lista' } }, required: ['indice'] },
    },
    fn: (args) => {
      const i = Number(args.indice ?? 1) - 1
      const m = data.matches[i]
      if (!m) return 'Índice inválido — use listar_partidas primeiro.'
      const a = analyze(m)
      const board = m.players
        .map((p) => {
          const ps = a.byPlayer[p.p]
          return `${p.n}[${agentName(p.a)},${m.teams[p.t].name}] ACS${Math.round(p.sc / Math.max(1, p.rp))} ${p.k}/${p.d}/${p.as} ADR${ps ? Math.round(ps.dmg / Math.max(1, p.rp)) : 0} FB${ps?.fb ?? 0} clutch${ps?.clutchW ?? 0}V${ps?.clutchL ?? 0}L`
        })
        .join('\n')
      const rounds = a.rounds
        .map((r) => `R${r.n + 1}:${m.teams[r.win].name} venceu,${r.buy.Red === 'Pistol' ? 'PISTOLA' : r.buy.Red},site${r.site || '-'}`)
        .join(' ')
      const clutches = a.rounds.filter((r) => r.clutch && r.clutch.vs >= 2)
        .map((r) => `R${r.n + 1}: 1v${r.clutch!.vs} ${data.players[r.clutch!.p] ?? '?'} ${r.clutch!.won ? 'GANHOU' : 'perdeu'}`)
        .join('; ')
      return `${mapName(m.map)} ${m.date} [${m.event}]: ${m.teams.Red.name} ${m.teams.Red.won}x${m.teams.Blue.won} ${m.teams.Blue.name}\nSCOREBOARD:\n${board}\nROUNDS: ${rounds}\nCLUTCHES: ${clutches || 'nenhum 1v2+'}`
    },
  })

  tools.push({
    declaration: {
      name: 'comparar_jogadores',
      description: 'Compara dois jogadores lado a lado: ACS, K/D, ADR, HS%, KAST, aberturas, clutches, util e ADR por compra.',
      parameters: {
        type: 'object',
        properties: { a: { type: 'string', description: 'Nome do primeiro jogador' }, b: { type: 'string', description: 'Nome do segundo jogador' } },
        required: ['a', 'b'],
      },
    },
    fn: (args) => {
      const ga = findPlayer(data, String(args.a ?? ''))
      const gb = findPlayer(data, String(args.b ?? ''))
      if (!ga || !gb) return `Não encontrei: ${!ga ? args.a : ''} ${!gb ? args.b : ''}`
      const pick = (g: PlayerAgg) => JSON.parse(playerSummary(g)) as Record<string, unknown>
      const A = pick(ga), B = pick(gb)
      const keys = ['acs', 'kd', 'adr', 'hsPct', 'kast', 'fb', 'fd', 'clutch', 'utilPorRound', 'adrFullBuy', 'partidas']
      const lines = keys.map((k) => `${k}: ${String(A[k])} vs ${String(B[k])}`)
      return `${ga.name} VS ${gb.name}\n${lines.join('\n')}\nagentes A: ${String(A.agentes)}\nagentes B: ${String(B.agentes)}`
    },
  })

  tools.push({
    declaration: {
      name: 'ranking',
      description: 'Top 10 jogadores da base por métrica: acs, adr, kd, hs, kast, clutch, fb, util.',
      parameters: {
        type: 'object',
        properties: { metrica: { type: 'string', description: 'acs | adr | kd | hs | kast | clutch | fb | util' } },
        required: ['metrica'],
      },
    },
    fn: (args) => {
      const aggs = Object.values(aggregatePlayers(data, data.matches)).filter((g) => g.rounds >= 30)
      const metric = String(args.metrica ?? 'acs')
      const score: Record<string, (g: PlayerAgg) => number> = {
        acs: (g) => g.acs, adr: (g) => g.adr, kd: (g) => g.kd, hs: (g) => g.hsPct,
        kast: (g) => g.kast, clutch: (g) => g.clutchW - g.clutchL, fb: (g) => g.fb - g.fd,
        util: (g) => g.abCasts / Math.max(1, g.rounds),
      }
      const s = score[metric] ?? score.acs
      return aggs.sort((x, y) => s(y) - s(x)).slice(0, 10)
        .map((g, i) => `${i + 1}. ${g.name} (${s(g) >= 10 ? Math.round(s(g)) : Math.round(s(g) * 100) / 100}) ${g.matches}j`)
        .join('\n')
    },
  })

  tools.push({
    declaration: {
      name: 'estatisticas_mapa',
      description: 'Desempenho dos times por mapa (V/D por time) — para análises de veto e preparação.',
      parameters: {
        type: 'object',
        properties: { mapa: { type: 'string', description: 'Nome do mapa (opcional; sem filtro lista todos)' } },
      },
    },
    fn: (args) => {
      const map = String(args.mapa ?? '').toLowerCase()
      const acc: Record<string, Record<string, { w: number; n: number }>> = {}
      for (const m of data.matches) {
        const mn = mapName(m.map)
        if (map && !mn.toLowerCase().includes(map)) continue
        for (const t of ['Red', 'Blue'] as TeamId[]) {
          const won = m.teams[t].won > m.teams[other(t)].won
          ;(acc[mn] ??= {})[m.teams[t].name] = {
            w: ((acc[mn]?.[m.teams[t].name]?.w ?? 0) + (won ? 1 : 0)),
            n: (acc[mn]?.[m.teams[t].name]?.n ?? 0) + 1,
          }
        }
      }
      return Object.entries(acc)
        .map(([mn, teams]) => `${mn}: ${Object.entries(teams).map(([tn, v]) => `${tn} ${v.w}/${v.n}`).join(', ')}`)
        .join('\n')
    },
  })

  tools.push({
    declaration: {
      name: 'momentos_chave',
      description: 'Momentos decisivos com deep-link para o round exato: clutches 1v2+ (com linha do tempo de kills, placar, tempo de plant — para narrar onde dava pra mudar o resultado) e rounds perdidos críticos do time (anti-eco, pós-plant, retake, pistola). Cada momento tem campo link (spike://match/ID?round=N) — SEMPRE inclua o link em markdown [texto](link) ao citar o momento.',
      parameters: {
        type: 'object',
        properties: {
          jogador: { type: 'string', description: 'Filtrar clutches por jogador (opcional)' },
          time: { type: 'string', description: 'Filtrar rounds críticos por time (opcional)' },
          tipo: { type: 'string', description: 'clutch | criticos | todos (padrão todos)' },
        },
      },
    },
    fn: (args) => {
      const tipo = String(args.tipo ?? 'todos')
      const jogador = args.jogador ? String(args.jogador) : undefined
      const time = args.time ? String(args.time) : undefined
      const parts: string[] = []
      if ((tipo === 'clutch' || tipo === 'todos') && jogador) {
        const g = Object.values(aggregatePlayers(data, data.matches)).find((x) =>
          x.name.toLowerCase().includes(jogador.toLowerCase()),
        )
        const cms = clutchMoments(data, g?.p)
        parts.push(
          `CLUTCHES de ${g?.name ?? jogador} (${cms.length}): ` +
            cms.slice(0, 8).map((c) => JSON.stringify(c)).join('\n'),
        )
      }
      if (tipo === 'criticos' || tipo === 'todos') {
        let teamName = time
        if (!teamName && jogador) {
          const g = Object.values(aggregatePlayers(data, data.matches)).find((x) =>
            x.name.toLowerCase().includes(jogador.toLowerCase()),
          )
          const names = [...new Set(data.matches.flatMap((m) => [m.teams.Red.name, m.teams.Blue.name]))]
          teamName = names.find((n) => n.toLowerCase().includes(jogador.toLowerCase())) ?? undefined
        }
        if (teamName) {
          const rm = roundMoments(data, teamName).slice(0, 8)
          parts.push(`ROUNDS CRÍTICOS de ${teamName}: ` + rm.map((x) => JSON.stringify(x)).join('\n'))
        }
      }
      return parts.length ? parts.join('\n\n') : 'Informe jogador ou time para filtrar os momentos.'
    },
  })

  tools.push({
    declaration: {
      name: 'buscar_rounds',
      description: 'Busca SEMÂNTICA nos 922 rounds da base (embeddings nomic-embed-text): descreva a situação ("retake falho no site A", "clutch 1v3 com operator", "anti-eco perdido") e recebe os rounds mais similares com narrativa completa e link spike:// para abrir o round exato. Use para achar padrões e exemplos concretos.',
      parameters: {
        type: 'object',
        properties: { consulta: { type: 'string', description: 'Descrição da situação de round em português' } },
        required: ['consulta'],
      },
    },
    fn: async (args) => {
      const { hits } = await searchRounds(String(args.consulta ?? ''), 6)
      if (!hits.length) return 'Nada similar encontrado — tente descrever diferente.'
      return hits
        .map((h, i) =>
          `${i + 1}. [Round ${h.round + 1} — ${h.map} (${h.event}, ${h.date})](spike://match/${h.matchId}?round=${h.round}) similaridade ${(h.score * 100).toFixed(0)}%\n${h.snippet.slice(0, 300)}`,
        )
        .join('\n\n')
    },
  })

  tools.push({
    declaration: {
      name: 'buscar_vods',
      description: 'Busca semântica em transcrições de VODs de broadcast (Champions) com timestamps — para referências de pros. O texto do cast está em inglês; consultas em inglês funcionam melhor ("site B retake", "clutch 1v2").',
      parameters: {
        type: 'object',
        properties: { consulta: { type: 'string', description: 'Consulta (inglês recomendado)' } },
        required: ['consulta'],
      },
    },
    fn: async (args) => {
      try {
        const hits = await searchVods(String(args.consulta ?? ''), 5)
        return hits.map((h, i) => `${i + 1}. [${h.mmss}] ${h.text.slice(0, 220)}`).join('\n') || 'sem resultados'
      } catch (e) {
        return `Serviço de VODs offline: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  })

  return tools
}

function other(t: TeamId): TeamId {
  return t === 'Red' ? 'Blue' : 'Red'
}
