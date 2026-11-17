import { render } from '@testing-library/react';
import { I18nProvider } from '../src/i18n/index.jsx';
import App from '../src/App.jsx';
import { createConnection } from '../src/net/connection.js';

export function createFakeIo() {
  const handlers = new Map();
  const sent = [];
  const replies = {};
  const socket = {
    connected: false,
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    emit(event, payload, ack) {
      sent.push({ event, payload });
      const reply = replies[event];
      if (ack && reply !== undefined) ack(typeof reply === 'function' ? reply(payload) : reply);
    },
    disconnect() {
      socket.connected = false;
    },
  };
  const factory = (url, options) => {
    factory.url = url;
    factory.options = options;
    return socket;
  };
  const fire = (event, payload) => (handlers.get(event) ?? []).forEach((handler) => handler(payload));
  return { factory, socket, fire, sent, replies };
}

export function setup({ lang = 'en', timeoutMs } = {}) {
  const fake = createFakeIo();
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  const connection = createConnection({ url: 'http://server', storage, ioFactory: fake.factory, timeoutMs });
  const view = render(
    <I18nProvider initial={lang} storage={storage}>
      <App connection={connection} />
    </I18nProvider>,
  );
  return { ...fake, connection, storage, view };
}

export const goOnline = (env, playerId = 'g_me') => {
  env.socket.connected = true;
  env.fire('connect');
  env.fire('session', { playerId, token: `${playerId}.sig` });
};

export const lobbyState = (overrides = {}) => ({
  code: 'KQTD',
  hostId: 'g_me',
  phase: 'lobby',
  minPlayers: 6,
  maxPlayers: 12,
  players: [
    { id: 'g_me', name: 'Hosny', isBot: false, connected: true, left: false },
    { id: 'g_sam', name: 'Sam', isBot: false, connected: true, left: false },
    { id: 'bot-1', name: 'Bot 1', isBot: true, connected: false, left: false },
  ],
  ...overrides,
});

const person = (id, name, alive = true, role = null) => ({ id, name, isBot: false, alive, role });

export const gameView = (overrides = {}) => ({
  phase: 'night',
  day: 1,
  deadline: Date.now() + 30000,
  serverNow: Date.now(),
  winner: null,
  me: { id: 'g_me', role: 'citizen', alive: true, awaitingAction: true, nightChoice: null, voteChoice: null },
  players: [
    person('g_me', 'Hosny', true, 'citizen'),
    person('g_a', 'Amir'),
    person('g_b', 'Dana'),
    person('g_c', 'Lina'),
    person('g_d', 'Omar'),
    person('g_e', 'Sara'),
  ],
  report: null,
  accused: null,
  voteCounts: null,
  canRevote: false,
  events: [],
  ...overrides,
});

export const withMe = (patch, rest = {}) => gameView({ me: { ...gameView().me, ...patch }, ...rest });
export { person };
