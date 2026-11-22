import { mergeConfig, mafiaCount } from './config.js';
import { shuffle, pick } from './rng.js';

export const Phase = Object.freeze({
  NIGHT: 'night',
  REPORT: 'report',
  DISCUSSION: 'discussion',
  VOTE: 'vote',
  DEFENSE: 'defense',
  REVOTE: 'revote',
  ENDED: 'ended',
});

export const Role = Object.freeze({
  MAFIA: 'mafia',
  DOCTOR: 'doctor',
  POLICE: 'police',
  CITIZEN: 'citizen',
});

export class EngineError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const fail = (error) => ({ error });
const ok = () => ({ ok: true });

export const findPlayer = (game, id) => game.players.find((p) => p.id === id);
export const alivePlayers = (game) => game.players.filter((p) => p.alive);

function emit(game, key, params = {}) {
  game.events.push({ seq: game.events.length, day: game.day, key, params });
}

function schedule(game, phase, now) {
  game.phase = phase;
  game.deadline = now + game.config.seconds[phase] * 1000;
}

function buildRoles(count, config) {
  const mafia = mafiaCount(count, config);
  const roles = [
    ...Array(mafia).fill(Role.MAFIA),
    Role.DOCTOR,
    Role.POLICE,
  ];
  while (roles.length < count) roles.push(Role.CITIZEN);
  return roles;
}

export function createGame({ players, config, rng = Math.random, now = 0 }) {
  const settings = mergeConfig(config);
  if (players.length < settings.minPlayers) throw new EngineError('NOT_ENOUGH_PLAYERS');
  if (players.length > settings.maxPlayers) throw new EngineError('TOO_MANY_PLAYERS');
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new EngineError('DUPLICATE_PLAYER');
  }

  const roles = shuffle(buildRoles(players.length, settings), rng);
  const game = {
    config: settings,
    rng,
    phase: Phase.NIGHT,
    day: 1,
    deadline: null,
    players: players.map((p, index) => ({
      id: p.id,
      name: p.name,
      isBot: Boolean(p.isBot),
      role: roles[index],
      alive: true,
      revealed: false,
      missed: 0,
    })),
    nightActions: {},
    votes: {},
    revotes: {},
    skipVotes: {},
    accused: null,
    accusedVoters: [],
    defenseUsed: [],
    consecutiveTies: 0,
    voteResult: null,
    report: null,
    winner: null,
    events: [],
  };
  schedule(game, Phase.NIGHT, now);
  return game;
}

function nightAction(game, player, action) {
  if (action.type !== 'night') return fail('WRONG_ACTION');
  const target = action.target ?? null;
  if (target !== null) {
    const targetPlayer = findPlayer(game, target);
    if (!targetPlayer || !targetPlayer.alive) return fail('INVALID_TARGET');
    if (player.role === Role.MAFIA && targetPlayer.role === Role.MAFIA) {
      return fail('INVALID_TARGET');
    }
    if (player.role === Role.POLICE && targetPlayer.id === player.id) {
      return fail('INVALID_TARGET');
    }
  }
  game.nightActions[player.id] = target;
  return ok();
}

function voteAction(game, player, action) {
  if (action.type !== 'vote') return fail('WRONG_ACTION');
  const target = action.target ?? null;
  if (target !== null) {
    const targetPlayer = findPlayer(game, target);
    if (!targetPlayer || !targetPlayer.alive || targetPlayer.id === player.id) {
      return fail('INVALID_TARGET');
    }
  }
  game.votes[player.id] = target;
  return ok();
}

function revoteAction(game, player, action) {
  if (action.type !== 'revote') return fail('WRONG_ACTION');
  if (!game.accusedVoters.includes(player.id)) return fail('NOT_ELIGIBLE');
  if (action.choice !== 'keep' && action.choice !== 'switch') return fail('INVALID_CHOICE');
  game.revotes[player.id] = action.choice;
  return ok();
}

function skipAction(game, player, action) {
  if (action.type !== 'skip') return fail('WRONG_ACTION');
  game.skipVotes[player.id] = action.agree !== false;
  return ok();
}

