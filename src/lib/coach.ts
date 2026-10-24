import type { PlayerAgg, TeamAgg } from './metrics'
import { slope } from './metrics'
import { agentName, mapName } from './load'

export interface Finding {
  id: string
  severity: 1 | 2 | 3 // 3 = crítico
  kind: 'fraqueza' | 'forca'
  tag: string
  title: string
  evidence: string
  recommendation: string
  drill?: string
}

const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1)
const pc = (x: number) => `${Math.round(x * 100)}%`
const wr = (w: number, l: number) => (w + l ? w / (w + l) : 0)

export function playerFindings(g: PlayerAgg): Finding[] {
  const f: Finding[] = []
  const matches = g.matches
  const shots = g.hs + g.bs + g.ls

  // 1. Mira — HS%
  if (shots > 80) {
    if (g.hsPct < 0.18)
      f.push({
        id: 'hs-baixo', severity: 3, kind: 'fraqueza', tag: 'Mira',
        title: `Headshot baixo: ${pc(g.hsPct)} em ${matches} partidas`,
        evidence: `${g.hs} HS em ${shots} tiros certos (média competitiva ≈ 20–25%).`,
        recommendation: 'Priorize crosshair placement na altura da cabeça e treino de mira diário (deathmatch com foco em HS).',
        drill: '10 min de DM só com Sheriff/Vandal mirando cabeça + 100 bots no range antes de jogar.',
      })
    else if (g.hsPct >= 0.25)
      f.push({
        id: 'hs-alto', severity: 1, kind: 'forca', tag: 'Mira',
        title: `Headshot forte: ${pc(g.hsPct)}`,
        evidence: `${g.hs} HS em ${shots} tiros certos.`,
        recommendation: 'Mira é seu ponto forte — busque duelos mais agressivos em posições que recompensam aim.',
      })
  }

  // 2. Abertura — FB/FD
  const fbNet = g.fb - g.fd
  if (matches >= 3 && Math.abs(fbNet) / matches >= 1.2) {
    if (fbNet < 0)
      f.push({
        id: 'abertura-neg', severity: 2, kind: 'fraqueza', tag: 'Abertura',
        title: `Perdendo duelos de abertura (${g.fb} FB vs ${g.fd} FD, ${fbNet > 0 ? '+' : ''}${fbNet})`,
        evidence: `Primeiro sangue em ${g.fb} rounds vs primeira morte em ${g.fd}. Uma primeira morte por round entrega o mapa ao inimigo.`,
        recommendation: 'Reduza exposição nas aberturas: use utilitária antes do peek, jogue com trade garantido e evite abrir solo.',
        drill: 'Reveja 10 aberturas suas por partida: quantas foram com util? Meta: 70%+ com flash/smoke de apoio.',
      })
    else
      f.push({
        id: 'abertura-pos', severity: 1, kind: 'forca', tag: 'Abertura',
        title: `Ganhando duelos de abertura (+${fbNet})`,
        evidence: `${g.fb} first bloods contra ${g.fd} first deaths.`,
        recommendation: 'Explore isso em rounds de pistol e anti-eco: você gera vantagem numérica cedo.',
      })
  }

  // 3. Trades — mortes tradedadas
  if (g.deaths > 40) {
    const tradedPct = g.tradedDeaths / g.deaths
    if (tradedPct < 0.3)
      f.push({
        id: 'isolado', severity: 2, kind: 'fraqueza', tag: 'Posicionamento',
        title: `Morrendo isolado: só ${pc(tradedPct)} das mortes foram tradadas`,
        evidence: `${g.tradedDeaths} de ${g.deaths} mortes com trade da equipe (saudável ≈ 40%+).`,
        recommendation: 'Jogue a no máximo 1 salto de um colega. Em execução de site, entre depois do entry ou em janelas cobertas.',
        drill: 'Antes de cada peek: "alguém pode me tradar em <5s?" Se não, reposicione.',
      })
  }

  // 4. Clutch
  const clAtt = g.clutchW + g.clutchL
  if (clAtt >= 4 && g.clutchW / clAtt < 0.3)
    f.push({
      id: 'clutch', severity: 2, kind: 'fraqueza', tag: 'Clutch',
      title: `Clutch 1v2+: ${g.clutchW}V-${g.clutchL}D (${pc(g.clutchW / clAtt)} de vitória)`,
      evidence: `${clAtt} situações 1v2+ finalizadas.`,
      recommendation: 'Em 1vX: jogue pelo tempo, isole duelos 1v1, force o defuse/matemática a favor. Evite abrir contra 2.',
      drill: 'Reveja suas clutches perdidas: quantas foram por apressar o peek final?',
    })

  // 5. Tendência de ACS
  if (g.series.length >= 4) {
    const sl = slope(g.series.map((s) => s.acs))
    if (sl <= -6)
      f.push({
        id: 'tendencia-neg', severity: 2, kind: 'fraqueza', tag: 'Consistência',
        title: `ACS em queda (${n1(sl)} pts/partida)`,
        evidence: `Série de ACS: ${g.series.map((s) => s.acs).join(' → ')}.`,
        recommendation: 'Queda consistente ao longo dos jogos — verifique tilt, fadiga ou leitura dos adversários. Fixe uma rotina entre mapas.',
      })
    else if (sl >= 6)
      f.push({
        id: 'tendencia-pos', severity: 1, kind: 'forca', tag: 'Consistência',
        title: `ACS em alta (+${n1(sl)} pts/partida)`,
        evidence: `Série de ACS: ${g.series.map((s) => s.acs).join(' → ')}.`,
        recommendation: 'Mantenha o que está fazendo — mapeie o que mudou e transforme em rotina.',
      })
  }

  // 6. Pool de agentes — delta de ACS
  const agents = Object.entries(g.byAgent)
    .filter(([, v]) => v.rounds >= 20)
    .map(([uuid, v]) => ({ uuid, name: agentName(uuid), acs: Math.round(v.score / v.rounds), ...v }))
  if (agents.length >= 2) {
    agents.sort((a, b) => b.acs - a.acs)
    const best = agents[0]
    const worst = agents[agents.length - 1]
    if (best.acs - worst.acs >= 30 && best.uuid !== worst.uuid)
      f.push({
        id: 'agent-pool', severity: 2, kind: 'fraqueza', tag: 'Agentes',
        title: `Rende muito mais com ${best.name} (${best.acs} ACS) que com ${worst.name} (${worst.acs})`,
        evidence: `Delta de ${best.acs - worst.acs} ACS. WR: ${pc(best.wins / best.matches)} com ${best.name} vs ${pc(worst.wins / worst.matches)} com ${worst.name}.`,
        recommendation: `Priorize ${best.name} nos mapas do pick; treine ${worst.name} só em scrims até o conforto subir.`,
      })
  }

  // 7. ADR
  if (g.rounds > 60 && g.adr < 125)
    f.push({
      id: 'adr', severity: 2, kind: 'fraqueza', tag: 'Dano',
      title: `Dano por round baixo: ${g.adr} ADR`,
      evidence: `${g.dmg} de dano em ${g.rounds} rounds (referência competitiva ≈ 140+).`,
      recommendation: 'Amplifique presença em rounds: posiciones de spam pós-plant, util de dano e escaramuças de médio alcance.',
    })
  // 8. Utilização de utilitários (valorização)
  const utilPerRound = g.rounds ? g.abCasts / g.rounds : 0
  if (g.rounds >= 60 && utilPerRound < 1.2)
    f.push({
      id: 'util', severity: 2, kind: 'fraqueza', tag: 'Utilitários',
      title: `Subutilizando utilitários: ${n1(utilPerRound)} casts/round`,
      evidence: `${g.abCasts} casts básicos em ${g.rounds} rounds (referência: 1.5–2.5/round). Ultis: ${g.ultCasts}.`,
      recommendation: 'Util parada não gera valor: cada round defina 1 util ANTES do contato (smoke de linha, flash de apoio). Guarde ult só para execução/retake.',
      drill: 'Range: treinar linha de smoke de cada mapa (5 min/mapa) + entrada com flash própria em cada exec.',
    })

  // 9. Valorização de compra cheia
  const fullRounds = g.roundsByBuy.Full
  const adrFull = fullRounds ? Math.round(g.dmgByBuy.Full / fullRounds) : 0
  if (fullRounds >= 40 && adrFull < 120 && g.adr > 0 && adrFull < g.adr * 0.9)
    f.push({
      id: 'valorizacao', severity: 2, kind: 'fraqueza', tag: 'Valorização',
      title: `Rende menos com compra cheia: ${adrFull} ADR (full) vs ${g.adr} geral`,
      evidence: `${fullRounds} rounds de full buy renderam ${g.dmgByBuy.Full} de dano (${adrFull}/round).`,
      recommendation: 'Comprar caro e jogar sem pressão = crédito desperdiçado. Em full buy, jogue para sobreviver ao primeiro contato e trocar; evite duelos 50/50 que você já perde em eco.',
    })

  // 10. Abertura por lado
  if (g.fbAtk + g.fbDef + g.fdAtk + g.fdDef >= 20) {
    const atkNet = g.fbAtk - g.fdAtk
    const defNet = g.fbDef - g.fdDef
    if (atkNet <= -4 && defNet >= 2)
      f.push({
        id: 'lado-abertura', severity: 2, kind: 'fraqueza', tag: 'Abertura',
        title: `Abertura: forte na defesa (+${defNet}), negativa no ataque (${atkNet})`,
        evidence: `Ataque: ${g.fbAtk} FB / ${g.fdAtk} FD. Defesa: ${g.fbDef} FB / ${g.fdDef} FD.`,
        recommendation: 'No ataque, pare de abrir solo: use util antes do peek e deixe o entry abrir com trade garantido. Na defesa, mantenha as agressividades que funcionam.',
      })
    else if (defNet <= -4 && atkNet >= 2)
      f.push({
        id: 'lado-abertura', severity: 2, kind: 'fraqueza', tag: 'Posicionamento',
        title: `Abertura: positivo no ataque (+${atkNet}), mas morre primeiro na defesa (${defNet})`,
        evidence: `Defesa: ${g.fbDef} FB / ${g.fdDef} FD — ângulos repetidos estão sendo punidos.`,
        recommendation: 'Na defesa, varie setups (ângulo off, posição profunda) e jogue contato com info de util; pare de repetir o mesmo ângulo após morrer nele 2x.',
      })
  }
  return f.sort((a, b) => b.severity - a.severity || a.kind.localeCompare(b.kind))
}

