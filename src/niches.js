// Nichos monitorados e como cada rede os representa.
// Para adicionar um nicho, inclua uma entrada aqui com a configuração de cada rede.
export const NICHES = [
  {
    id: 'humor',
    label: 'Humor',
    youtube: {
      categoryId: '23', // Comedy
      // Desde 21/07/2025 o chart mostPopular só cobre Música, Filmes e Games,
      // então humor usa busca por vídeos recentes ordenados por visualizações.
      method: 'search',
    },
  },
  {
    id: 'musica',
    label: 'Música',
    youtube: { categoryId: '10', method: 'chart' }, // Music
  },
  {
    id: 'entretenimento',
    label: 'Entretenimento',
    youtube: { categoryId: '24', method: 'search' }, // Entertainment
  },
];

export const nicheById = (id) => NICHES.find((n) => n.id === id);
