// Fonte DEMONSTRATIVA: gera dados fictícios para testar a interface sem credenciais.
// Todo item gerado aqui é gravado com is_demo = 1 e exibido com selo "DEMONSTRATIVO".
const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'kwai', 'x'];

const TOPICS = {
  humor: ['Esquete de escritório', 'Paródia de novela', 'Pegadinha no mercado', 'Stand-up curto', 'Meme do dia', 'Dublagem engraçada'],
  musica: ['Funk lançamento', 'Sertanejo ao vivo', 'Trap nacional', 'Pagode acústico', 'Desafio de dança', 'Cover viral'],
  entretenimento: ['Reality show: melhores momentos', 'Trailer de série', 'Reação de influenciador', 'Bastidores de novela', 'Fofoca da semana', 'Podcast cortes'],
};

// Gerador determinístico (mesma entrada → mesmo número) para que os itens sejam estáveis entre coletas.
function rand(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

export const demo = {
  id: 'demo',
  label: 'Dados demonstrativos',
  status: () => ({ state: 'demo', note: 'Dados fictícios gerados localmente.' }),

  async collect(niche, { now = new Date() }) {
    const topics = TOPICS[niche.id] || ['Conteúdo'];
    const hours = now.getTime() / 3600e3;
    const items = [];
    for (const platform of PLATFORMS) {
      topics.slice(0, 4).forEach((topic, i) => {
        const seed = `${niche.id}:${platform}:${i}`;
        const r = rand(seed);
        const base = Math.round(5_000 + r * 500_000);
        const perHour = Math.round(200 + rand(seed + 'g') * 20_000);
        // Crescimento varia um pouco a cada hora para o ranking mudar entre coletas.
        const jitter = 0.7 + rand(seed + Math.floor(hours)) * 0.6;
        const views = Math.round(base + perHour * jitter * (hours % 1000));
        items.push({
          platform,
          externalId: `demo-${seed}`,
          title: `[DEMO] ${topic} #${i + 1}`,
          author: `@criador_ficticio_${i + 1}`,
          url: null,
          thumbnail: null,
          publishedAt: new Date(now.getTime() - (2 + r * 40) * 3600e3).toISOString(),
          metrics: {
            views,
            likes: Math.round(views * (0.03 + r * 0.05)),
            // Simula métricas que algumas redes não fornecem: devem aparecer como "não disponível".
            comments: platform === 'kwai' ? null : Math.round(views * 0.002),
            shares: platform === 'tiktok' ? Math.round(views * 0.004) : null,
          },
        });
      });
    }
    return {
      method: 'DADOS DEMONSTRATIVOS: 4 itens fictícios por rede, gerados localmente. Não representam conteúdo real.',
      items,
    };
  },
};