export function teamFindings(t: TeamAgg): Finding[] {
  const f: Finding[] = []
  const pistolWR = wr(t.pistols.won, t.pistols.lost)
  const apw = wr(t.afterPistolWin.won, t.afterPistolWin.lost)
  const apl = wr(t.afterPistolLoss.won, t.afterPistolLoss.lost)

  // 1. Pistolas
  if (t.pistols.won + t.pistols.lost >= 6 && pistolWR < 0.45)
    f.push({
      id: 'pistolas', severity: 3, kind: 'fraqueza', tag: 'Pistolas',
      title: `Pistol rounds: ${t.pistols.won}W-${t.pistols.lost}L (${pc(pistolWR)})`,
      evidence: `Rounds 1 e 13 valem 2 rounds cada (o próximo vem de graça quase sempre). Conversão pós-pistola ganha: ${pc(apw)}; perdida: ${pc(apw ? apl : 0)}.`,
      recommendation: 'Monte setups de pistol por mapa (2 site / stack) e defina quem abre e quem segura o trade.',
    })

  // 2. Anti-eco perdido
  if (t.antiEcoRounds >= 5 && t.antiEcoLosses / t.antiEcoRounds > 0.25) {
    f.push({
      id: 'anti-eco', severity: 3, kind: 'fraqueza', tag: 'Economia',
      title: `Perdendo ${t.antiEcoLosses}/${t.antiEcoRounds} rounds de anti-eco`,
      evidence: `Rounds com vantagem de compra clara (full vs eco) perdidos: ${pc(t.antiEcoLosses / t.antiEcoRounds)}. Referência saudável: < 15%.`,
      recommendation: 'Anti-eco exige respeito: nunca peek sem necessidade, junte-se, cubra entradas com util e limpe cantos methodicamente.',
    })
  }

  // 3. Conversão pós-plant
  const ppWR = wr(t.postPlant.won, t.postPlant.lost)
  if (t.postPlant.won + t.postPlant.lost >= 8 && ppWR < 0.55)
    f.push({
      id: 'pos-plant', severity: 2, kind: 'fraqueza', tag: 'Pós-plant',
      title: `Conversão pós-plant: ${pc(ppWR)} (${t.postPlant.won}-${t.postPlant.lost})`,
      evidence: 'Plantou a spike mas perdeu o round em mais da metade das vezes.',
      recommendation: 'Defina posições pós-plant por mapa (linha de spam + retake fracionado) e treine cenários 20s restantes.',
    })

  // 4. Retake
  const rtWR = wr(t.retake.won, t.retake.lost)
  if (t.retake.won + t.retake.lost >= 8 && rtWR < 0.25)
    f.push({
      id: 'retake', severity: 2, kind: 'fraqueza', tag: 'Retake',
      title: `Retake: ${pc(rtWR)} (${t.retake.won}-${t.retake.lost})`,
      evidence: 'Rounds defendidos com spike plantada quase sempre perdidos.',
      recommendation: 'Retake em bloco com util sincronizada (flash + detector); nunca retake individual contra 2+.',
    })

  // 5. Previsibilidade de site
  const plants = Object.entries(t.sites).sort((a, b) => b[1].plants - a[1].plants)
  const totalPlants = plants.reduce((s, [, v]) => s + v.plants, 0)
  if (totalPlants >= 15 && plants[0] && plants[0][1].plants / totalPlants > 0.55) {
    const [site, v] = plants[0]
    const siteWR = v.won / v.plants
    const effective = siteWR >= 0.65
    f.push({
      id: 'site-prev', severity: effective ? 1 : 2, kind: effective ? 'forca' : 'fraqueza', tag: 'Execução',
      title: `Ataque previsível: ${pc(v.plants / totalPlants)} dos plants no site ${site}${effective ? ` — e funcionando (${pc(siteWR)} WR)` : ''}`,
      evidence: `Sites: ${plants.map(([s, x]) => `${s} ${x.plants} (${pc(x.won / x.plants)} WR)`).join(', ')}.`,
      recommendation: effective
        ? `A concentração no ${site} está vencendo agora, mas times mais preparados vão antecipar a leitura. Desenvolva variação no outro site em rounds de baixo risco.`
        : `Diversifique entradas (fake/${site === 'A' ? 'B' : 'A'} nos rounds de pistola/eco) para tirar a leitura da defesa.`,
    })
  }

  // 6. Trade / conexão
  if (t.tradesFor + t.tradesAgainst > 30 && t.tradesFor < t.tradesAgainst * 0.75)
    f.push({
      id: 'trade', severity: 2, kind: 'fraqueza', tag: 'Trade',
      title: `Trade perdendo: ${t.tradesFor} feitos vs ${t.tradesAgainst} sofridos`,
      evidence: 'O time adversário pune mortes quase 25%+ mais rápido que vocês.',
      recommendation: 'Jogue em duplas conectadas (entry + support a 1 salto). Defaults com controle de meio mapa antes de executar.',
    })

  // 7. Mentalidade
  const afterLossWR = wr(t.afterLoss.won, t.afterLoss.lost)
  if (t.afterLoss.won + t.afterLoss.lost >= 20 && afterLossWR < 0.42)
    f.push({
      id: 'mentalidade', severity: 2, kind: 'fraqueza', tag: 'Mentalidade',
      title: `Reação a round perdido: ${pc(afterLossWR)} de vitória no round seguinte`,
      evidence: `${t.afterLoss.won}-${t.afterLoss.lost} em rounds após derrota (paridade ≈ 50%).`,
      recommendation: 'Rounds de reset (eco consciente) após 2 derrotas seguidas evitam landslide econômico; comunique reset entre rounds.',
    })

  // 8. Mapa pior
  const maps = Object.entries(t.byMap).filter(([, v]) => v.matches >= 2)
  if (maps.length >= 2) {
    maps.sort((a, b) => a[1].wins / a[1].matches - b[1].wins / b[1].matches)
    const [worst, w] = maps[0]
    if (w.wins === 0)
      f.push({
        id: 'mapa-pior', severity: 2, kind: 'fraqueza', tag: 'Mapas',
        title: `Sem vitórias em ${mapName(worst)} (${w.wins}-${w.matches})`,
        evidence: `Por mapa: ${maps.map(([mp, x]) => `${mapName(mp)} ${x.wins}/${x.matches}`).join(', ')}.`,
        recommendation: `Evite ${mapName(worst)} no veto ou monte setups específicos (site padrão + mid control) na semana.`,
      })
  }

  // força: pistola > 60%
  if (t.pistols.won + t.pistols.lost >= 6 && pistolWR > 0.6)
    f.push({
      id: 'pistolas-forca', severity: 1, kind: 'forca', tag: 'Pistolas',
      title: `Pistol rounds fortes: ${pc(pistolWR)} (${t.pistols.won}-${t.pistols.lost})`,
      evidence: 'Rounds 1 e 13 consistentemente ganhos — alavanca econômica direta.',
      recommendation: 'Use a vantagem: capitalize com full buy e pressão de 3 rounds.',
    })

  // 9. Tempo de execução / rotação
  const fastWR = wr(t.fastPlants.won, t.fastPlants.lost)
  const lateWR = wr(t.latePlants.won, t.latePlants.lost)
  const fastN = t.fastPlants.won + t.fastPlants.lost
  const lateN = t.latePlants.won + t.latePlants.lost
  if (fastN >= 6 && lateN >= 6 && lateWR + 0.15 < fastWR)
    f.push({
      id: 'tempo', severity: 2, kind: 'fraqueza', tag: 'Rotação/Tempo',
      title: `Execução direta converte ${pc(fastWR)}; rotação lenta só ${pc(lateWR)}`,
      evidence: `Plants <25s: ${t.fastPlants.won}-${t.fastPlants.lost}. Plants >60s (default/rotação): ${t.latePlants.won}-${t.latePlants.lost}.`,
      recommendation: 'O time gasta o relógio rodando mapa e chega sem util/vida. Encurte o default: decisão de site até 0:40 e execute com util sincronizada em vez de picadas soltas.',
    })
  else if (fastN >= 6 && fastWR >= 0.62)
    f.push({
      id: 'tempo-forca', severity: 1, kind: 'forca', tag: 'Rotação/Tempo',
      title: `Execução direta afiada: ${pc(fastWR)} em plants rápidos`,
      evidence: `Plants <25s: ${t.fastPlants.won}-${t.fastPlants.lost}.`,
      recommendation: 'Mantenha o ritmo — surpresa é arma. Cuidado com times que estudam o rush: prepare 1 variação de fake por mapa.',
    })

  // 10. Retake com defuse
  const rtTotal = t.retake.won + t.retake.lost
  if (rtTotal >= 8 && t.retake.won > 0 && t.retakeDefuses / t.retake.won < 0.35)
    f.push({
      id: 'retake-defuse', severity: 1, kind: 'forca', tag: 'Retake',
      title: `Retake vence eliminando (${pc(1 - t.retakeDefuses / t.retake.won)} dos retakes sem defuse)`,
      evidence: `${t.retakeDefuses} defuses em ${t.retake.won} retakes ganhos.`,
      recommendation: 'Time mata bem pós-plant — mantenha o bloco. Atenção: contra times que seguram o pós-plant com spam, treine o defuse ninja/4s coberto.',
    })
  return f.sort((a, b) => b.severity - a.severity || a.kind.localeCompare(b.kind))
}