const handlers = {
  [Phase.NIGHT]: nightAction,
  [Phase.DISCUSSION]: skipAction,
  [Phase.VOTE]: voteAction,
  [Phase.REVOTE]: revoteAction,
};

const has = (object, key) => Object.hasOwn(object, key);

const aliveHumans = (game) => alivePlayers(game).filter((p) => !p.isBot);

function skipAgreed(game) {
  const humans = aliveHumans(game);
  return humans.length > 0 && humans.every((p) => game.skipVotes[p.id] === true);
}

export function skipStatus(game, playerId) {
  const humans = aliveHumans(game);
  return {
    needed: humans.length,
    agreed: humans.filter((p) => game.skipVotes[p.id] === true).length,
    mine: game.skipVotes[playerId] === true,
  };
}

function isComplete(game) {
  switch (game.phase) {
    case Phase.NIGHT:
      return alivePlayers(game).every((p) => has(game.nightActions, p.id));
    case Phase.DISCUSSION:
      return skipAgreed(game);
    case Phase.VOTE:
      return alivePlayers(game).every((p) => has(game.votes, p.id));
    case Phase.REVOTE:
      return game.accusedVoters.every((id) => has(game.revotes, id));
    default:
      return false;
  }
}

export function awaitingAction(game, playerId) {
  const player = findPlayer(game, playerId);
  if (!player || !player.alive) return false;
  switch (game.phase) {
    case Phase.NIGHT:
      return !has(game.nightActions, playerId);
    case Phase.VOTE:
      return !has(game.votes, playerId);
    case Phase.REVOTE:
      return game.accusedVoters.includes(playerId) && !has(game.revotes, playerId);
    default:
      return false;
  }
}

export function submit(game, playerId, action, now) {
  const player = findPlayer(game, playerId);
  if (!player) return fail('NOT_IN_GAME');
  if (game.phase === Phase.ENDED) return fail('GAME_ENDED');
  if (!player.alive) return fail('DEAD');
  if (!action || typeof action !== 'object') return fail('INVALID_ACTION');
  const handler = handlers[game.phase];
  if (!handler) return fail('WRONG_PHASE');
  const result = handler(game, player, action);
  if (result.error) return result;
  if (isComplete(game)) advance(game, now);
  return ok();
}

