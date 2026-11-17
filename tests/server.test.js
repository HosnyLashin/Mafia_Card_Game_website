import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { createServer } from '../server.js';

const FAST = { seconds: { night: 0.6, report: 0.1, discussion: 0.8, vote: 0.6, defense: 0.4, revote: 0.3 } };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = condition();
    if (value) return value;
    await sleep(20);
  }
  throw new Error('condition not met in time');
}

async function withServer(options, run) {
  const server = createServer({ secret: 'test-secret', gameConfig: FAST, graceMs: 150, roomTtlMs: 3000, ...options });
  const port = await server.listen(0);
  const clients = [];
  const connect = async (token) => {
    const client = await connectClient(port, token);
    clients.push(client);
    return client;
  };
  try {
    await run({ server, port, connect });
  } finally {
    clients.forEach((c) => c.disconnect());
    await server.close();
  }
}

function connectClient(port, token) {
  return new Promise((resolve) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    socket.log = [];
    socket.onAny((event, payload) => socket.log.push({ event, payload }));
    socket.once('session', (session) => {
      socket.playerId = session.playerId;
      socket.token = session.token;
      resolve(socket);
    });
  });
}

const ask = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

const latest = (socket, event) => {
  const entries = socket.log.filter((entry) => entry.event === event);
  return entries.length ? entries[entries.length - 1].payload : null;
};

const view = (socket) => latest(socket, 'game:view');
const roomState = (socket) => latest(socket, 'room:state');

async function fillRoom(connect, count) {
  const host = await connect();
  const created = await ask(host, 'room:create', { name: 'Host' });
  const players = [host];
  for (let i = 1; i < count; i++) {
    const guest = await connect();
    const joined = await ask(guest, 'room:join', { code: created.code, name: `Player ${i}` });
    assert.equal(joined.ok, true);
    players.push(guest);
  }
  return { code: created.code, players };
}

function autoplay(clients) {
  const done = new Set();
  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      for (const client of clients) {
        const current = view(client);
        if (!current || !current.me.awaitingAction) continue;
        const key = `${client.playerId}:${current.phase}:${current.day}`;
        if (done.has(key)) continue;
        done.add(key);
        if (current.phase === 'revote') ask(client, 'game:action', { action: { type: 'revote', choice: 'keep' } });
        else ask(client, 'game:action', { action: { type: current.phase === 'night' ? 'night' : 'vote', target: null } });
      }
      await sleep(25);
    }
  };
  loop();
  return () => {
    stopped = true;
  };
}

test('guests receive a session and can resume it with the token', async () => {
  await withServer({}, async ({ connect }) => {
    const first = await connect();
    assert.match(first.playerId, /^g_/);
    const again = await connect(first.token);
    assert.equal(again.playerId, first.playerId);
    const tampered = await connect(`${first.token.slice(0, -2)}xx`);
    assert.notEqual(tampered.playerId, first.playerId);
    const garbage = await connect('not-a-token');
    assert.match(garbage.playerId, /^g_/);
  });
});

test('health endpoint answers', async () => {
  await withServer({}, async ({ port }) => {
    const response = await fetch(`http://localhost:${port}/health`);
    assert.deepEqual(await response.json(), { status: 'UP' });
  });
});

test('lobby create, join and validation', async () => {
  await withServer({}, async ({ connect }) => {
    const host = await connect();
    assert.deepEqual(await ask(host, 'room:create', null), { error: 'INVALID_NAME' });
    assert.deepEqual(await ask(host, 'room:create', { name: '   ' }), { error: 'INVALID_NAME' });
    const created = await ask(host, 'room:create', { name: 'Hosny' });
    assert.match(created.code, /^[A-Z]{4}$/);
    assert.deepEqual(await ask(host, 'room:create', { name: 'Again' }), { error: 'ALREADY_IN_ROOM' });

    const guest = await connect();
    assert.deepEqual(await ask(guest, 'room:join', { code: 'ZZZZ', name: 'Sam' }), { error: 'ROOM_NOT_FOUND' });
    assert.deepEqual(await ask(guest, 'room:join', { code: 123, name: 'Sam' }), { error: 'ROOM_NOT_FOUND' });
    assert.deepEqual(await ask(guest, 'room:join', { code: created.code, name: 'hosny' }), { error: 'NAME_TAKEN' });
    assert.deepEqual(await ask(guest, 'room:join', { code: created.code, name: '' }), { error: 'INVALID_NAME' });
    const joined = await ask(guest, 'room:join', { code: created.code.toLowerCase(), name: 'اسم' });
    assert.equal(joined.ok, true);

    await until(() => roomState(host)?.players.length === 2);
    assert.equal(roomState(host).hostId, host.playerId);
    assert.equal(roomState(guest).players.find((p) => p.id === guest.playerId).name, 'اسم');
  });
});

