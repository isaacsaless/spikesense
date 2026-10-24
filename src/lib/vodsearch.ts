// Busca nos VODs profissionais (serviço local 127.0.0.1:8765 — casts de
// Champions com timestamps), exposto no front via proxy /vodapi.
// O vídeo de cada hit é servido em /video/<videoIdx> e tocado INLINE no app.
export interface VodHit {
  start: number
  end: number
  mmss: string
  score: number
  text: string
  videoIdx: number
  video: string
}

export async function searchVods(query: string, k = 6): Promise<VodHit[]> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt * attempt))
    try {
      const res = await fetch(`/vodapi/api/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as VodHit[]
      return json.slice(0, k)
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`Serviço de VODs indisponível: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}
/** Rótulo limpo do VOD (remove sufixo padrão dos arquivos). */
export function vodLabel(video: string): string {
  return video.replace('— FULL MATCH — ', '').replace('.mp4', '').trim()
}
