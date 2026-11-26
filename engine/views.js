import { Phase, Role, findPlayer, awaitingAction, skipStatus } from './engine.js';

function canSeeRole(game, viewer, target) {
  if (game.phase === Phase.ENDED) return true;
  if (target.id === viewer.id || target.revealed) return true;
  if (!viewer.alive) return true;
  return viewer.role === Role.MAFIA && target.role === Role.MAFIA;
}

function publicVoteResult(game) {
  if (!game.voteResult) return null;
  const { counts, accusedId, tie, voters } = game.voteResult;
  return game.config.publicVotes ? { counts, accusedId, tie, voters } : { counts, accusedId, tie };
}

export function spectatorView(game) {
  const alive = (p) => p.alive;
  return {
    spectator: true,
    phase: game.phase,
    day: game.day,
    deadline: game.deadline,
    winner: game.winner,
    me: { id: null, role: null, alive: false, awaitingAction: false, nightChoice: null, voteChoice: null },
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      alive: alive(p),
      role: game.phase === Phase.ENDED || p.revealed ? p.role : null,
    })),
    report: game.report,
    accused: game.accused,
    voteCounts: game.voteResult ? game.voteResult.counts : null,
    voteResult: publicVoteResult(game),
    canRevote: false,
    skip: null,
    recap: game.phase === Phase.ENDED ? game.history : null,
    events: game.events,
  };
}

export function viewFor(game, viewerId) {
  const viewer = findPlayer(game, viewerId);
  if (!viewer) return null;

  return {
    phase: game.phase,
    day: game.day,
    deadline: game.deadline,
    winner: game.winner,
    me: {
      id: viewer.id,
      role: viewer.role,
      alive: viewer.alive,
      awaitingAction: awaitingAction(game, viewerId),
      nightChoice: game.nightActions[viewerId] ?? null,
      voteChoice: game.votes[viewerId] ?? null,
    },
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      alive: p.alive,
      role: canSeeRole(game, viewer, p) ? p.role : null,
    })),
    report: game.report,
    accused: game.accused,
    voteCounts: game.voteResult ? game.voteResult.counts : null,
    voteResult: publicVoteResult(game),
    recap: game.phase === Phase.ENDED ? game.history : null,
    canRevote: game.phase === Phase.REVOTE && game.accusedVoters.includes(viewerId),
    skip: game.phase === Phase.DISCUSSION ? skipStatus(game, viewerId) : null,
    events: game.events,
  };
}
