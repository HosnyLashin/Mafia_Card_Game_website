import { cleanName, cleanMessage } from './text.js';
import { LINE_CATEGORIES, LINE_VARIANTS } from './engine/botlines.js';
import { QUICK_IDS } from './engine/quick.js';
import { BOT_NAMES } from './engine/botnames.js';
import { cleanProfile } from './profile.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CHAT_INTERVAL_MS = 700;
const CHAT_HISTORY = 200;
const MAX_SPECTATORS = 10;

export const SETTING_CHOICES = {
  discussionSeconds: [30, 60, 90, 120, 180],
  nightSeconds: [20, 30, 45, 60],
  voteSeconds: [20, 30, 45, 60],
  mafiaCount: ['auto', 1, 2, 3],
};

const BOOLEAN_SETTINGS = ['publicVotes', 'revealDeadRoles'];

const defaultSettings = () => ({
  discussionSeconds: null,
  nightSeconds: null,
  voteSeconds: null,
  mafiaCount: 'auto',
  publicVotes: false,
  revealDeadRoles: true,
});

const validLine = (line) =>
  Boolean(line) &&
  LINE_CATEGORIES.includes(line.key) &&
  Number.isInteger(line.variant) &&
  line.variant >= 0 &&
  line.variant < LINE_VARIANTS &&
  typeof line.params === 'object' &&
  Object.entries(line.params).every(([name, value]) => name === 'target' && typeof value === 'string' && value.length <= 40);

const member = (id, name, isBot, profile) => ({
  id,
  name,
  isBot,
  connected: !isBot,
  left: false,
  avatar: profile.avatar,
  color: profile.color,
});

const isHuman = (p) => !p.isBot && !p.left;

