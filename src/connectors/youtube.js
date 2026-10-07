// Conector real: YouTube Data API v3 (https://developers.google.com/youtube/v3).
// Custos de cota: videos.list = 1 unidade; search.list = 100 unidades. Cota padrão: 10.000/dia.
const API = 'https://www.googleapis.com/youtube/v3';

export const youtube = {
  id: 'youtube',
  label: 'YouTube',
  docs: 'https://developers.google.com/youtube/v3/docs/videos/list',
  requiredEnv: ['YOUTUBE_API_KEY'],
  metrics: ['views', 'likes', 'comments'],

  status(config) {
    if (config.youtubeApiKey) return { state: 'active', note: 'YouTube Data API v3 (chave configurada).' };
    return {
      state: 'needs_credentials',
      note: 'Defina YOUTUBE_API_KEY no arquivo .env (chave gratuita do Google Cloud).',
    };
  },

  async collect(niche, { config, fetchImpl = fetch, now = new Date() }) {
    const cfg = niche.youtube;
    if (!cfg) return null;
    const key = config.youtubeApiKey;
    const region = config.regionCode;

    if (cfg.method === 'chart') {
      const data = await call(fetchImpl, 'videos', {
        part: 'snippet,statistics',
        chart: 'mostPopular',
        regionCode: region,
        videoCategoryId: cfg.categoryId,
        maxResults: 25,
        key,
      });
      return {
        method: `Ranking "mais populares" do YouTube (${region}, categoria ${cfg.categoryId}), até 25 vídeos.`,
        items: (data.items || []).map(toItem),
      };
    }

    // Busca: vídeos publicados nas últimas 48h na categoria, ordenados por visualizações.
    const publishedAfter = new Date(now.getTime() - 48 * 3600e3).toISOString();
    const search = await call(fetchImpl, 'search', {
      part: 'id',
      type: 'video',
      order: 'viewCount',
      regionCode: region,
      relevanceLanguage: 'pt',
      videoCategoryId: cfg.categoryId,
      publishedAfter,
      maxResults: 25,
      key,
    });
    const ids = (search.items || []).map((i) => i.id?.videoId).filter(Boolean);
    if (!ids.length) {
      return { method: searchMethod(region, cfg), items: [] };
    }
    const details = await call(fetchImpl, 'videos', { part: 'snippet,statistics', id: ids.join(','), key });
    const byId = new Map((details.items || []).map((v) => [v.id, v]));
    return {
      method: searchMethod(region, cfg),
      // Mantém a ordem da busca; vídeos removidos entre as chamadas são descartados.
      items: ids.filter((id) => byId.has(id)).map((id) => toItem(byId.get(id))),
    };
  },
};

function searchMethod(region, cfg) {
  return `Busca do YouTube: vídeos publicados nas últimas 48h (${region}, idioma pt, categoria ${cfg.categoryId}), ordenados por visualizações, até 25 vídeos.`;
}

async function call(fetchImpl, resource, params) {
  const url = `${API}/${resource}?${new URLSearchParams(params)}`;
  const res = await fetchImpl(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    throw new Error(`YouTube API ${resource} (${res.status}): ${msg}`);
  }
  return body;
}

// Converte contagem textual da API em número. Campo ausente (ex.: curtidas ocultas,
// comentários desativados) vira null, nunca zero.
export function toCount(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toItem(v) {
  const s = v.snippet || {};
  const st = v.statistics || {};
  const thumbs = s.thumbnails || {};
  return {
    externalId: v.id,
    title: s.title ?? null,
    author: s.channelTitle ?? null,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
    thumbnail: (thumbs.medium || thumbs.high || thumbs.default)?.url ?? null,
    publishedAt: s.publishedAt ?? null,
    metrics: {
      views: toCount(st.viewCount),
      likes: toCount(st.likeCount),
      comments: toCount(st.commentCount),
      shares: null, // a API pública não fornece compartilhamentos
    },
  };
}
