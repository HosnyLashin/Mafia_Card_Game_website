import { cleanName, cleanMessage } from './text.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CHAT_INTERVAL_MS = 700;
const CHAT_HISTORY = 200;

const member = (id, name, isBot = false) => ({ id, name, isBot, connected: !isBot, left: false });
const isHuman = (p) => !p.isBot && !p.left;

export class Rooms {
  constructor({ minPlayers = 6, maxPlayers = 12, rng = Math.random } = {}) {
    this.minPlayers = minPlayers;
    this.maxPlayers = maxPlayers;
    this.rng = rng;
    this.rooms = new Map();
    this.membership = new Map();
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(this.rng() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  get(code) {
    return this.rooms.get(String(code ?? '').toUpperCase()) ?? null;
  }

  roomOf(playerId) {
    const code = this.membership.get(playerId);
    return code ? this.rooms.get(code) ?? null : null;
  }

  humans(room) {
    return room.players.filter(isHuman);
  }

  create(playerId, name) {
    if (this.membership.has(playerId)) return { error: 'ALREADY_IN_ROOM' };
    const clean = cleanName(name);
    if (!clean) return { error: 'INVALID_NAME' };
    const room = {
      code: this.generateCode(),
      hostId: playerId,
      phase: 'lobby',
      players: [member(playerId, clean)],
      game: null,
      session: null,
      chat: [],
      chatSeq: 0,
      lastChat: new Map(),
    };
    this.rooms.set(room.code, room);
    this.membership.set(playerId, room.code);
    return { room };
  }

  join(code, playerId, name) {
    if (this.membership.has(playerId)) return { error: 'ALREADY_IN_ROOM' };
    const room = this.get(code);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.phase !== 'lobby') return { error: 'GAME_STARTED' };
    if (room.players.length >= this.maxPlayers) return { error: 'ROOM_FULL' };
    const clean = cleanName(name);
    if (!clean) return { error: 'INVALID_NAME' };
    if (room.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      return { error: 'NAME_TAKEN' };
    }
    room.players.push(member(playerId, clean));
    this.membership.set(playerId, room.code);
    return { room };
  }

  setConnected(playerId, connected) {
    const room = this.roomOf(playerId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.connected = connected;
    return room;
  }

  reassignHost(room) {
    const humans = this.humans(room);
    const next = humans.find((p) => p.connected) ?? humans[0];
    if (!next || next.id === room.hostId) return false;
    room.hostId = next.id;
    return true;
  }

  removePlayer(playerId) {
    const room = this.roomOf(playerId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    this.membership.delete(playerId);
    if (room.phase === 'lobby') {
      room.players = room.players.filter((p) => p.id !== playerId);
    } else {
      player.left = true;
      player.connected = false;
    }
    if (this.humans(room).length === 0) {
      this.close(room);
      return { room, closed: true, hostChanged: false };
    }
    const hostChanged = room.hostId === playerId ? this.reassignHost(room) : false;
    return { room, closed: false, hostChanged };
  }

  kick(hostId, targetId) {
    const room = this.roomOf(hostId);
    if (!room) return { error: 'NOT_IN_ROOM' };
    if (room.hostId !== hostId) return { error: 'NOT_HOST' };
    if (room.phase !== 'lobby') return { error: 'GAME_STARTED' };
    if (targetId === hostId) return { error: 'INVALID_TARGET' };
    const target = room.players.find((p) => p.id === targetId && !p.isBot);
    if (!target) return { error: 'INVALID_TARGET' };
    this.removePlayer(targetId);
    return { room, kickedId: targetId };
  }

  prepareStart(playerId, fillWithBots) {
    const room = this.roomOf(playerId);
    if (!room) return { error: 'NOT_IN_ROOM' };
    if (room.hostId !== playerId) return { error: 'NOT_HOST' };
    if (room.phase !== 'lobby') return { error: 'ALREADY_STARTED' };
    const missing = this.minPlayers - room.players.length;
    if (missing > 0) {
      if (!fillWithBots) return { error: 'NOT_ENOUGH_PLAYERS', missing };
      const taken = new Set(room.players.map((p) => p.name.toLowerCase()));
      let number = 1;
      for (let added = 0; added < missing; ) {
        const name = `Bot ${number}`;
        number += 1;
        if (taken.has(name.toLowerCase())) continue;
        room.players.push(member(`bot-${room.code}-${number - 1}`, name, true));
        added += 1;
      }
    }
    return { room };
  }

  resetToLobby(playerId) {
    const room = this.roomOf(playerId);
    if (!room) return { error: 'NOT_IN_ROOM' };
    if (room.hostId !== playerId) return { error: 'NOT_HOST' };
    if (room.phase !== 'ended') return { error: 'GAME_NOT_ENDED' };
    room.session?.destroy();
    room.session = null;
    room.game = null;
    room.players = room.players.filter((p) => !p.isBot && !p.left);
    room.phase = 'lobby';
    room.chat = [];
    return { room };
  }

  chatBlock(room, playerId) {
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.left) return 'NOT_IN_ROOM';
    if (room.phase !== 'playing') return null;
    const gamePlayer = room.game.players.find((p) => p.id === playerId);
    if (!gamePlayer.alive) return 'DEAD';
    if (room.game.phase === 'discussion') return null;
    if (room.game.phase === 'defense' && room.game.accused === playerId) return null;
    return 'CHAT_CLOSED';
  }

  postChat(room, playerId, rawText, now) {
    const blocked = this.chatBlock(room, playerId);
    if (blocked) return { error: blocked };
    const text = cleanMessage(rawText);
    if (!text) return { error: 'EMPTY_MESSAGE' };
    const last = room.lastChat.get(playerId) ?? 0;
    if (now - last < CHAT_INTERVAL_MS) return { error: 'CHAT_RATE_LIMITED' };
    room.lastChat.set(playerId, now);
    const player = room.players.find((p) => p.id === playerId);
    room.chatSeq += 1;
    const message = {
      id: room.chatSeq,
      playerId,
      name: player.name,
      text,
      at: now,
      day: room.game ? room.game.day : 0,
      phase: room.game ? room.game.phase : room.phase,
    };
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY) room.chat.shift();
    return { message };
  }

  publicState(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      players: room.players.map(({ id, name, isBot, connected, left }) => ({ id, name, isBot, connected, left })),
    };
  }

  close(room) {
    room.session?.destroy();
    room.session = null;
    this.rooms.delete(room.code);
    room.players.forEach((p) => {
      if (this.membership.get(p.id) === room.code) this.membership.delete(p.id);
    });
  }
}
