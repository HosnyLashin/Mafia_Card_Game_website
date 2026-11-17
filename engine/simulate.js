import { createGame, submit, tick, alivePlayers, Phase, Role } from './engine.js';
import { botAction } from './bots.js';
import { createRng } from './rng.js';

const ACTION_PHASES = new Set([Phase.NIGHT, Phase.VOTE, Phase.REVOTE]);

function assertInvariants(game) {
  const alive = alivePlayers(game);
  const mafia = alive.filter((p) => p.role === Role.MAFIA).length;
  if (game.phase === Phase.ENDED) {
    if (!game.winner) throw new Error('ended without winner');
  } else {
    if (game.winner) throw new Error('winner while running');
    if (mafia === 0) throw new Error('running without mafia');
    if (mafia >= alive.length - mafia) throw new Error('running past mafia majority');
    if (game.deadline === null) throw new Error('running without deadline');
  }
}

export function simulateGame(seed, { afkRate = 0 } = {}) {
  const rng = createRng(seed);
  const count = 6 + Math.floor(rng() * 7);
  const players = Array.from({ length: count }, (_, i) => ({
    id: `b${i + 1}`,
    name: `Bot ${i + 1}`,
    isBot: true,
  }));
  const game = createGame({ players, rng, now: 0 });

  let steps = 0;
  while (game.phase !== Phase.ENDED) {
    if (steps++ > 2000) throw new Error(`stuck game seed=${seed}`);
    const before = `${game.phase}:${game.day}`;

    if (ACTION_PHASES.has(game.phase)) {
      for (const player of [...alivePlayers(game)]) {
        if (game.phase === Phase.ENDED || `${game.phase}:${game.day}` !== before) break;
        if (rng() < afkRate) continue;
        const action = botAction(game, player.id, rng);
        if (!action) continue;
        const result = submit(game, player.id, action, game.deadline);
        if (result.error) throw new Error(`bad bot action ${result.error} seed=${seed}`);
      }
    }

    if (game.phase !== Phase.ENDED && `${game.phase}:${game.day}` === before) {
      tick(game, game.deadline);
    }
    assertInvariants(game);
  }
  return { game, count };
}

function run(total, afkRate) {
  const stats = { total, mafia: 0, citizens: 0, stalemates: 0, days: 0, spared: 0, byCount: {} };
  for (let seed = 1; seed <= total; seed++) {
    const { game, count } = simulateGame(seed, { afkRate });
    const over = game.events.find((e) => e.key === 'game.over');
    stats[game.winner] += 1;
    stats.days += game.day;
    if (over.params.reason === 'stalemate') stats.stalemates += 1;
    stats.spared += game.events.filter((e) => e.key === 'defense.spared').length;
    stats.byCount[count] ??= { games: 0, mafia: 0 };
    stats.byCount[count].games += 1;
    if (game.winner === 'mafia') stats.byCount[count].mafia += 1;
  }
  return stats;
}

function report(label, stats) {
  const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;
  console.log(`\n${label}`);
  console.log(`games: ${stats.total}`);
  console.log(`mafia wins: ${pct(stats.mafia, stats.total)}`);
  console.log(`citizens wins: ${pct(stats.citizens, stats.total)}`);
  console.log(`stalemate endings: ${stats.stalemates}`);
  console.log(`average days: ${(stats.days / stats.total).toFixed(2)}`);
  console.log(`defenses that spared: ${stats.spared}`);
  Object.keys(stats.byCount)
    .sort((a, b) => a - b)
    .forEach((count) => {
      const row = stats.byCount[count];
      console.log(`  ${count} players: ${row.games} games, mafia ${pct(row.mafia, row.games)}`);
    });
}

if (process.argv[1] && process.argv[1].endsWith('simulate.js')) {
  const total = Number(process.argv[2] ?? 2000);
  report('all bots act every phase', run(total, 0));
  report('30% of actions skipped (AFK)', run(total, 0.3));
}
