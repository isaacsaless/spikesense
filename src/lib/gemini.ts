// Agente conversacional — Gemini com chave do próprio usuário (BYO-key).
// A chamada sai do navegador (CORS liberado pela API do Gemini).
// Se não houver chave, o chat responde com os insights determinísticos.

const MODEL = 'gemini-3.8-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export interface ChatMsg { role: 'user' | 'model'; text: string }

const SYSTEM = `Você é o SpikeSense, coach técnico de VALORANT de elite (nível VCT brasileiro), especialista em desenvolvimento de jogadores e times universitários.
Framework de análise (use quando relevante):
• POSICIONAMENTO: mortes isoladas vs tradadas (conexão), first deaths recorrentes (over-peek), ângulos expostos, profundidade defensiva.
• ROTAÇÃO E TEMPO: plants rápidos (<25s) = execução direta; plants tardios (>60s) = default lento/rotação; leitura de retake (em bloco vs picadas).
• VALORIZAÇÃO E ECONOMIA: ADR por tipo de compra (eco/force/full), custo por kill, quando force compra vale, disciplina de anti-eco.
• DUELOS DE ABERTURA: FB/FD por lado (ataque/defesa), entry vs support, punição de mira.
• UTILITÁRIOS: casts por round (uso suficiente?), agentes com pouca utilização, sincronia de execução.
• CLUTCH: protocolo de tempo, isolamento de duelos, matemática do round.
Regras:
- Responda em português do Brasil, direto e acionável, como um coach de verdade falando com seu time.
- Use EXCLUSIVAMENTE os dados do CONTEXTO fornecido. Nunca invente estatísticas — cite números ("HS 17%", "pós-plant 48%").
- Estruture: diagnóstico (1-2 frases) → recomendações (bullets) → treino sugerido (com tempo/duração).
- Máximo ~220 palavras. Sem saudações repetidas.`

interface GeminiResp {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}

export async function askCoach(
  key: string,
  history: ChatMsg[],
  question: string,
  context: string,
  findings: string,
): Promise<string> {
  const convo = history
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'Jogador' : 'Coach'}: ${h.text}`)
    .join('\n')
  const prompt = [
    `CONTEXTO (dados oficiais do campeonato):\n${context}`,
    findings ? `DIAGNÓSTICO DO MOTOR ESTATÍSTICO:\n${findings}` : '',
    convo ? `HISTÓRICO:\n${convo}` : '',
    `PERGUNTA: ${question}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
    }),
  })
  const data = (await res.json()) as GeminiResp
  if (!res.ok) throw new Error(data.error?.message ?? `Erro ${res.status} no Gemini`)
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()
  if (!text) throw new Error('Resposta vazia do Gemini')
  return text
}

/** Fallback sem chave: responde com o insight determinístico mais relevante. */
export function fallbackAnswer(question: string, findings: { title: string; evidence: string; recommendation: string; drill?: string; kind: string; tag: string }[]): string {
  const q = question.toLowerCase()
  const kw: Record<string, string[]> = {
    mira: ['mira'], hs: ['mira'], headshot: ['mira'], aim: ['mira'],
    econom: ['economia'], eco: ['economia'], compra: ['economia'], cravo: ['economia'],
    abert: ['abertura'], entry: ['abertura'], first: ['abertura'],
    clutch: ['clutch'], '1v2': ['clutch'],
    agente: ['agentes'], comp: ['agentes'],
    mapa: ['mapas'], veto: ['mapas'],
    plant: ['pós-plant'], retake: ['retake'], defensa: ['retake'],
    pisto: ['pistolas'],
    trade: ['trade'],
    mental: ['mentalidade'], tilt: ['mentalidade'],
  }
  for (const [needle, tags] of Object.entries(kw)) {
    if (q.includes(needle)) {
      const hit = findings.find((x) => tags.some((t) => x.title.toLowerCase().includes(t) || x.tag.toLowerCase().includes(t)))
      if (hit)
        return `📊 ${hit.title}\n\n${hit.evidence}\n\n✅ ${hit.recommendation}${hit.drill ? `\n\n🎯 ${hit.drill}` : ''}`
    }
  }
  const top = findings.find((x) => x.kind === 'fraqueza') ?? findings[0]
  if (top)
    return `📊 Maior ponto de atenção agora: ${top.title}\n\n${top.evidence}\n\n✅ ${top.recommendation}`
  return 'Selecione um jogador ou time com partidas suficientes para o coach analisar.'
}
