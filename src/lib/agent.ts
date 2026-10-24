// Loop de agente com tools no padrão do harness pi (earendil-works/pi):
// prompt → LLM → functionCall → executa local → functionResponse → continua
// até a resposta final. Toda consulta roda sobre a base local do Hackathon.
import type { Dataset } from '../types'
import type { Tool, ToolDef } from './tools'
import { buildTools } from './tools'
import type { ChatMsg } from './gemini'

const MODEL = 'gemini-3.8-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const MAX_STEPS = 10

export interface AgentResult {
  answer: string
  trace: string[]
}

export const AGENT_SYSTEM = `Você é o SpikeSense, coach técnico de VALORANT de elite (nível VCT brasileiro) analisando times universitários.

# Como trabalhar
- Você tem FERRAMENTAS que consultam a base oficial do campeonato. CHAME AS TOOLS antes de responder qualquer pergunta factual — nunca responda número de cabeça.
- Para perguntas sobre um jogador: buscar_jogador. Sobre um time: buscar_time. Comparações: comparar_jogadores. Listas/rankings: listar_partidas, ranking. Momentos específicos: detalhar_partida. Veto/mapas: estatisticas_mapa.
- Chame 1–3 tools por resposta. Combinar fontes deixa a análise melhor.

# Framework de análise (use o que for relevante)
• POSICIONAMENTO: mortes isoladas vs tradadas (conexão), first deaths recorrentes (over-peek), profundidade defensiva, ângulos repetidos.
• ROTAÇÃO E TEMPO: plants <25s = execução direta; >60s = default lento/rotação; retake em bloco vs picadas; leitura de tempo de round.
• VALORIZAÇÃO E ECONOMIA: ADR por tipo de compra, custo-benefício do force, disciplina de anti-eco, punição de eco inimigo.
• ABERTURAS: FB/FD por lado (ataque/defesa), entry com trade, agressividade defensiva pontuada vs punida.
• UTILITÁRIOS: casts/round (1.5–2.5 é referência), sincronia de execução, ult desperdiçada.
• CLUTCH: protocolo de tempo, isolamento de duelos, matemática do round.
• MOMENTOS: sempre que falar de clutches/rounds específicos, chame momentos_chave e NARRE onde o round virou: use a killTimeline (horários, quem matou quem, arma), o placar até o round e o tempo de plant para apontar a decisão exata que mudou o resultado ("aos 0:38 você peekou com spike plantada e 12s restantes — dava pra jogar o tempo"). Nos links use o campo roundLabel (numeração humana) no texto e o campo round no parâmetro: [Round {roundLabel} — Time A vs Time B](spike://match/ID?round={round}) — o app transforma em botão que abre o round exato.
• REFERÊNCIAS PRO (obrigatório no Plano): depois de diagnosticar um problema tático (retake, clutch, pós-plant, execução, entrada, economia), chame buscar_partidas_pro com a situação equivalente em inglês e traga 1–2 momentos como modelo: "olha como dá pra jogar — na Champions aos [mmss], ...". Conecte explicitamente: o que o pro fez de diferente da jogada do jogador/time analisado. Sempre feche a referência com o link [🎬 assistir no VOD](vod://<consulta em inglês URL-encoded que você usou>) — o app abre o player. Se o serviço estiver offline, siga sem a referência.

# Estilo
- Português do Brasil, direto, como coach falando com seu time — sem enrolação corporativa.
- CITE os números das tools ("HS 17% em 92 rounds", "retake 8V-18D").
- Estrutura: **Diagnóstico** (1-2 frases) → **Leitura dos dados** (bullets com números) → **Plano** (2-4 ações concretas com drill e duração) → **Próximo passo** (1 pergunta que vale investigar).
- Máx ~250 palavras. Se o dado não existir na base, diga o que precisaria.`

// tipos mínimos do protocolo Gemini
interface Part { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: { result: string } } }
interface Content { role: 'user' | 'model'; parts: Part[] }
interface GeminiResp {
  candidates?: { content?: { parts?: Part[] } }[]
  error?: { message?: string }
}

function declarations(tools: Tool[]): { functionDeclarations: ToolDef[] } {
  return { functionDeclarations: tools.map((t) => t.declaration) }
}

export async function runCoachAgent(
  key: string,
  data: Dataset,
  history: ChatMsg[],
  question: string,
): Promise<AgentResult> {
  const tools = buildTools(data)
  const registry = new Map(tools.map((t) => [t.declaration.name, t]))

  const contents: Content[] = history.slice(-6).map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }],
  }))
  contents.push({ role: 'user', parts: [{ text: question }] })

  const trace: string[] = []
  for (let step = 0; step < MAX_STEPS; step++) {
    const last = step === MAX_STEPS - 1
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: last ? `${AGENT_SYSTEM}\n\n# ÚLTIMO PASSO\nResponda AGORA com o que já coletou — não chame mais ferramentas.` : AGENT_SYSTEM }] },
        contents,
        ...(last ? {} : { tools: [declarations(tools)] }),
        generationConfig: { temperature: 0.5, maxOutputTokens: 2400 },
      }),
    })
    const json = (await res.json()) as GeminiResp
    if (!res.ok) throw new Error(json.error?.message ?? `Erro ${res.status} no Gemini`)
    const parts = json.candidates?.[0]?.content?.parts ?? []
    if (!parts.length) throw new Error('Resposta vazia do Gemini')

    const calls = parts.filter((p) => p.functionCall)
    if (!calls.length) {
      const text = parts.map((p) => p.text ?? '').join('').trim()
      if (text) return { answer: text, trace }
      throw new Error('Modelo não retornou texto nem chamada de ferramenta')
    }

    contents.push({ role: 'model', parts })
    for (const c of calls) {
      const fc = c.functionCall!
      const args = (fc.args ?? {}) as Record<string, string | number>
      const label = `${fc.name}(${Object.values(args).join(', ')})`
      trace.push(label)
      const tool = registry.get(fc.name)
      let result: string
      try {
        result = tool ? await tool.fn(args) : `Ferramenta "${fc.name}" não existe.`
      } catch (e) {
        result = `Erro na ferramenta: ${e instanceof Error ? e.message : String(e)}`
      }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: fc.name, response: { result } } }],
      })
    }
  }
  throw new Error('Agente excedeu o número de passos sem resposta final')
}
