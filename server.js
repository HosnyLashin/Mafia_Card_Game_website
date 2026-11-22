import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createIdentity } from './identity.js';
import { Rooms } from './rooms.js';
import { GameSession } from './session.js';
import { viewFor } from './engine/views.js';

const RATE_WINDOW_MS = 10000;
const RATE_LIMIT = 60;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const defaultStaticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client', 'dist');

const statOf = (file) => {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
};

function reply(res, status) {
  res.writeHead(status);
  res.end();
}

function sendStatic(root, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return reply(res, 400);
  }
  if (pathname.includes('\0')) return reply(res, 400);

  const base = path.resolve(root);
  let file = path.resolve(base, `.${pathname}`);
  if (file !== base && !file.startsWith(base + path.sep)) return reply(res, 403);

  let stat = statOf(file);
  if (stat?.isDirectory()) {
    file = path.join(file, 'index.html');
    stat = statOf(file);
  }
  if (!stat?.isFile()) {
    if (path.extname(pathname)) return reply(res, 404);
    file = path.join(base, 'index.html');
    stat = statOf(file);
    if (!stat?.isFile()) return reply(res, 404);
  }

  const immutable = file.startsWith(path.join(base, 'assets') + path.sep);
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return undefined;
  }
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
  return undefined;
}

