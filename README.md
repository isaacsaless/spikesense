# SpikeSense — Coach IA de VALORANT

Análise pós-partida de VALORANT com **agente de IA coach**: um "tracker" que não só mostra estatísticas, mas **diagnostica padrões e recomenda o que treinar** — para jogadores, times e treinadores.

Construído para o **Hackathon SEMCOMP 2026** (Riot Games + AcadArena).

## O que é

- **Visão Geral**: ranking de jogadores (ACS, K/D, ADR, HS%, KAST, first bloods, clutches) e lista de partidas.
- **Partida**: scoreboard completo com aberturas/trades/clutches por jogador, timeline de rounds (compra, site, plant) e replay round a round (kill feed com arma, posições e economia).
- **Jogador**: tendência de ACS por partida, desempenho por agente, kills por arma, multi-kills e clutches.
- **Time**: matriz de compra ataque×defesa (pistol/eco/force/semi/full), conversão pós-plant, retake, pistolas, anti-ecos perdidos, distribuição de sites, reação a round perdido.
- **🤖 Coach IA**: relatório priorizado (fraquezas e forças com evidência numérica + recomendação + treino sugerido) e **chat conversacional** com o agente que responde perguntas livres usando os dados reais como contexto.

## Arquitetura

```
data/**/*.json          ← base oficial do Hackathon (Drive da organização)
scripts/build_data.py   ← compacta os JSONs → public/data.json (1 comando)
src/lib/metrics.ts      ← motor de análise: KAST, trades (janela 5s), clutches 1vX,
                           first bloods por lado, economia por round, tempo de execução
                           (plants <25s / >60s), valorização por compra, util/round, sites
src/lib/coach.ts        ← motor determinístico de insights (18+ regras com evidência)
src/lib/tools.ts        ← ferramentas de consulta do agente sobre a base local
src/lib/agent.ts        ← loop de agente com tool calling no padrão do harness pi
                           (earendil-works/pi): prompt → functionCall → executa local
                           → functionResponse → continua até a resposta final
src/lib/gemini.ts       ← fallback offline do chat (insights determinísticos)
src/views/*             ← dashboard, partida, jogador, time, coach (React + Recharts)
```

### Agente Coach (o diferencial)

O coach não recebe um blob fixo de contexto: ele tem **7 ferramentas** (`buscar_jogador`,
`buscar_time`, `listar_partidas`, `detalhar_partida`, `comparar_jogadores`, `ranking`,
`estatisticas_mapa`) e decide sozinho o que consultar a cada pergunta — encadeando
chamadas (ex.: ranking → comparação → perfis) até fundamentar a resposta com números
reais. O trace das ferramentas usadas aparece no chat (🔍), e o prompt segue um framework
de coach profissional: posicionamento, rotação/tempo, valorização econômica, aberturas
por lado, utilitários, clutches — sempre com diagnóstico → leitura dos dados → plano
com drills → próximo passo. Sem chave de API, o chat cai para o modo offline
(motor determinístico).

## Conformidade com as regras do desafio

- ✅ **Dados exclusivamente dos JSONs oficiais** (classificatórias + Rush Series + UNIVAVÁ). Zero APIs externas de partidas, zero scraping.
- ✅ O agente de IA **interpreta** a base local; não complementa dados de fora (o prompt injeta apenas as estatísticas calculadas localmente).
- ✅ Metadados estáticos de exibição (nome de arma/agente/mapa por UUID) são embutidos no build — não são dados de partida.
- ✅ Análise **pós-partada**; nenhuma interação com o cliente do jogo ou serviços da Riot.

## Rodando

```bash
npm install
python scripts/build_data.py   # gera public/data.json a partir de data/
npm run dev                    # http://localhost:5173
```

Build de produção: `npm run build` → pasta `dist/` (deploy arrastando em [Netlify Drop](https://app.netlify.com/drop), sem backend).

## Chat com IA (opcional)

O relatório do coach funciona **100% offline** (motor determinístico). Para perguntas livres, o chat usa a API do Google Gemini com **sua própria chave**:

1. Crie uma chave gratuita em [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. No app: aba **🤖 Coach IA → ⚙️ chave** → cole e pronto (fica no `localStorage` do navegador)

Sem chave, o chat responde em modo offline com os insights do relatório.

## Squad

_Hackathon SEMCOMP 2026 — equipe._

## Busca semântica (Ollama + VODs)

- `scripts/build_round_index.py` gera `public/rounds-index.json`: 1 narrativa por round
  (mapa, compra, site, plant, kill feed, clutch, tipo de round) + embeddings via
  **Ollama local** (`nomic-embed-text`, 768-dim). Sem Ollama → índice lexical.
- Aba **🔍 Busca**: consulta em linguagem natural → rounds ranqueados por similaridade
  de cosseno (embed da query via Ollama em runtime) — clique abre o round exato.
- Também consulta o serviço local de **VODs** (`127.0.0.1:8765`) com timestamps do cast.
- O agente ganhou as tools `buscar_rounds` (semântica sobre a base) e `buscar_vods`.
- Proxies de dev (`/ollama`, `/vodapi`) no `vite.config.ts` evitam CORS.