export function buildGameConfig(room, base = {}) {
  const { settings } = room;
  const seconds = { ...(base.seconds ?? {}) };
  if (settings.discussionSeconds) seconds.discussion = settings.discussionSeconds;
  if (settings.nightSeconds) seconds.night = settings.nightSeconds;
  if (settings.voteSeconds) seconds.vote = settings.voteSeconds;
  return {
    ...base,
    seconds,
    mafiaCount: settings.mafiaCount === 'auto' ? null : settings.mafiaCount,
    publicVotes: settings.publicVotes,
    revealRoleOnNightDeath: settings.revealDeadRoles,
    revealRoleOnKick: settings.revealDeadRoles,
  };
}

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

  isSpectator(room, playerId) {
    return room.spectators.some((s) => s.id === playerId);
  }

  create(playerId, name, profile, { practice = false } = {}) {
    if (this.membership.has(playerId)) return { error: 'ALREADY_IN_ROOM' };
    const clean = cleanName(name);
    if (!clean) return { error: 'INVALID_NAME' };
    const room = {
      code: this.generateCode(),
      hostId: playerId,
      phase: 'lobby',
      capacity: this.minPlayers,
      practice,
      settings: defaultSettings(),
      players: [member(playerId, clean, false, cleanProfile(profile))],
      spectators: [],
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

  join(code, playerId, name, profile) {
    if (this.membership.has(playerId)) return { error: 'ALREADY_IN_ROOM' };
    const room = this.get(code);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.practice) return { error: 'ROOM_NOT_FOUND' };
    if (room.phase !== 'lobby') return { error: 'GAME_STARTED' };
    if (room.players.length >= room.capacity) return { error: 'ROOM_FULL' };
    const clean = cleanName(name);
    if (!clean) return { error: 'INVALID_NAME' };
    if (room.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      return { error: 'NAME_TAKEN' };
    }
    room.players.push(member(playerId, clean, false, cleanProfile(profile, room.players.length)));
    this.membership.set(playerId, room.code);
    return { room };
  }

  joinSpectator(code, playerId, name, profile) {
    if (this.membership.has(playerId)) return { error: 'ALREADY_IN_ROOM' };
    const room = this.get(code);
    if (!room || room.practice) return { error: 'ROOM_NOT_FOUND' };
    if (room.spectators.length >= MAX_SPECTATORS) return { error: 'ROOM_FULL' };
    const clean = cleanName(name);
    if (!clean) return { error: 'INVALID_NAME' };
    const { avatar, color } = cleanProfile(profile, room.spectators.length);
    room.spectators.push({ id: playerId, name: clean, avatar, color, connected: true });
    this.membership.set(playerId, room.code);
    return { room };
  }

  setConnected(playerId, connected) {
    const room = this.roomOf(playerId);
    if (!room) return null;
    const spectator = room.spectators.find((s) => s.id === playerId);
    if (spectator) spectator.connected = connected;
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

  setSettings(playerId, patch) {
    const room = this.roomOf(playerId);
    if (!room) return { error: 'NOT_IN_ROOM' };
    if (room.hostId !== playerId) return { error: 'NOT_HOST' };
    if (room.phase !== 'lobby') return { error: 'GAME_STARTED' };
    if (!patch || typeof patch !== 'object') return { error: 'INVALID_SETTING' };

    const next = { ...room.settings };
    let capacity = room.capacity;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'capacity') {
        const valid = Number.isInteger(value) && value >= this.minPlayers && value <= this.maxPlayers;
        if (!valid || value < room.players.length) return { error: 'INVALID_CAPACITY' };
        capacity = value;
      } else if (SETTING_CHOICES[key]) {
        if (!SETTING_CHOICES[key].includes(value)) return { error: 'INVALID_SETTING' };
        next[key] = value;
      } else if (BOOLEAN_SETTINGS.includes(key)) {
        if (typeof value !== 'boolean') return { error: 'INVALID_SETTING' };
        next[key] = value;
      } else {
        return { error: 'INVALID_SETTING' };
      }
    }
    room.settings = next;
    room.capacity = capacity;
    return { room };
  }

  removePlayer(playerId) {
    const room = this.roomOf(playerId);
    if (!room) return null;
    if (this.isSpectator(room, playerId)) {
      room.spectators = room.spectators.filter((s) => s.id !== playerId);
      this.membership.delete(playerId);
      return { room, closed: false, hostChanged: false };
    }
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
    if (targetId === hostId) return { error: 'INVALID_TARGET' };
    if (this.isSpectator(room, targetId)) {
      this.removePlayer(targetId);
      return { room, kickedId: targetId };
    }
    if (room.phase !== 'lobby') return { error: 'GAME_STARTED' };
    const target = room.players.find((p) => p.id === targetId && !p.isBot);
    if (!target) return { error: 'INVALID_TARGET' };
    this.removePlayer(targetId);
    return { room, kickedId: targetId };
  }

  shuffled(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
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
      const names = this.shuffled(BOT_NAMES).filter((name) => !taken.has(name.toLowerCase()));
      for (let i = 0; i < toAdd; i++) {
        const name = names[i] ?? `${names[i % names.length]} ${i}`;
        const profile = cleanProfile(null, Math.floor(this.rng() * 1000));
        room.players.push(member(`bot-${room.code}-${i + 1}`, name, true, profile));
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
    room.lastChat = new Map();
    return { room };
  }

  rematch(playerId) {
    const room = this.roomOf(playerId);
    if (!room) return { error: 'NOT_IN_ROOM' };
    if (room.hostId !== playerId) return { error: 'NOT_HOST' };
    if (room.phase !== 'ended') return { error: 'GAME_NOT_ENDED' };
    room.session?.destroy();
    room.session = null;
    room.game = null;
    room.players = room.players.filter((p) => !p.left);
    room.phase = 'lobby';
    room.chat = [];
    room.deadSeen = new Set();
    room.lastChat = new Map();
    return { room };
  }

  isDead(room, playerId) {
    if (room.phase !== 'playing' || !room.game) return false;
    const gamePlayer = room.game.players.find((p) => p.id === playerId);
    return Boolean(gamePlayer) && !gamePlayer.alive;
  }

  roleOf(room, playerId) {
    return room.game?.players.find((p) => p.id === playerId)?.role ?? null;
  }

  chatBlock(room, playerId) {
    if (this.isSpectator(room, playerId)) return 'SPECTATOR';
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.left) return 'NOT_IN_ROOM';
    if (room.phase !== 'playing') return null;
    if (this.isDead(room, playerId)) return null;
    const { game } = room;
    if (game.phase === 'night') {
      const mafiaAlive = game.players.filter((p) => p.alive && p.role === 'mafia').length;
      return this.roleOf(room, playerId) === 'mafia' && mafiaAlive >= 2 ? null : 'CHAT_CLOSED';
    }
    if (game.phase === 'discussion') return null;
    if (game.phase === 'defense' && game.accused === playerId) return null;
    return 'CHAT_CLOSED';
  }

  channelFor(room, playerId) {
    if (room.phase !== 'playing') return 'main';
    if (this.isDead(room, playerId)) return 'dead';
    return room.game.phase === 'night' ? 'mafia' : 'main';
  }

  visibleChat(room, viewerId) {
    const ended = room.phase === 'ended';
    const spectator = this.isSpectator(room, viewerId);
    const dead = this.isDead(room, viewerId);
    const mafia = !spectator && room.phase === 'playing' && this.roleOf(room, viewerId) === 'mafia';
    return room.chat.filter((message) => {
      if (message.channel === 'dead') return ended || dead;
      if (message.channel === 'mafia') return ended || mafia;
      return true;
    });
  }

  postMessage(room, playerId, body, now) {
    const blocked = this.chatBlock(room, playerId);
    if (blocked) return { error: blocked };
    let content;
    if (body.quick !== undefined) {
      if (!QUICK_IDS.includes(body.quick)) return { error: 'INVALID_QUICK' };
      content = { text: null, quick: body.quick };
    } else {
      const text = cleanMessage(body.text);
      if (!text) return { error: 'EMPTY_MESSAGE' };
      content = { text };
    }
    const last = room.lastChat.get(playerId) ?? 0;
    if (now - last < CHAT_INTERVAL_MS) return { error: 'CHAT_RATE_LIMITED' };
    room.lastChat.set(playerId, now);
    const player = room.players.find((p) => p.id === playerId);
    room.chatSeq += 1;
    const message = {
      id: room.chatSeq,
      playerId,
      name: player.name,
      ...content,
      channel: this.channelFor(room, playerId),
      at: now,
      day: room.game ? room.game.day : 0,
      phase: room.game ? room.game.phase : room.phase,
    };
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY) room.chat.shift();
    return { message };
  }

  postChat(room, playerId, rawText, now) {
    return this.postMessage(room, playerId, { text: rawText }, now);
  }

  postQuick(room, playerId, id, now) {
    return this.postMessage(room, playerId, { quick: id ?? null }, now);
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
      channel: room.game.phase === 'night' ? 'mafia' : 'main',
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
      practice: room.practice,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      capacity: room.capacity,
      settings: room.settings,
      players: room.players.map(({ id, name, isBot, connected, left, replaced, avatar, color }) => ({
        id,
        name,
        isBot,
        connected,
        left,
        replaced: Boolean(replaced),
        avatar,
        color,
      })),
      spectators: room.spectators.map(({ id, name, avatar, color }) => ({ id, name, avatar, color })),
    };
  }

  close(room) {
    room.session?.destroy();
    room.session = null;
    this.rooms.delete(room.code);
    [...room.players, ...room.spectators].forEach((p) => {
      if (this.membership.get(p.id) === room.code) this.membership.delete(p.id);
    });
  }
}