export function createServer({
  clientOrigin = '*',
  staticDir = defaultStaticDir,
  secret,
  gameConfig,
  graceMs = 30000,
  roomTtlMs = 600000,
  now = Date.now,
  rng = Math.random,
} = {}) {
  const identity = createIdentity(secret);
  const rooms = new Rooms({ rng });
  const sockets = new Map();
  const graceTimers = new Map();
  const ttlTimers = new Map();

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'UP' }));
      return;
    }
    sendStatic(staticDir, req, res);
  });

  const io = new Server(httpServer, { cors: { origin: clientOrigin }, maxHttpBufferSize: 10000 });

  const emitRoom = (room) => io.to(`room:${room.code}`).emit('room:state', rooms.publicState(room));

  const viewOf = (room, playerId) => ({ ...viewFor(room.game, playerId), serverNow: now() });

  const emitViews = (room) => {
    if (!room.game) return;
    room.players
      .filter((p) => !p.isBot && !p.left)
      .forEach((p) => io.to(`p:${p.id}`).emit('game:view', viewOf(room, p.id)));
  };

  const notify = (room) => {
    emitRoom(room);
    emitViews(room);
  };

  const say = (room, botId, line) => {
    const result = rooms.postBotChat(room, botId, line, now());
    if (result.error) return null;
    io.to(`room:${room.code}`).emit('chat:message', result.message);
    return result.message;
  };

  const cancelTtl = (code) => {
    clearTimeout(ttlTimers.get(code));
    ttlTimers.delete(code);
  };

  const closeRoom = (room) => {
    cancelTtl(room.code);
    io.in(`room:${room.code}`).emit('room:closed');
    io.in(`room:${room.code}`).socketsLeave(`room:${room.code}`);
    rooms.close(room);
  };

  const scheduleTtl = (room) => {
    cancelTtl(room.code);
    if (rooms.humans(room).some((p) => p.connected)) return;
    ttlTimers.set(room.code, setTimeout(() => closeRoom(room), roomTtlMs));
  };

  const clearGrace = (playerId) => {
    clearTimeout(graceTimers.get(playerId));
    graceTimers.delete(playerId);
  };

  const onGraceExpired = (playerId) => {
    graceTimers.delete(playerId);
    const room = rooms.roomOf(playerId);
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player || player.connected) return;
    if (room.phase === 'lobby') {
      const result = rooms.removePlayer(playerId);
      if (result.closed) {
        cancelTtl(room.code);
        return;
      }
      notify(room);
      scheduleTtl(room);
      return;
    }
    if (room.hostId === playerId && rooms.reassignHost(room)) emitRoom(room);
  };

  const onDisconnect = (playerId) => {
    const room = rooms.setConnected(playerId, false);
    if (!room) return;
    emitRoom(room);
    scheduleTtl(room);
    clearGrace(playerId);
    graceTimers.set(playerId, setTimeout(() => onGraceExpired(playerId), graceMs));
  };

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const playerId = identity.verify(token);
    if (playerId) {
      socket.data.playerId = playerId;
      socket.data.token = token;
    } else {
      const guest = identity.newGuest();
      socket.data.playerId = guest.playerId;
      socket.data.token = guest.token;
    }
    next();
  });

  io.on('connection', (socket) => {
    const { playerId, token } = socket.data;
    const recent = [];

    socket.join(`p:${playerId}`);
    if (!sockets.has(playerId)) sockets.set(playerId, new Set());
    sockets.get(playerId).add(socket.id);
    clearGrace(playerId);
    socket.emit('session', { playerId, token });

    const resumed = rooms.setConnected(playerId, true);
    if (resumed) {
      cancelTtl(resumed.code);
      socket.join(`room:${resumed.code}`);
      emitRoom(resumed);
      socket.emit('chat:history', resumed.chat);
      if (resumed.game) socket.emit('game:view', viewOf(resumed, playerId));
    }

    const on = (event, handler) => {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const stamp = now();
        while (recent.length && stamp - recent[0] > RATE_WINDOW_MS) recent.shift();
        if (recent.length >= RATE_LIMIT) {
          reply({ error: 'RATE_LIMITED' });
          return;
        }
        recent.push(stamp);
        const data = payload && typeof payload === 'object' ? payload : {};
        try {
          reply(handler(data) ?? { ok: true });
        } catch {
          reply({ error: 'SERVER_ERROR' });
        }
      });
    };

    const joinRoomSockets = (room) => io.in(`p:${playerId}`).socketsJoin(`room:${room.code}`);

    on('room:create', (data) => {
      const result = rooms.create(playerId, data.name);
      if (result.error) return result;
      joinRoomSockets(result.room);
      emitRoom(result.room);
      return { ok: true, code: result.room.code };
    });

    on('room:join', (data) => {
      const result = rooms.join(data.code, playerId, data.name);
      if (result.error) return result;
      joinRoomSockets(result.room);
      emitRoom(result.room);
      socket.emit('chat:history', result.room.chat);
      return { ok: true, code: result.room.code };
    });

    on('room:leave', () => {
      const result = rooms.removePlayer(playerId);
      if (!result) return { error: 'NOT_IN_ROOM' };
      io.in(`p:${playerId}`).socketsLeave(`room:${result.room.code}`);
      if (result.closed) cancelTtl(result.room.code);
      else notify(result.room);
      return { ok: true };
    });

    on('room:kick', (data) => {
      const result = rooms.kick(playerId, data.playerId);
      if (result.error) return result;
      io.to(`p:${result.kickedId}`).emit('room:kicked');
      io.in(`p:${result.kickedId}`).socketsLeave(`room:${result.room.code}`);
      emitRoom(result.room);
      return { ok: true };
    });

    on('room:start', (data) => {
      const result = rooms.prepareStart(playerId, data.fillWithBots === true);
      if (result.error) return result;
      const session = new GameSession(result.room, { now, rng, config: gameConfig, notify, say });
      result.room.session = session;
      session.start();
      return { ok: true };
    });

    on('room:lobby', () => {
      const result = rooms.resetToLobby(playerId);
      if (result.error) return result;
      emitRoom(result.room);
      return { ok: true };
    });

    on('game:action', (data) => {
      const room = rooms.roomOf(playerId);
      if (!room || room.phase !== 'playing') return { error: 'NOT_PLAYING' };
      return room.session.act(playerId, data.action);
    });

    on('chat:send', (data) => {
      const room = rooms.roomOf(playerId);
      if (!room) return { error: 'NOT_IN_ROOM' };
      const result = rooms.postChat(room, playerId, data.text, now());
      if (result.error) return result;
      io.to(`room:${room.code}`).emit('chat:message', result.message);
      room.session?.observeChat(result.message);
      return { ok: true };
    });

    socket.on('disconnect', () => {
      const set = sockets.get(playerId);
      set?.delete(socket.id);
      if (set && set.size === 0) {
        sockets.delete(playerId);
        onDisconnect(playerId);
      }
    });
  });

  return {
    httpServer,
    io,
    rooms,
    listen: (port) => new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port))),
    close: () =>
      new Promise((resolve) => {
        graceTimers.forEach(clearTimeout);
        ttlTimers.forEach(clearTimeout);
        [...rooms.rooms.values()].forEach((room) => room.session?.destroy());
        io.close(() => resolve());
      }),
  };
}