function tally(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

function leaders(counts) {
  if (counts.size === 0) return [];
  const top = Math.max(...counts.values());
  return [...counts].filter(([, count]) => count === top).map(([id]) => id);
}

function trackMissed(players, submitted) {
  players.forEach((p) => {
    p.missed = submitted(p) ? 0 : p.missed + 1;
  });
}

function endGame(game, winner, reason) {
  game.winner = winner;
  game.phase = Phase.ENDED;
  game.deadline = null;
  emit(game, 'game.over', { winner, reason });
}

function checkWin(game) {
  const alive = alivePlayers(game);
  const mafia = alive.filter((p) => p.role === Role.MAFIA).length;
  const others = alive.length - mafia;
  if (mafia === 0) {
    endGame(game, 'citizens', 'mafia_eliminated');
    return true;
  }
  if (mafia >= others) {
    endGame(game, 'mafia', 'mafia_majority');
    return true;
  }
  return false;
}

function nextNight(game, now) {
  game.day += 1;
  game.nightActions = {};
  game.votes = {};
  game.revotes = {};
  game.skipVotes = {};
  game.accused = null;
  game.accusedVoters = [];
  game.voteResult = null;
  game.report = null;
  schedule(game, Phase.NIGHT, now);
}

function resolveNight(game, now) {
  const players = alivePlayers(game);
  trackMissed(players, (p) => has(game.nightActions, p.id));

  const mafia = players.filter((p) => p.role === Role.MAFIA);
  const doctor = players.find((p) => p.role === Role.DOCTOR);
  const police = players.find((p) => p.role === Role.POLICE);

  const mafiaTargets = mafia
    .map((p) => game.nightActions[p.id] ?? null)
    .filter((target) => target !== null);
  const chosen = pick(leaders(tally(mafiaTargets)), game.rng) ?? null;
  const healed = doctor ? game.nightActions[doctor.id] ?? null : null;
  const suspect = police ? game.nightActions[police.id] ?? null : null;

  const victimId = chosen !== null && chosen !== healed ? chosen : null;
  let policeResult = 'none';
  if (suspect !== null) {
    policeResult = findPlayer(game, suspect).role === Role.MAFIA ? 'right' : 'wrong';
  }

  game.report = { victimId, policeResult };

  if (victimId !== null) {
    const victim = findPlayer(game, victimId);
    victim.alive = false;
    victim.revealed = game.config.revealRoleOnNightDeath;
    emit(game, 'night.died', victim.revealed ? { playerId: victimId, role: victim.role } : { playerId: victimId });
  } else {
    emit(game, 'night.nobody_died');
  }
  if (policeResult !== 'none') emit(game, `police.${policeResult}`);

  if (!checkWin(game)) schedule(game, Phase.REPORT, now);
}

function kick(game, playerId, now) {
  const player = findPlayer(game, playerId);
  player.alive = false;
  player.revealed = true;
  game.consecutiveTies = 0;
  emit(game, 'vote.kicked', { playerId, role: player.role });
  if (!checkWin(game)) nextNight(game, now);
}

function resolveVote(game, now) {
  const voters = alivePlayers(game);
  trackMissed(voters, (p) => has(game.votes, p.id));

  const counts = tally(Object.values(game.votes).filter((target) => target !== null));
  game.voteResult = { counts: Object.fromEntries(counts), accusedId: null };

  const top = leaders(counts);
  if (top.length !== 1) {
    game.consecutiveTies += 1;
    emit(game, 'vote.tied');
    if (game.consecutiveTies >= game.config.maxConsecutiveTies) {
      endGame(game, 'mafia', 'stalemate');
      return;
    }
    nextNight(game, now);
    return;
  }

  const accusedId = top[0];
  game.accused = accusedId;
  game.voteResult.accusedId = accusedId;
  game.accusedVoters = Object.entries(game.votes)
    .filter(([, target]) => target === accusedId)
    .map(([id]) => id);
  emit(game, 'vote.accused', { playerId: accusedId });

  const used = game.defenseUsed.filter((id) => id === accusedId).length;
  if (used >= game.config.defensePerPlayer) {
    kick(game, accusedId, now);
    return;
  }
  schedule(game, Phase.DEFENSE, now);
}

function resolveRevote(game, now) {
  trackMissed(
    game.accusedVoters.map((id) => findPlayer(game, id)),
    (p) => has(game.revotes, p.id),
  );
  const switched = Object.values(game.revotes).filter((choice) => choice === 'switch').length;
  const accusedId = game.accused;

  if (switched * 2 > game.accusedVoters.length) {
    game.defenseUsed.push(accusedId);
    emit(game, 'defense.spared', { playerId: accusedId });
    nextNight(game, now);
    return;
  }
  kick(game, accusedId, now);
}

export function advance(game, now) {
  switch (game.phase) {
    case Phase.NIGHT:
      resolveNight(game, now);
      break;
    case Phase.REPORT:
      game.skipVotes = {};
      schedule(game, Phase.DISCUSSION, now);
      break;
    case Phase.DISCUSSION:
      if (skipAgreed(game)) emit(game, 'discussion.skipped');
      game.votes = {};
      schedule(game, Phase.VOTE, now);
      break;
    case Phase.VOTE:
      resolveVote(game, now);
      break;
    case Phase.DEFENSE:
      game.revotes = {};
      schedule(game, Phase.REVOTE, now);
      break;
    case Phase.REVOTE:
      resolveRevote(game, now);
      break;
    default:
      break;
  }
}

export function tick(game, now) {
  while (game.phase !== Phase.ENDED && game.deadline !== null && now >= game.deadline) {
    advance(game, now);
  }
}
