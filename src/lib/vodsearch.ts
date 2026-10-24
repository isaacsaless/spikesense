// Busca nos VODs do serviço local (127.0.0.1:8765 — "Busca VODs Champions"),
// exposto no front via proxy /vodapi. Cada hit é um trecho do cast com timestamp.
export interface VodHit {
  start: number
  end: number
  mmss: string
  score: number
  text: string
}

export async function searchVods(query: string, k = 6): Promise<VodHit[]> {
  const res = await fetch(`/vodapi/api/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Serviço de VODs indisponível (127.0.0.1:8765)')
  const json = (await res.json()) as VodHit[]
  return json.slice(0, k)
}

export function openVodSearch(query: string): void {
  window.open(`http://127.0.0.1:8765/?q=${encodeURIComponent(query)}`, '_blank')
}
