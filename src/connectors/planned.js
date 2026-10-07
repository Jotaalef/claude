// Redes ainda não integradas. Cada entrada registra o que a documentação oficial permite
// e o que falta para ativar. Para implementar uma rede, crie um conector com a mesma
// interface de youtube.js (status + collect) e registre-o em connectors/index.js.
export const planned = [
  {
    id: 'x',
    label: 'X (Twitter)',
    docs: 'https://docs.x.com/x-api/getting-started/pricing',
    requiredEnv: ['X_BEARER_TOKEN'],
    state: 'paid',
    note: 'Viável, porém pago: GET /2/trends/by/woeid custa US$ 0,01 por requisição (plano pay-per-use). Retorna termos em alta por local, não por nicho. Aguardando aprovação de custo.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    docs: 'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search',
    requiredEnv: ['IG_ACCESS_TOKEN', 'IG_BUSINESS_ACCOUNT_ID'],
    state: 'needs_review',
    note: 'Possível via Hashtag Search (conta Business/Creator + recurso "Instagram Public Content Access" aprovado em App Review). Limite de 30 hashtags únicas por 7 dias; sem contagem de visualizações.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    docs: 'https://developers.tiktok.com/products/research-api/',
    requiredEnv: [],
    state: 'unavailable',
    note: 'Sem API oficial para tendências de uso comercial: a Research API é restrita a pesquisa acadêmica/sem fins lucrativos (EUA, EEE, Reino Unido, Suíça, Canadá) e a Display API só lê vídeos do próprio usuário autorizado.',
  },
  {
    id: 'kwai',
    label: 'Kwai',
    docs: 'https://developer-shop.kwai.com/',
    requiredEnv: [],
    state: 'unavailable',
    note: 'Não há API pública oficial de leitura de vídeos ou tendências; as APIs oficiais encontradas são de e-commerce (Kwai Shop) e anúncios.',
  },
].map((p) => ({ ...p, status: () => ({ state: p.state, note: p.note }) }));
