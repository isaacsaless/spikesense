import mappingsJson from '../mappings.json'
import type { Dataset, Match } from '../types'

interface Asset { n: string; r?: string; c?: string; i?: string }

interface Mappings {
  agents: Record<string, Asset>
  maps: Record<string, Asset>
  mapsById: Record<string, Asset>
  weapons: Record<string, Asset>
  skins: Record<string, Asset>
}

// Cast único: asset local gerado por scripts/ (shape conhecido e estável).
// Atenção: chaves de agents/weapons/skins são lowercase; UUIDs da base vêm UPPERCASE.
const mappings = mappingsJson as Mappings

const lc = (u: string) => u.toLowerCase()

export async function loadDataset(): Promise<Dataset> {
  const r = await fetch('data.json')
  if (!r.ok) throw new Error('Falha ao carregar data.json')
  return r.json()
}

export function mapName(mapId: string): string {
  return mappings.maps[mapId]?.n ?? mapId.split('/').filter(Boolean).pop() ?? mapId
}

export function agentInfo(uuid: string): Asset | undefined {
  return mappings.agents[lc(uuid)]
}

export function agentName(uuid: string): string {
  return agentInfo(uuid)?.n ?? 'Agente?'
}

export function agentRole(uuid: string): string {
  return agentInfo(uuid)?.r ?? ''
}

export function agentIcon(uuid: string): string {
  return agentInfo(uuid)?.i ?? ''
}

/** Perfil do jogador no tracker.gg — "Isaac#venda" → tracker.gg/valorant/profile/riot/Isaac%23venda */
export function trackerUrl(nameTag: string): string {
  return `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(nameTag)}`
}
export function weaponInfo(uuid: string, dt?: string): Asset | undefined {
  const k = lc(uuid)
  return mappings.weapons[k] ?? mappings.skins[k] ?? (dt === 'Melee' ? mappings.weapons['melee'] : undefined)
}

export function weaponName(uuid: string, dt?: string): string {
  const w = weaponInfo(uuid, dt)
  if (w) return w.n
  if (dt === 'Bomb') return 'Spike'
  if (dt === 'Ability') return 'Habilidade'
  if (dt === 'Melee') return 'Faca'
  return uuid ? 'Desconhecida' : '—'
}

export function weaponIcon(uuid: string, dt?: string): string {
  return weaponInfo(uuid, dt)?.i ?? ''
}

export function weaponCat(uuid: string): string {
  return weaponInfo(uuid)?.c ?? ''
}

export function matchTitle(m: Match): string {
  return `${m.teams.Red.name} ${m.teams.Red.won} × ${m.teams.Blue.won} ${m.teams.Blue.name}`
}

export const fmt1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1)
export const fmt0 = (x: number) => Math.round(x).toString()
export const pct = (x: number) => `${Math.round(x * 100)}%`
