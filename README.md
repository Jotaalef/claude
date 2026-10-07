# Radar de Trends

Aplicativo web em português que reúne conteúdos em crescimento nas redes sociais, organizados por nicho
(humor, música e entretenimento). Mostra links originais, as métricas que cada fonte fornece, o horário da última
coleta, favoritos e o histórico entre coletas, usado para calcular o crescimento.

**Versão atual:** fonte real = **YouTube Data API v3**. As demais redes estão mapeadas, mas não ativadas (motivos abaixo).

## Como testar

Pré-requisito: Node.js 22.5 ou superior. Não há dependências para instalar.

```bash
npm start      # sobe em http://localhost:3000 e já faz a primeira coleta
npm test       # roda os testes automáticos
npm run demo   # força o modo demonstrativo, mesmo com chave configurada
```

Sem chave, o app abre em **modo demonstrativo**: uma faixa amarela avisa no topo, todo item tem o selo
`DEMONSTRATIVO`, o título começa com `[DEMO]` e não há link. Nada disso é conteúdo real.

### Ativar dados reais do YouTube (gratuito)

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **YouTube Data API v3**.
2. Em *Credenciais*, crie uma **chave de API** (de preferência restrita à YouTube Data API).
3. Copie `.env.example` para `.env` e preencha `YOUTUBE_API_KEY=...`.
4. Rode `npm start` de novo. O terminal mostra quantos vídeos foram coletados em cada nicho.

### O que conferir na tela

- Abas **Humor / Música / Entretenimento / Favoritos**.
- **Coletar agora**: faz uma coleta nova. A partir da 2ª coleta aparece o crescimento (visualizações/hora).
- **Ordenar por** crescimento ou visualizações totais e **filtrar por rede**.
- **☆ Favoritar** e **Histórico** (tabela e mini gráfico com cada coleta do item).
- Métricas que a fonte não fornece aparecem como *não disponível*, nunca como 0.
- A caixa "Sobre este ranking" explica que as posições valem só para a **amostra monitorada** e mostra de onde ela veio.
- No rodapé, **Status das redes** mostra por que cada rede está ou não ativa.

## Viabilidade das integrações (pesquisa em documentação oficial, out/2026)

| Rede | Situação | O que dá para acessar | Credenciais | Custo conhecido | Limitações |
|---|---|---|---|---|---|
| **YouTube** | ✅ **Implementada** | Título, canal, link, miniatura, data, visualizações, curtidas e comentários (quando públicos) | Chave de API do Google Cloud | Gratuito na cota padrão (10.000 unidades/dia) | `videos.list` custa 1 unidade e `search.list` custa 100. Desde 21/07/2025 o ranking `mostPopular` só reflete os charts de Música, Filmes e Games. Estatísticas de terceiros não podem ficar guardadas mais de 30 dias. |
| **X** | 💲 Viável, **paga** | Termos em alta por localidade (`GET /2/trends/by/woeid`), não por nicho | Bearer token do app no X Developer | Pay-per-use: US$ 0,010 por requisição de trends. Não existe mais plano gratuito equivalente; o plano Basic legado foi migrado para pay-per-use | 75 requisições a cada 15 min. Classificar por nicho exigiria buscar posts por palavra-chave (custo por post lido). |
| **Instagram** | ⚠️ Possível, depende da Meta | Hashtag Search: mídias populares/recentes de uma hashtag (legenda, curtidas, comentários, link, tipo) | Conta Business/Creator ligada a uma Página do Facebook + app Meta com o recurso **Instagram Public Content Access** aprovado em App Review | Sem cobrança por chamada na documentação | Máx. 30 hashtags únicas por 7 dias; só mídia das últimas 24h em `recent_media`; **sem contagem de visualizações** e sem nome de usuário. |
| **TikTok** | ❌ Sem via oficial para este uso | Research API (vídeos públicos, métricas) só para pesquisa acadêmica/sem fins lucrativos em EUA, EEE, Reino Unido, Suíça e Canadá. Display API lê apenas vídeos do próprio usuário que autorizou | — | — | Não há API oficial de tendências para uso comercial no Brasil. |
| **Kwai** | ❌ Sem API pública de leitura | APIs oficiais encontradas são de e-commerce (Kwai Shop) e de anúncios/relatórios | — | — | Só serviços de terceiros (scraping), que não são oficiais. |

### Como cada nicho é coletado no YouTube

