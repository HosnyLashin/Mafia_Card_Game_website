import { Phase, Role, alivePlayers, findPlayer, awaitingAction } from './engine.js';
import { pick } from './rng.js';

function nightTarget(game, bot, rng) {
  const alive = alivePlayers(game);
  switch (bot.role) {
    case Role.MAFIA:
      return pick(alive.filter((p) => p.role !== Role.MAFIA), rng).id;
    case Role.POLICE:
      return pick(alive.filter((p) => p.id !== bot.id), rng).id;
    default:
      return pick(alive, rng).id;
  }
}

function voteTarget(game, bot, rng) {
  const candidates = alivePlayers(game).filter((p) => {
    if (p.id === bot.id) return false;
    return !(bot.role === Role.MAFIA && p.role === Role.MAFIA);
  });
  return candidates.length ? pick(candidates, rng).id : null;
}

export function botAction(game, botId, rng) {
  if (!awaitingAction(game, botId)) return null;
  const bot = findPlayer(game, botId);
  switch (game.phase) {
    case Phase.NIGHT:
      return { type: 'night', target: nightTarget(game, bot, rng) };
    case Phase.VOTE:
      return { type: 'vote', target: voteTarget(game, bot, rng) };
    case Phase.REVOTE:
      return { type: 'revote', choice: rng() < 0.4 ? 'switch' : 'keep' };
    default:
      return null;
  }
}
