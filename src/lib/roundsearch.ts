// Busca semântica de rounds: embeddings nomic-embed-text (Ollama local via
// proxy /ollama) sobre o índice gerado por scripts/build_round_index.py.
// Fallback automático para busca lexical quando o Ollama não responde.
export interface RoundDoc {
  id: string
  matchId: string
  round: number
  map: string
  event: string
  date: string
  text: string
  raw: string
  vector: number[] | null
}

export interface RoundIndex {
  dim: number
  model: string
  docs: RoundDoc[]
}

export interface RoundHit {
  matchId: string
  round: number
  map: string
  event: string
  date: string
  snippet: string
  score: number
}

let indexPromise: Promise<RoundIndex> | null = null

export function loadRoundIndex(): Promise<RoundIndex> {
  indexPromise ??= fetch('rounds-index.json').then((r) => {
    if (!r.ok) throw new Error('rounds-index.json não encontrado — rode python scripts/build_round_index.py')
    return r.json() as Promise<RoundIndex>
  })
  return indexPromise
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const STOP: Record<string, true> = {
  de: true, da: true, do: true, que: true, com: true, para: true, por: true,
  uma: true, os: true, as: true, em: true, no: true, na: true, e: true,
  o: true, a: true, the: true, of: true,
}

function tokens(s: string): string[] {
  return normalize(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !(t in STOP))
}

async function embedQuery(q: string, model: string): Promise<number[] | null> {
  try {
    const res = await fetch('/ollama/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: [q] }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { embeddings?: number[][] }
    return json.embeddings?.[0] ?? null
  } catch {
    return null
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

function lexical(query: string, docs: RoundDoc[], k: number): RoundHit[] {
  const qs = tokens(query)
  if (!qs.length) return []
  const df = new Map<string, number>()
  for (const t of qs) {
    let n = 0
    for (const d of docs) if (d.text.includes(t)) n++
    df.set(t, n)
  }
  return docs
    .map((d) => {
      let score = 0
      for (const t of qs) {
        const tf = d.text.split(t).length - 1
        if (tf > 0) score += tf * Math.log(1 + docs.length / (1 + (df.get(t) ?? 0)))
      }
      return { matchId: d.matchId, round: d.round, map: d.map, event: d.event, date: d.date, snippet: d.raw, score }
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

export interface SearchMeta {
  mode: 'semantico' | 'lexical'
}

export async function searchRounds(query: string, k = 8): Promise<{ hits: RoundHit[]; meta: SearchMeta }> {
  const index = await loadRoundIndex()
  const withVectors = index.docs.filter((d) => d.vector)
  if (withVectors.length) {
    const qv = await embedQuery(query, index.model || 'nomic-embed-text')
    if (qv) {
      const hits = withVectors
        .map((d) => ({
          matchId: d.matchId, round: d.round, map: d.map, event: d.event, date: d.date,
          snippet: d.raw, score: cosine(qv, d.vector as number[]),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
      return { hits, meta: { mode: 'semantico' } }
    }
  }
  return { hits: lexical(query, index.docs, k), meta: { mode: 'lexical' } }
}
