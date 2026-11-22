import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConnection, defaultServerUrl } from '../src/net/connection.js';
import { createFakeIo, lobbyState } from './helpers.jsx';

function make(options = {}) {
  const fake = createFakeIo();
  const memory = new Map(options.stored ? [['mafia.token', options.stored]] : []);
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const connection = createConnection({ url: 'http://server', storage, ioFactory: fake.factory, timeoutMs: options.timeoutMs ?? 50 });
  connection.connect();
  return { ...fake, connection, memory };
}

describe('connection store', () => {
  it('connects once and tracks status', () => {
    const env = make();
    env.connection.connect();
    expect(env.connection.getState().status).toBe('connecting');
    env.socket.connected = true;
    env.fire('connect');
    expect(env.connection.getState().status).toBe('connected');
    expect(env.connection.getState().everConnected).toBe(true);
    env.fire('disconnect');
    expect(env.connection.getState().status).toBe('connecting');
  });

  it('sends the stored token and keeps a new one from the server', () => {
    const env = make({ stored: 'g_old.sig' });
    const auth = vi.fn();
    env.factory.options.auth(auth);
    expect(auth).toHaveBeenCalledWith({ token: 'g_old.sig' });
    env.fire('session', { playerId: 'g_new', token: 'g_new.sig' });
    expect(env.memory.get('mafia.token')).toBe('g_new.sig');
    expect(env.connection.getState().playerId).toBe('g_new');
    const again = vi.fn();
    env.factory.options.auth(again);
    expect(again).toHaveBeenCalledWith({ token: 'g_new.sig' });
  });

  it('stores room state and drops the game view when back in the lobby', () => {
    const env = make();
    env.fire('room:state', lobbyState({ phase: 'playing' }));
    env.fire('game:view', { phase: 'night', serverNow: Date.now() + 5000 });
    expect(env.connection.getState().view.phase).toBe('night');
    expect(env.connection.getState().clockOffset).toBeGreaterThan(4000);
    env.fire('room:state', lobbyState());
    expect(env.connection.getState().view).toBeNull();
  });

  it('keeps chat history and caps new messages', () => {
    const env = make();
    env.fire('chat:history', [{ id: 1, text: 'a' }]);
    for (let i = 2; i < 300; i++) env.fire('chat:message', { id: i, text: 'x' });
    const { chat } = env.connection.getState();
    expect(chat.length).toBe(200);
    expect(chat[chat.length - 1].id).toBe(299);
  });

  it('clears the room and sets a notice when kicked or closed', () => {
    const env = make();
    env.fire('room:state', lobbyState());
    env.fire('room:kicked');
    expect(env.connection.getState().room).toBeNull();
    expect(env.connection.getState().notice).toBe('kicked');
    env.connection.dismissNotice();
    expect(env.connection.getState().notice).toBeNull();
    env.fire('room:state', lobbyState());
    env.fire('room:closed');
    expect(env.connection.getState().notice).toBe('closed');
  });

  it('answers requests, reports offline and times out', async () => {
    const env = make();
    expect(await env.connection.request('room:create', {})).toEqual({ error: 'OFFLINE' });
    env.socket.connected = true;
    env.replies['room:create'] = { ok: true, code: 'ABCD' };
    expect(await env.connection.request('room:create', { name: 'x' })).toEqual({ ok: true, code: 'ABCD' });
    expect(env.sent.at(-1)).toEqual({ event: 'room:create', payload: { name: 'x' } });
    delete env.replies['room:create'];
    expect(await env.connection.request('room:create', {})).toEqual({ error: 'TIMEOUT' });
  });

  it('forgets the room after a successful leave', async () => {
    const env = make();
    env.socket.connected = true;
    env.fire('room:state', lobbyState());
    env.replies['room:leave'] = { ok: true };
    await env.connection.request('room:leave', {});
    expect(env.connection.getState().room).toBeNull();
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const env = make();
    const listener = vi.fn();
    const stop = env.connection.subscribe(listener);
    env.fire('session', { playerId: 'a', token: 'a.s' });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    env.fire('session', { playerId: 'b', token: 'b.s' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('server address', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the page address in production', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SERVER_URL', '');
    expect(defaultServerUrl()).toBe(window.location.origin);
  });

  it('uses port 3000 on the same host while developing', () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_SERVER_URL', '');
    expect(defaultServerUrl()).toBe(`${window.location.protocol}//${window.location.hostname}:3000`);
  });

  it('prefers an explicit server address', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_SERVER_URL', 'https://example.test');
    expect(defaultServerUrl()).toBe('https://example.test');
  });
});
