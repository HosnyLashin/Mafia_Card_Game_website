import { cleanName, cleanMessage } from './text.js';
import { LINE_CATEGORIES, LINE_VARIANTS } from './engine/botlines.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CHAT_INTERVAL_MS = 700;
const CHAT_HISTORY = 200;

const validLine = (line) =>
  Boolean(line) &&
  LINE_CATEGORIES.includes(line.key) &&
  Number.isInteger(line.variant) &&
  line.variant >= 0 &&
  line.variant < LINE_VARIANTS &&
  typeof line.params === 'object' &&
  Object.entries(line.params).every(([name, value]) => name === 'target' && typeof value === 'string' && value.length <= 40);

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
      capacity: this.minPlayers,
      players: [member(playerId, clean)],
      deadSeen: new Set(),
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
    if (room.players.length >= room.capacity) return { error: 'ROOM_FULL' };
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

  setCapacity(playerId, capacity) {
    const room = this.roomOf(playerId);
    if (!room) return { error: 'NOT_IN_ROOM' };
    if (room.hostId !== playerId) return { error: 'NOT_HOST' };
    if (room.phase !== 'lobby') return { error: 'GAME_STARTED' };
    if (!Number.isInteger(capacity) || capacity < this.minPlayers || capacity > this.maxPlayers) {
      return { error: 'INVALID_CAPACITY' };
    }
    if (capacity < room.players.length) return { error: 'INVALID_CAPACITY' };
    room.capacity = capacity;
    return { room };
  }

  removePlayer(playerId) {
    const room = this.roomOf(playerId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    this.membership.delete(playerId);
    if (room.phase === 'lobby') {
      room.players = room.players.filter((p) => p.id !== playerId);
    } else if (room.phase === 'playing' && room.session) {
      player.isBot = true;
      player.connected = false;
      player.replaced = true;
      room.session.replaceWithBot(playerId);
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
    if (missing > 0 && !fillWithBots) return { error: 'NOT_ENOUGH_PLAYERS', missing };
    const toAdd = fillWithBots ? Math.max(this.minPlayers, room.capacity) - room.players.length : 0;
    if (toAdd > 0) {
      const taken = new Set(room.players.map((p) => p.name.toLowerCase()));
      let number = 1;
      for (let added = 0; added < toAdd; ) {
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
    room.deadSeen = new Set();
    return { room };
  }

  isDead(room, playerId) {
    if (room.phase !== 'playing' || !room.game) return false;
    const gamePlayer = room.game.players.find((p) => p.id === playerId);
    return Boolean(gamePlayer) && !gamePlayer.alive;
  }

  chatBlock(room, playerId) {
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.left) return 'NOT_IN_ROOM';
    if (room.phase !== 'playing') return null;
    if (this.isDead(room, playerId)) return null;
    if (room.game.phase === 'discussion') return null;
    if (room.game.phase === 'defense' && room.game.accused === playerId) return null;
    return 'CHAT_CLOSED';
  }

  visibleChat(room, playerId) {
    const seesDead = room.phase === 'ended' || this.isDead(room, playerId);
    return room.chat.filter((message) => message.channel !== 'dead' || seesDead);
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
      channel: this.isDead(room, playerId) ? 'dead' : 'main',
      at: now,
      day: room.game ? room.game.day : 0,
      phase: room.game ? room.game.phase : room.phase,
    };
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY) room.chat.shift();
    return { message };
  }

  postBotChat(room, botId, line, now) {
    const bot = room.players.find((p) => p.id === botId && p.isBot);
    if (!bot) return { error: 'NOT_IN_ROOM' };
    const blocked = this.chatBlock(room, botId);
    if (blocked) return { error: blocked };
    if (this.isDead(room, botId)) return { error: 'DEAD' };
    if (!validLine(line)) return { error: 'INVALID_LINE' };
    const last = room.lastChat.get(botId) ?? 0;
    if (now - last < CHAT_INTERVAL_MS) return { error: 'CHAT_RATE_LIMITED' };
    room.lastChat.set(botId, now);
    room.chatSeq += 1;
    const message = {
      id: room.chatSeq,
      playerId: botId,
      name: bot.name,
      text: null,
      channel: 'main',
      template: { key: line.key, variant: line.variant, params: { ...line.params } },
      at: now,
      day: room.game.day,
      phase: room.game.phase,
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
      capacity: room.capacity,
      players: room.players.map(({ id, name, isBot, connected, left, replaced }) => ({
        id,
        name,
        isBot,
        connected,
        left,
        replaced: Boolean(replaced),
      })),
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