test('only the host can start or kick, and kicked players are removed', async () => {
  await withServer({}, async ({ connect }) => {
    const { players } = await fillRoom(connect, 3);
    const [host, a, b] = players;
    assert.deepEqual(await ask(a, 'room:start', {}), { error: 'NOT_HOST' });
    assert.deepEqual(await ask(a, 'room:kick', { playerId: b.playerId }), { error: 'NOT_HOST' });
    assert.deepEqual(await ask(host, 'room:kick', { playerId: host.playerId }), { error: 'INVALID_TARGET' });
    assert.equal((await ask(host, 'room:kick', { playerId: b.playerId })).ok, true);
    await until(() => roomState(host).players.length === 2);
    await until(() => b.log.some((e) => e.event === 'room:kicked'));
    assert.deepEqual(await ask(b, 'game:action', { action: {} }), { error: 'NOT_PLAYING' });
  });
});

test('starting early needs bots, and bots fill the missing seats', async () => {
  await withServer({}, async ({ connect }) => {
    const { players, code } = await fillRoom(connect, 2);
    const [host, guest] = players;
    assert.deepEqual(await ask(host, 'room:start', {}), { error: 'NOT_ENOUGH_PLAYERS', missing: 4 });
    assert.equal((await ask(host, 'room:start', { fillWithBots: true })).ok, true);

    await until(() => view(host) && view(guest));
    const state = roomState(host);
    assert.equal(state.players.length, 6);
    assert.equal(state.players.filter((p) => p.isBot).length, 4);
    assert.equal(state.phase, 'playing');

    const late = await connect();
    assert.deepEqual(await ask(late, 'room:join', { code, name: 'Late' }), { error: 'GAME_STARTED' });

    const stop = autoplay([host, guest]);
    await until(() => view(host).phase !== 'night' || view(host).day > 1);
    stop();
    assert.ok(view(host).events.length > 0);
  });
});

test('players only ever receive their own secrets', async () => {
  await withServer({}, async ({ connect }) => {
    const { players } = await fillRoom(connect, 6);
    assert.equal((await ask(players[0], 'room:start', {})).ok, true);
    await until(() => players.every((p) => view(p)));

    assert.ok(players.every((p) => typeof view(p).serverNow === 'number'));
    const roles = players.map((p) => view(p).me.role);
    assert.equal(roles.filter((r) => r === 'mafia').length, 1);
    assert.equal(roles.filter((r) => r === 'doctor').length, 1);
    assert.equal(roles.filter((r) => r === 'police').length, 1);

    const stop = autoplay(players);
    await until(() => players.every((p) => view(p)?.phase === 'ended'), 20000);
    stop();

    for (const player of players) {
      for (const { event, payload } of player.log) {
        if (event !== 'game:view' || payload.phase === 'ended') continue;
        if (!payload.me.alive || payload.me.role === 'mafia') continue;
        const others = payload.players.filter((p) => p.alive && p.id !== payload.me.id);
        assert.ok(others.every((p) => p.role === null));
        assert.ok(!JSON.stringify(payload).includes('nightActions'));
      }
      const final = view(player);
      assert.equal(final.winner, 'mafia');
      assert.ok(final.players.every((p) => p.role !== null));
    }
  });
});

test('chat is gated by phase and by life, and a night kill reveals the victim role', async () => {
  await withServer({}, async ({ connect }) => {
    const { players } = await fillRoom(connect, 6);
    await ask(players[0], 'room:start', {});
    await until(() => players.every((p) => view(p)));

    assert.deepEqual(await ask(players[0], 'chat:send', { text: 'hello' }), { error: 'CHAT_CLOSED' });

    const mafia = players.find((p) => view(p).me.role === 'mafia');
    const victim = players.find((p) => view(p).me.role === 'citizen');
    await ask(mafia, 'game:action', { action: { type: 'night', target: victim.playerId } });
    for (const p of players.filter((x) => x !== mafia)) {
      await ask(p, 'game:action', { action: { type: 'night', target: null } });
    }

    await until(() => view(players[0]).phase === 'report');
    assert.equal(view(players[0]).report.victimId, victim.playerId);
    const died = view(players[0]).events.find((e) => e.key === 'night.died');
    assert.deepEqual(died.params, { playerId: victim.playerId, role: 'citizen' });
    await until(() => view(mafia).phase === 'report');
    assert.equal(view(mafia).players.find((p) => p.id === victim.playerId).role, 'citizen');

    await until(() => view(players[0]).phase === 'discussion');
    assert.deepEqual(await ask(victim, 'chat:send', { text: 'I am dead' }), { error: 'DEAD' });

    const speaker = players.find((p) => p !== victim);
    assert.equal((await ask(speaker, 'chat:send', { text: '  hello   everyone  ' })).ok, true);
    assert.deepEqual(await ask(speaker, 'chat:send', { text: 'again' }), { error: 'CHAT_RATE_LIMITED' });
    await until(() => victim.log.some((e) => e.event === 'chat:message' && e.payload.text === 'hello everyone'));
    assert.deepEqual(await ask(speaker, 'chat:send', { text: ' ' }), { error: 'EMPTY_MESSAGE' });

    await sleep(800);
    const long = await ask(speaker, 'chat:send', { text: 'x'.repeat(500) });
    if (long.ok) {
      const message = speaker.log.filter((e) => e.event === 'chat:message').pop().payload;
      assert.equal(message.text.length, 200);
    } else {
      assert.equal(long.error, 'CHAT_CLOSED');
    }
  });
});

