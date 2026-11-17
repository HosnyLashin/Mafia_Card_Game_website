import { createGame, submit, tick, Phase } from './engine/engine.js';
import { botAction } from './engine/bots.js';

export class GameSession {
  constructor(room, { now = Date.now, rng = Math.random, config, notify }) {
    this.room = room;
    this.now = now;
    this.rng = rng;
    this.config = config;
    this.notify = notify;
    this.timer = null;
    this.botTimers = [];
    this.botKey = null;
    this.destroyed = false;
  }

  start() {
    const players = this.room.players.map(({ id, name, isBot }) => ({ id, name, isBot }));
    this.game = createGame({ players, config: this.config, rng: this.rng, now: this.now() });
    this.room.game = this.game;
    this.room.phase = 'playing';
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
    if (this.game.phase === Phase.ENDED) {
      this.clearBots();
      this.room.phase = 'ended';
    } else {
      this.scheduleTick();
      this.scheduleBots();
    }
    this.notify(this.room);
  }

  scheduleTick() {
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
            const action = botAction(this.game, bot.id, this.rng);
            if (!action) return;
            if (!submit(this.game, bot.id, action, this.now()).error) this.sync();
          }, delay),
        );
      });
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.clearBots();
  }
}
