# Vai Passar na Cazé

**Todo jogo que passa na CazéTV, num lugar só.** Um conceito de produto feito para o processo seletivo de AI Engineer da LiveMode.

**Ao vivo: [danielberriel.github.io/vai-passar-na-caze](https://danielberriel.github.io/vai-passar-na-caze/)**

A página mostra a agenda das transmissões gratuitas da CazéTV com chamadas escritas por IA. Ninguém digita nada: a cada 6 horas, um pipeline descobre o que vai passar, confere em duas fontes, escreve as chamadas e publica.

> Projeto conceitual e independente. Não é um site oficial da CazéTV e não tem afiliação com ela.

## Como funciona

```
 futebolnatv.com.br  ── scraping ──┐   quem transmite (canal, dia, hora)
                                   ├──> cruzamento ──> Claude ──> data/jogos.json ──> GitHub Pages
 football-data.org   ──── API ─────┘   o que é jogado (horário UTC, status, escudos)
```

1. **Calendário oficial**: a API da football-data.org entrega jogos, horários, status, placar e escudos ([sources/football-data.mjs](pipeline/sources/football-data.mjs)). Jogos fora do plano grátis (Europa e Conference League) pegam o escudo de um índice semanal com os elencos das ligas cobertas ([crests.mjs](pipeline/crests.mjs)). Em caso de dúvida entre dois clubes, a página mostra as iniciais em vez de arriscar o escudo errado.
2. **Quem transmite**: um scraper lê o guia futebolnatv.com.br ([sources/futebolnatv.mjs](pipeline/sources/futebolnatv.mjs)). Ele visita a página de direitos de transmissão da CazéTV e descobre sozinho quais campeonatos ler, então um contrato novo aparece sem mudar código.
3. **Cruzamento**: as fontes nunca escrevem os times igual ("Bayern de Munique" e "FC Bayern München"; "Estac Troyes" e "ES Troyes AC"). Normalização, aliases, similaridade de Dice e uma janela de ±20 min no horário casam os jogos, com atribuição gulosa um-para-um para que dois jogos simultâneos da mesma liga não se confundam ([match.mjs](pipeline/match.mjs)).
4. **Chamadas com IA**: o Claude (`claude-opus-5-5`) escreve uma chamada e um selo por jogo, na voz da marca, com saída em JSON Schema ([copy.mjs](pipeline/copy.mjs)). O prompt proíbe afirmar fatos da temporada (sequências, tabela, lesões) que o modelo não recebeu.
5. **Publicação**: o GitHub Actions roda tudo, versiona `data/` e publica no GitHub Pages ([workflow](.github/workflows/atualizar-agenda.yml)).

### Decisões de engenharia

- **Degradação graciosa**: sem chave da API, o guia sustenta a agenda. Sem chave da Anthropic, ou se o modelo recusar ou falhar, entram templates. Se nenhuma página do guia responder, o pipeline aborta sem sobrescrever o último `jogos.json` bom.
- **Custo**: uma única requisição ao Claude por execução, só para jogos que ainda não têm chamada. O resto vem do `data/copy-cache.json`.
- **Front-end sem build**: HTML, CSS e JS puros lendo um JSON estático. O status "ao vivo" e a contagem regressiva são calculados no navegador, então a página não depende da frequência do robô.
- **Scraping responsável**: o robots.txt do guia permite a coleta. São poucas páginas por execução, em sequência e com pausa, e a fonte é creditada. Numa versão real, isso seria trocado pelos dados internos da própria LiveMode.

## Rodando localmente

Requer Node 20+.

```bash
npm install
npm test            # testes do parser, do cruzamento e das chamadas
npm run dados       # roda o pipeline e atualiza data/jogos.json
npm run dev         # http://localhost:4173
```

Variáveis de ambiente, todas opcionais. Localmente, `npm run dados` lê um arquivo `.env` na raiz (fora do git):

| Variável | Para quê |
|---|---|
| `FOOTBALL_DATA_TOKEN` | Chave grátis da [football-data.org](https://www.football-data.org/client/register). Traz escudos, status e confirmação dos jogos. |
| `ANTHROPIC_API_KEY` | Chave da [Anthropic](https://console.anthropic.com/). Liga as chamadas escritas pelo Claude. |
| `FOOTBALL_DATA_FIXTURE` | Caminho para uma resposta salva da API, para testar offline. |
| `PIPELINE_OUT_DIR` | Grava os dados em outra pasta em vez de `data/`. |

## Publicando no GitHub Pages

1. Crie um repositório público no GitHub e envie este projeto para a branch `main`.
2. Em **Settings → Secrets and variables → Actions**, crie os secrets `FOOTBALL_DATA_TOKEN` e `ANTHROPIC_API_KEY`.
3. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
4. Em **Actions → Atualizar agenda**, clique em **Run workflow**. Depois disso, ele roda sozinho a cada 6 horas.
5. Num fork, troque a URL do GitHub Pages em `og:url`, `og:image` e `canonical` no [index.html](index.html), e o `repoUrl` em [assets/app.js](assets/app.js).

## Estrutura

```
index.html, assets/        site estático (HTML/CSS/JS puros)
data/jogos.json            snapshot publicado, gerado pelo pipeline
data/copy-cache.json       chamadas já escritas pelo Claude
data/crests.json           índice de escudos (renovado 1x por semana)
pipeline/run.mjs           orquestração
pipeline/sources/          football-data.org (API) e futebolnatv (scraping)
pipeline/match.mjs         cruzamento entre as fontes
pipeline/crests.mjs        escudos por nome para jogos fora da API
pipeline/copy.mjs          chamadas com Claude + templates de fallback
pipeline/test/             testes (node:test)
```

## Créditos

Dados de jogos e escudos: [football-data.org](https://www.football-data.org). Transmissões: [futebolnatv.com.br](https://www.futebolnatv.com.br). Chamadas: Claude, da Anthropic. Construído em parceria com o Claude Code.

---

Feito por **Daniel Berriel** · danielberriel163@gmail.com
