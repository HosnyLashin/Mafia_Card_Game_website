import { io } from 'socket.io-client';

const TOKEN_KEY = 'mafia.token';
const CHAT_LIMIT = 200;

const initialState = {
  status: 'connecting',
  everConnected: false,
  playerId: null,
  room: null,
  view: null,
  chat: [],
  clockOffset: 0,
  notice: null,
};

export function createConnection({ url, storage, ioFactory = io, timeoutMs = 8000 }) {
  let state = { ...initialState };
  let socket = null;
  let memoryToken;
  const listeners = new Set();

  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const readToken = () => memoryToken ?? storage?.getItem(TOKEN_KEY) ?? undefined;
  const clearRoom = (notice = null) => set({ room: null, view: null, chat: [], notice });

  function connect() {
    if (socket) return;
    socket = ioFactory(url, {
      auth: (callback) => callback({ token: readToken() }),
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => set({ status: 'connected', everConnected: true }));
    socket.on('disconnect', () => set({ status: 'connecting' }));
    socket.on('connect_error', () => set({ status: 'connecting' }));

    socket.on('session', ({ playerId, token }) => {
      memoryToken = token;
      storage?.setItem(TOKEN_KEY, token);
      set({ playerId });
    });

    socket.on('room:state', (room) => {
      set({ room, view: room.phase === 'lobby' ? null : state.view });
    });

    socket.on('game:view', (view) => {
      const offset = typeof view.serverNow === 'number' ? view.serverNow - Date.now() : state.clockOffset;
      set({ view, clockOffset: offset });
    });

    socket.on('chat:history', (chat) => set({ chat: Array.isArray(chat) ? chat : [] }));
    socket.on('chat:message', (message) => set({ chat: [...state.chat, message].slice(-CHAT_LIMIT) }));
    socket.on('room:closed', () => clearRoom('closed'));
    socket.on('room:kicked', () => clearRoom('kicked'));
  }

  function request(event, payload = {}) {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) {
        resolve({ error: 'OFFLINE' });
        return;
      }
      let finished = false;
      const timer = setTimeout(() => {
        finished = true;
        resolve({ error: 'TIMEOUT' });
      }, timeoutMs);
      socket.emit(event, payload, (result) => {
        if (finished) return;
        clearTimeout(timer);
        const answer = result ?? { error: 'SERVER_ERROR' };
        if (event === 'room:leave' && answer.ok) clearRoom();
        resolve(answer);
      });
    });
  }

  return {
    connect,
    disconnect() {
      socket?.disconnect();
      socket = null;
    },
    request,
    dismissNotice: () => set({ notice: null }),
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function defaultServerUrl() {
  const configured = import.meta.env?.VITE_SERVER_URL;
  if (configured) return configured;
  if (import.meta.env?.PROD) return window.location.origin;
  return `${window.location.protocol}//${window.location.hostname}:3000`;
}