/** Contexto compacto para o LLM (coach conversacional). */
export function playerContext(g: PlayerAgg): string {
  const agents = Object.entries(g.byAgent)
    .map(([uuid, v]) => `${agentName(uuid)}: ${v.matches}j, ACS ${Math.round(v.score / v.rounds)}, WR ${pc(v.wins / v.matches)}`)
    .join('; ')
  return [
    `JOGADOR: ${g.name} — ${g.matches} partidas, ${g.rounds} rounds`,
    `ACS ${g.acs} | K/D ${n1(g.kd)} (${g.kills}/${g.deaths}/${g.assists}) | ADR ${g.adr} | HS ${pc(g.hsPct)} | KAST ${pc(g.kast)}`,
    `FB ${g.fb} / FD ${g.fd} | Trades feitos ${g.trades} / mortes tradadas ${g.tradedDeaths} | Clutch 1vX ${g.clutchW}W-${g.clutchL}L | +/- ${g.plusMinus > 0 ? '+' : ''}${g.plusMinus}`,
    `Abertura por lado — Ataque FB ${g.fbAtk}/FD ${g.fdAtk} | Defesa FB ${g.fbDef}/FD ${g.fdDef}`,
    `Util: ${n1(g.rounds ? g.abCasts / g.rounds : 0)} casts/round (${g.abCasts} básicos, ${g.ultCasts} ultis)`,
    `ADR por compra — Full ${Math.round(g.dmgByBuy.Full / Math.max(1, g.roundsByBuy.Full))} (${g.roundsByBuy.Full}r) | Force ${Math.round(g.dmgByBuy.Force / Math.max(1, g.roundsByBuy.Force))} (${g.roundsByBuy.Force}r) | Eco ${Math.round(g.dmgByBuy.Eco / Math.max(1, g.roundsByBuy.Eco))} (${g.roundsByBuy.Eco}r)`,
    `ACS por partida: ${g.series.map((s) => s.acs).join(', ')}`,
    `Agentes: ${agents}`,
  ].join('\n')
}