| Nicho | Método | Custo por coleta |
|---|---|---|
| Música | Ranking `mostPopular` (região BR, categoria 10) | 1 unidade |
| Humor | Busca: vídeos das últimas 48h, categoria 23, ordenados por visualizações + estatísticas | 101 unidades |
| Entretenimento | Busca: vídeos das últimas 48h, categoria 24, ordenados por visualizações + estatísticas | 101 unidades |

Com uma coleta por hora (padrão), o consumo é de cerca de 4.900 unidades/dia, abaixo da cota gratuita de 10.000.

### Opções pagas (nada foi contratado)

| Opção | O que acrescenta | Custo estimado |
|---|---|---|
| X API pay-per-use (trends por WOEID do Brasil e de capitais) | Assuntos em alta no X | US$ 0,01 por requisição. Ex.: 1 local a cada hora ≈ 720 req/mês ≈ **US$ 7,20/mês**; 5 locais ≈ US$ 36/mês |
| Aumento de cota do YouTube | Mais coletas ou mais nichos | Gratuito, mas exige auditoria de conformidade do Google |
| Provedores terceiros de dados (TikTok/Kwai/Instagram) | Cobertura das redes sem API oficial | Variável; não oficiais, com risco de violar termos das plataformas. Recomendo avaliar caso a caso antes de contratar |

## Estrutura

```
server.js                 servidor HTTP e agendador de coletas
src/config.js             variáveis de ambiente (.env)
src/niches.js             nichos e como cada rede os representa
src/connectors/youtube.js conector real (YouTube Data API v3)
src/connectors/demo.js    fonte demonstrativa (marcada como is_demo)
src/connectors/planned.js X, Instagram, TikTok e Kwai: status e requisitos
src/collector.js          executa coletas e registra erros por nicho
src/store.js              SQLite: itens, coletas, histórico, favoritos e cálculo de crescimento
public/                   interface (HTML, CSS e JS, sem dependências)
test/                     testes automáticos (node:test)
```

### Adicionar uma rede

1. Crie `src/connectors/<rede>.js` exportando `{ id, label, docs, requiredEnv, status(config), collect(niche, ctx) }`.
   `collect` devolve `{ method, items }`, em que cada item tem `externalId, title, author, url, thumbnail, publishedAt`
   e `metrics: { views, likes, comments, shares }`. Use `null` para a métrica que a rede não fornece.
2. Registre o conector em `LIVE_CONNECTORS` (`src/connectors/index.js`) e remova a entrada de `planned.js`.
3. Em `src/niches.js`, inclua a configuração da rede em cada nicho (hashtags, categorias etc.).

### Como o crescimento é calculado

Cada coleta grava uma "foto" das métricas de cada item. O crescimento é a diferença de visualizações entre a coleta
atual e a anterior em que o item apareceu, dividida pelas horas entre elas. Na primeira aparição o app mostra
"aguardando 2ª coleta". Se a fonte não fornece visualizações, mostra "não disponível". Dados com mais de 30 dias são
apagados automaticamente, como exige a política do YouTube.

## Fontes oficiais consultadas

- YouTube: [videos.list](https://developers.google.com/youtube/v3/docs/videos/list), [search.list](https://developers.google.com/youtube/v3/docs/search/list), [custos de cota](https://developers.google.com/youtube/v3/determine_quota_cost), [visão geral e cota](https://developers.google.com/youtube/v3/getting-started), [histórico de revisões (mudança do mostPopular)](https://developers.google.com/youtube/v3/revision_history), [políticas de desenvolvedor](https://developers.google.com/youtube/terms/developer-policies)
- X: [preços](https://docs.x.com/x-api/getting-started/pricing), [limites de requisição](https://docs.x.com/x-api/fundamentals/rate-limits), [migração do plano Basic](https://devcommunity.x.com/t/important-update-legacy-x-api-basic-plans-are-moving-to-pay-per-use-ppu/266305)
- Instagram: [Hashtag Search](https://developers.facebook.com/docs/instagram-api/hashtag-search), [recent_media](https://developers.facebook.com/docs/instagram-api/reference/hashtag/recent-media), [visão geral da plataforma](https://developers.facebook.com/docs/instagram-platform/overview/)
- TikTok: [Research API](https://developers.tiktok.com/products/research-api/), [Display API](https://developers.tiktok.com/docs/en/display-api-overview), [escopos](https://developers.tiktok.com/docs/en/tiktok-api-scopes)
- Kwai: [Kwai Shop OpenAPI](https://developer-shop.kwai.com/)
