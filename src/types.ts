export type TeamId = 'Red' | 'Blue'

export interface MPlayer {
  p: string; n: string; t: TeamId; a: string
  k: number; d: number; as: number; sc: number; rp: number
  ab: Record<string, number>
}

export interface Kill {
  t: number; k: string; v: string; x: number; y: number
  w: string; dt: string; as: string[]
}

// [attacker, receiver, dmg, hs, bs, ls]
export type Dmg = [string, string, number, number, number, number]

export interface Round {
  n: number; res: string; code: string
  win: TeamId; wr: '' | 'Attacker' | 'Defender'
  site: string; plant: number | null; defuse: number | null
  kp: string; kd: string
  kills: Kill[]; dmg: Dmg[]
  econ: Record<string, [number, string, string, number, number]>
}

export interface MatchTeam { name: string; won: number }

export interface Match {
  id: string; event: string; num: string; date: string
  map: string; dur: number; ver: string
  teams: Record<TeamId, MatchTeam>
  players: MPlayer[]; rounds: Round[]
}

export interface Dataset {
  generated: string
  matches: Match[]
  players: Record<string, string>
}