export function teamContext(t: TeamAgg): string {
  const maps = Object.entries(t.byMap).map(([mp, v]) => `${mapName(mp)} ${v.wins}/${v.matches}`).join('; ')
  const sites = Object.entries(t.sites).map(([s, v]) => `${s}: ${v.plants} plants, ${pc(v.won / v.plants)} WR`).join('; ')
  return [
    `TIME: ${t.name} — ${t.matches} partidas (${t.wins}V), rounds ${t.roundsWon}-${t.roundsLost}`,
    `Mapas: ${maps}`,
    `Pistolas ${t.pistols.won}-${t.pistols.lost} | Anti-eco perdido ${t.antiEcoLosses}/${t.antiEcoRounds}`,
    `Pós-plant ${t.postPlant.won}-${t.postPlant.lost} | Retake ${t.retake.won}-${t.retake.lost} (defuses ${t.retakeDefuses}) | Plants rápidos<25s ${t.fastPlants.won}-${t.fastPlants.lost} | Plants tardios>60s ${t.latePlants.won}-${t.latePlants.lost}`,
    `Sites: ${sites}`,
    `FB ${t.fbFor}/${t.fbAgainst} | Trades ${t.tradesFor} vs ${t.tradesAgainst} | Pós-derrota WR ${pc(wr(t.afterLoss.won, t.afterLoss.lost))}`,
  ].join('\n')
}
