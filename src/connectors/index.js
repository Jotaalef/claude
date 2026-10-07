import { youtube } from './youtube.js';
import { demo } from './demo.js';
import { planned } from './planned.js';

// Conectores com coleta implementada.
export const LIVE_CONNECTORS = [youtube];
export { demo, planned };

// Todas as redes desejadas, para o painel de status.
export const ALL_PLATFORMS = [youtube, ...planned];
