// Contexto global do Coach: mesmo chat e mesmos links em todo o app.
// A chave da API vem do environment (VITE_GEMINI_API_KEY) — o front não
// expõe nem gerencia credenciais.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Dataset } from '../types'
import { runCoachAgent } from '../lib/agent'
import { fallbackAnswer, type ChatMsg } from '../lib/gemini'
import type { Finding } from '../lib/coach'

const API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? ''

interface CoachCtx {
  msgs: ChatMsg[]
  busy: boolean
  send: (question: string, findings: Finding[]) => void
  reset: () => void
  onOpenMatch: (matchId: string, round: number) => void
}

const Ctx = createContext<CoachCtx | null>(null)

export function useCoach(): CoachCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCoach fora do CoachProvider')
  return ctx
}

export function CoachProvider({
  data,
  onOpenMatch,
  children,
}: {
  data: Dataset
  onOpenMatch: (matchId: string, round: number) => void
  children: ReactNode
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)

  const send = useCallback(
    (question: string, findings: Finding[]) => {
      const q = question.trim()
      if (!q || busy) return
      setMsgs((m) => [...m, { role: 'user', text: q }])
      setBusy(true)
      const history = msgs
      const run = async () => {
        try {
          if (API_KEY) {
            const { answer, trace } = await runCoachAgent(API_KEY, data, history, q)
            const withTrace = trace.length ? `🔍 ${trace.join(' → ')}\n\n${answer}` : answer
            setMsgs((m) => [...m, { role: 'model', text: withTrace }])
          } else {
            setMsgs((m) => [...m, { role: 'model', text: fallbackAnswer(q, findings) }])
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setMsgs((m) => [...m, { role: 'model', text: `⚠️ ${msg}` }])
        } finally {
          setBusy(false)
        }
      }
      void run()
    },
    [busy, data, msgs],
  )

  const reset = useCallback(() => setMsgs([]), [])

  return (
    <Ctx.Provider value={{ msgs, busy, send, reset, onOpenMatch }}>
      {children}
    </Ctx.Provider>
  )
}
