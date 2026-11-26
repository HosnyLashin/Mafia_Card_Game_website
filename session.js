import { createGame, submit, tick, replaceWithBot as handOver, inactivePlayers, Phase } from './engine/engine.js';
import { createBotTeam } from './engine/bots.js';

export class GameSession {
  constructor(room, { now = Date.now, rng = Math.random, config, notify, say = () => null, onInactive = null }) {
    this.room = room;
    this.now = now;
    this.rng = rng;
    this.config = config;
    this.notify = notify;
    this.say = say;
    this.onInactive = onInactive;
    this.team = null;
    this.timer = null;
    this.botTimers = [];
    this.botKey = null;
    this.chatTimers = [];
    this.chatKey = null;
    this.destroyed = false;
  }

  start() {
    const players = this.room.players.map(({ id, name, isBot }) => ({ id, name, isBot }));
    this.game = createGame({ players, config: this.config, rng: this.rng, now: this.now() });
    this.room.game = this.game;
    this.room.phase = 'playing';
    this.team = players.some((p) => p.isBot) ? createBotTeam(this.game, this.rng) : null;
    this.sync();
  }

  observeChat(message) {
    this.team?.observeChat(message);
  }

  replaceWithBot(playerId) {
    if (this.destroyed || !handOver(this.game, playerId)) return;
    if (!this.team) this.team = createBotTeam(this.game, this.rng);
    this.team.adopt(playerId);
    this.botKey = null;
    this.chatKey = null;
    this.sync();
  }

  act(playerId, action) {
    const result = submit(this.game, playerId, action, this.now());
    if (result.error) return result;
    this.sync();
    return result;
  }

  sync() {
    if (this.destroyed) return;
    clearTimeout(this.timer);
    this.team?.sync();
    if (this.onInactive && this.game.phase !== Phase.ENDED) {
      inactivePlayers(this.game).forEach((p) => this.onInactive(this.room, p.id));
      if (this.destroyed) return;
    }
    if (this.game.phase === Phase.ENDED) {
      this.clearBots();
      this.clearChat();
      this.room.phase = 'ended';
    } else {
      this.scheduleTick();
      this.scheduleBots();
      this.scheduleChat();
    }
    this.notify(this.room);
  }

  scheduleTick() {
    clearTimeout(this.timer);
    const delay = Math.max(0, this.game.deadline - this.now()) + 5;
    this.timer = setTimeout(() => {
      tick(this.game, this.now());
      this.sync();
    }, delay);
  }

  clearBots() {
    this.botTimers.forEach(clearTimeout);
    this.botTimers = [];
    this.botKey = null;
  }

  scheduleBots() {
    const key = `${this.game.phase}:${this.game.day}`;
    if (key === this.botKey) return;
    this.clearBots();
    this.botKey = key;
    const remaining = this.game.deadline - this.now();
    const window = Math.max(0, Math.min(5000, remaining - 800));
    this.game.players
      .filter((p) => p.isBot && p.alive)
      .forEach((bot) => {
        const delay = 300 + this.rng() * window;
        this.botTimers.push(
          setTimeout(() => {
            if (this.destroyed || this.botKey !== key) return;
            const action = this.team.act(bot.id);
            if (!action) return;
            if (!submit(this.game, bot.id, action, this.now()).error) this.sync();
          }, delay),
        );
      });
  }

  clearChat() {
    this.chatTimers.forEach(clearTimeout);
    this.chatTimers = [];
    this.chatKey = null;
  }

  scheduleChat() {
    const { game } = this;
    const accusedBot = game.players.find((p) => p.id === game.accused && p.isBot && p.alive);
    const mafiaNight =
      game.phase === Phase.NIGHT &&
      game.players.some((p) => p.alive && p.role === 'mafia' && !p.isBot) &&
      game.players.some((p) => p.alive && p.role === 'mafia' && p.isBot);
    const talking = game.phase === Phase.DISCUSSION || (game.phase === Phase.DEFENSE && accusedBot) || mafiaNight;
    const key = talking ? `${game.phase}:${game.day}:${game.accused ?? ''}` : null;
    if (key === this.chatKey) return;
    this.clearChat();
    this.chatKey = key;
    if (!key || !this.team) return;

    const speakers = game.players.filter((p) => {
      if (!p.isBot || !p.alive) return false;
      if (game.phase === Phase.DEFENSE) return p.id === game.accused;
      if (game.phase === Phase.NIGHT) return p.role === 'mafia';
      return true;
    });
    const span = Math.max(300, (game.deadline - this.now()) * 0.7);
    speakers.forEach((bot) => {
      const turns = this.team.chatTurns(bot.id);
      for (let turn = 0; turn < turns; turn++) {
        const delay = 100 + (span * (turn + this.rng())) / turns;
        this.chatTimers.push(
          setTimeout(() => {
            if (this.destroyed || this.chatKey !== key) return;
            const line = this.team.nextLine(bot.id);
            if (!line) return;
            const message = this.say(this.room, bot.id, line);
            if (message) this.team.observeChat(message);
          }, delay),
        );
      }
    });
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.clearBots();
    this.clearChat();
  }
}