test('a disconnected player resumes the same seat and view', async () => {
  await withServer({ graceMs: 5000 }, async ({ connect, port }) => {
    const { players } = await fillRoom(connect, 6);
    await ask(players[0], 'room:start', {});
    await until(() => players.every((p) => view(p)));

    const target = players[3];
    const role = view(target).me.role;
    target.disconnect();
    await until(() => roomState(players[0]).players.find((p) => p.id === target.playerId).connected === false);

    const back = await connectClient(port, target.token);
    players.push(back);
    assert.equal(back.playerId, target.playerId);
    await until(() => view(back) && roomState(back));
    assert.equal(view(back).me.role, role);
    await until(() => roomState(players[0]).players.find((p) => p.id === target.playerId).connected === true);
    assert.ok(back.log.some((e) => e.event === 'chat:history'));
    back.disconnect();
  });
});

test('lobby players who stay away are removed and the host role moves on', async () => {
  await withServer({ graceMs: 120 }, async ({ connect }) => {
    const { players } = await fillRoom(connect, 3);
    const [host, a, b] = players;
    b.disconnect();
    await until(() => roomState(host).players.length === 2);
    host.disconnect();
    await until(() => roomState(a).hostId === a.playerId);
    assert.equal(roomState(a).players.length, 1);
  });
});

test('a returning lobby player within the grace period keeps their seat', async () => {
  await withServer({ graceMs: 600 }, async ({ connect, port }) => {
    const { players } = await fillRoom(connect, 2);
    const [host, guest] = players;
    guest.disconnect();
    await sleep(100);
    const back = await connectClient(port, guest.token);
    await sleep(800);
    assert.equal(roomState(host).players.length, 2);
    assert.equal(roomState(host).players.find((p) => p.id === guest.playerId).connected, true);
    back.disconnect();
  });
});

test('rooms are closed after everyone stays away', async () => {
  await withServer({ graceMs: 50, roomTtlMs: 200 }, async ({ connect, server }) => {
    const { players, code } = await fillRoom(connect, 6);
    await ask(players[0], 'room:start', {});
    await until(() => players.every((p) => view(p)));
    players.forEach((p) => p.disconnect());
    await until(() => server.rooms.get(code) === null);
  });
});

test('host can return an ended game to the lobby', async () => {
  await withServer({}, async ({ connect }) => {
    const { players } = await fillRoom(connect, 2);
    const [host, guest] = players;
    assert.deepEqual(await ask(host, 'room:lobby', {}), { error: 'GAME_NOT_ENDED' });
    await ask(host, 'room:start', { fillWithBots: true });
    await until(() => view(host) && view(guest));
    const stop = autoplay([host, guest]);
    await until(() => view(host).phase === 'ended', 30000);
    stop();
    assert.deepEqual(await ask(guest, 'room:lobby', {}), { error: 'NOT_HOST' });
    assert.equal((await ask(host, 'room:lobby', {})).ok, true);
    await until(() => roomState(host).phase === 'lobby');
    assert.equal(roomState(host).players.length, 2);
  });
});

test('invalid actions and payloads never crash the server', async () => {
  await withServer({}, async ({ connect }) => {
    const { players } = await fillRoom(connect, 6);
    await ask(players[0], 'room:start', {});
    await until(() => players.every((p) => view(p)));
    const client = players[1];
    assert.deepEqual(await ask(client, 'game:action', { action: 'attack' }), { error: 'INVALID_ACTION' });
    assert.deepEqual(await ask(client, 'game:action', {}), { error: 'INVALID_ACTION' });
    assert.deepEqual(await ask(client, 'game:action', { action: { type: 'vote', target: null } }), { error: 'WRONG_ACTION' });
    assert.deepEqual(await ask(client, 'game:action', { action: { type: 'night', target: 'nobody' } }), { error: 'INVALID_TARGET' });
    assert.deepEqual(await ask(client, 'chat:send', 42), { error: 'CHAT_CLOSED' });
    assert.deepEqual(await ask(client, 'room:kick', 'x'), { error: 'NOT_HOST' });
    assert.ok(await ask(client, 'room:join', undefined));
    client.emit('room:create');
    client.emit('chat:send', null, 'not-a-function');
    await sleep(100);
    assert.equal((await ask(client, 'game:action', { action: { type: 'night', target: null } })).ok, true);
  });
});

test('flooding a socket is rate limited', async () => {
  await withServer({}, async ({ connect }) => {
    const client = await connect();
    const replies = await Promise.all(Array.from({ length: 120 }, () => ask(client, 'room:leave', {})));
    assert.ok(replies.filter((r) => r.error === 'RATE_LIMITED').length >= 50);
    assert.ok(replies.some((r) => r.error === 'NOT_IN_ROOM'));
  });
});
