import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submit, tick, alivePlayers, findPlayer, awaitingAction, Phase } from '../engine/engine.js';
import { viewFor } from '../engine/views.js';
import { createRng } from '../engine/rng.js';

function makeGame({ count = 6, roles = {}, config = {}, seed = 1 } = {}) {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
  const game = createGame({ players, config, rng: createRng(seed), now: 0 });
  const defaults = { p1: 'mafia', p2: 'doctor', p3: 'police' };
  game.players.forEach((p) => {
    p.role = roles[p.id] ?? defaults[p.id] ?? 'citizen';
  });
  return game;
}

function nightWith(game, picks = {}) {
  for (const player of [...alivePlayers(game)]) {
    if (game.phase !== Phase.NIGHT) break;
    submit(game, player.id, { type: 'night', target: picks[player.id] ?? null }, game.deadline);
  }
}

function goto(game, phase) {
  let guard = 0;
  while (game.phase !== phase && game.phase !== Phase.ENDED) {
    assert.ok(guard++ < 20, 'phase never reached');
    tick(game, game.deadline);
  }
}

function voteWith(game, picks = {}) {
  for (const player of [...alivePlayers(game)]) {
    if (game.phase !== Phase.VOTE) break;
    submit(game, player.id, { type: 'vote', target: picks[player.id] ?? null }, game.deadline);
  }
}

function passDay(game) {
  nightWith(game);
  goto(game, Phase.VOTE);
  voteWith(game);
}

test('creation enforces minimum players and assigns roles', () => {
  const rng = createRng(7);
  const few = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, name: 'x' }));
  assert.throws(() => createGame({ players: few, rng }), { code: 'NOT_ENOUGH_PLAYERS' });

  const count = (game, role) => game.players.filter((p) => p.role === role).length;
  const six = createGame({ players: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, name: 'a' })), rng });
  assert.equal(count(six, 'mafia'), 1);
  assert.equal(count(six, 'doctor'), 1);
  assert.equal(count(six, 'police'), 1);
  assert.equal(count(six, 'citizen'), 3);

  const nine = createGame({ players: Array.from({ length: 9 }, (_, i) => ({ id: `b${i}`, name: 'b' })), rng });
  assert.equal(count(nine, 'mafia'), 2);
});

test('duplicate ids are rejected', () => {
  const players = Array.from({ length: 6 }, () => ({ id: 'same', name: 'x' }));
  assert.throws(() => createGame({ players }), { code: 'DUPLICATE_PLAYER' });
});

test('unhealed target dies at night', () => {
  const game = makeGame();
  nightWith(game, { p1: 'p4', p2: 'p5' });
  assert.equal(findPlayer(game, 'p4').alive, false);
  assert.equal(game.report.victimId, 'p4');
  assert.equal(game.phase, Phase.REPORT);
  assert.ok(game.events.some((e) => e.key === 'night.died' && e.params.playerId === 'p4'));
});

test('doctor heal cancels the kill', () => {
  const game = makeGame();
  nightWith(game, { p1: 'p4', p2: 'p4' });
  assert.equal(alivePlayers(game).length, 6);
  assert.equal(game.report.victimId, null);
  assert.ok(game.events.some((e) => e.key === 'night.nobody_died'));
});

test('doctor can heal themselves', () => {
  const game = makeGame();
  nightWith(game, { p1: 'p2', p2: 'p2' });
  assert.equal(findPlayer(game, 'p2').alive, true);
});

test('doctor can heal the same player on consecutive nights', () => {
  const game = makeGame();
  nightWith(game, { p1: 'p4', p2: 'p4' });
  passDay(game);
  assert.equal(game.phase, Phase.NIGHT);
  assert.equal(game.day, 2);
  const result = submit(game, 'p2', { type: 'night', target: 'p4' }, game.deadline);
  assert.deepEqual(result, { ok: true });
  nightWith(game, { p1: 'p4', p2: 'p4' });
  assert.equal(findPlayer(game, 'p4').alive, true);
});

test('police result is public as right, wrong or none', () => {
  const right = makeGame();
  nightWith(right, { p3: 'p1' });
  assert.equal(right.report.policeResult, 'right');
  assert.ok(right.events.some((e) => e.key === 'police.right'));

  const wrong = makeGame();
  nightWith(wrong, { p3: 'p4' });
  assert.equal(wrong.report.policeResult, 'wrong');
  assert.ok(wrong.events.some((e) => e.key === 'police.wrong'));

  const none = makeGame();
  nightWith(none);
  assert.equal(none.report.policeResult, 'none');
});

test('police report does not name the suspect', () => {
  const game = makeGame();
  nightWith(game, { p3: 'p1' });
  const policeEvent = game.events.find((e) => e.key === 'police.right');
  assert.deepEqual(policeEvent.params, {});
});

test('night actions are validated', () => {
  const game = makeGame({ count: 9, roles: { p9: 'mafia' } });
  assert.deepEqual(submit(game, 'p1', { type: 'night', target: 'p9' }, 0), { error: 'INVALID_TARGET' });
  assert.deepEqual(submit(game, 'p3', { type: 'night', target: 'p3' }, 0), { error: 'INVALID_TARGET' });
  assert.deepEqual(submit(game, 'p4', { type: 'night', target: 'nobody' }, 0), { error: 'INVALID_TARGET' });
  assert.deepEqual(submit(game, 'p4', { type: 'vote', target: 'p5' }, 0), { error: 'WRONG_ACTION' });
  assert.deepEqual(submit(game, 'ghost', { type: 'night', target: 'p5' }, 0), { error: 'NOT_IN_GAME' });
  assert.deepEqual(submit(game, 'p4', null, 0), { error: 'INVALID_ACTION' });
});

test('dead players and wrong phases are rejected', () => {
  const game = makeGame();
  nightWith(game, { p1: 'p4' });
  assert.equal(game.phase, Phase.REPORT);
  assert.deepEqual(submit(game, 'p5', { type: 'night', target: null }, 0), { error: 'WRONG_PHASE' });
  goto(game, Phase.VOTE);
  assert.deepEqual(submit(game, 'p4', { type: 'vote', target: 'p5' }, 0), { error: 'DEAD' });
  assert.deepEqual(submit(game, 'p5', { type: 'vote', target: 'p5' }, 0), { error: 'INVALID_TARGET' });
});

test('night ends early when everyone has acted', () => {
  const game = makeGame();
  const deadline = game.deadline;
  for (const player of game.players) {
    assert.equal(game.phase, Phase.NIGHT);
    submit(game, player.id, { type: 'night', target: null }, 1000);
  }
  assert.equal(game.phase, Phase.REPORT);
  assert.ok(1000 < deadline);
});

test('night resolves at the deadline and skips absent players', () => {
  const game = makeGame();
  submit(game, 'p1', { type: 'night', target: 'p4' }, 1000);
  submit(game, 'p2', { type: 'night', target: 'p5' }, 1000);
  assert.equal(game.phase, Phase.NIGHT);
  tick(game, game.deadline - 1);
  assert.equal(game.phase, Phase.NIGHT);
  tick(game, game.deadline);
  assert.equal(game.phase, Phase.REPORT);
  assert.equal(findPlayer(game, 'p4').alive, false);
  assert.equal(findPlayer(game, 'p1').missed, 0);
  assert.equal(findPlayer(game, 'p3').missed, 1);
});

test('missed counter resets after the player acts again', () => {
  const game = makeGame();
  tick(game, game.deadline);
  assert.equal(findPlayer(game, 'p5').missed, 1);
  goto(game, Phase.VOTE);
  voteWith(game);
  nightWith(game);
  assert.equal(findPlayer(game, 'p5').missed, 0);
});

test('mafia wins when it equals the rest', () => {
  const game = makeGame();
  ['p4', 'p5', 'p6'].forEach((id) => {
    findPlayer(game, id).alive = false;
  });
  nightWith(game, { p1: 'p2' });
  assert.equal(game.phase, Phase.ENDED);
  assert.equal(game.winner, 'mafia');
});

test('citizens win when the mafia is kicked', () => {
  const game = makeGame();
  nightWith(game);
  goto(game, Phase.VOTE);
  voteWith(game, { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p1', p5: 'p1', p6: 'p1' });
  assert.equal(game.phase, Phase.DEFENSE);
  assert.equal(game.accused, 'p1');
  goto(game, Phase.REVOTE);
  tick(game, game.deadline);
  assert.equal(game.phase, Phase.ENDED);
  assert.equal(game.winner, 'citizens');
  assert.equal(findPlayer(game, 'p1').revealed, true);
});

test('a tied vote kicks nobody', () => {
  const game = makeGame();
  nightWith(game);
  goto(game, Phase.VOTE);
  voteWith(game, { p1: 'p2', p2: 'p1' });
  assert.equal(game.phase, Phase.NIGHT);
  assert.equal(game.day, 2);
  assert.equal(alivePlayers(game).length, 6);
  assert.equal(game.consecutiveTies, 1);
  assert.ok(game.events.some((e) => e.key === 'vote.tied'));
});

test('too many consecutive ties end the game as a mafia win', () => {
  const game = makeGame({ config: { maxConsecutiveTies: 2 } });
  passDay(game);
  assert.equal(game.phase, Phase.NIGHT);
  passDay(game);
  assert.equal(game.phase, Phase.ENDED);
  assert.equal(game.winner, 'mafia');
  const over = game.events.find((e) => e.key === 'game.over');
  assert.equal(over.params.reason, 'stalemate');
});

test('a successful defense spares the accused who then plays on', () => {
  const game = makeGame();
  nightWith(game);
  goto(game, Phase.VOTE);
  voteWith(game, { p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p1', p5: 'p4', p6: 'p4' });
  assert.equal(game.phase, Phase.DEFENSE);
  goto(game, Phase.REVOTE);
  assert.deepEqual(game.accusedVoters.sort(), ['p1', 'p2', 'p3', 'p5', 'p6']);
  ['p1', 'p2', 'p3'].forEach((id) => submit(game, id, { type: 'revote', choice: 'switch' }, game.deadline));
  ['p5', 'p6'].forEach((id) => submit(game, id, { type: 'revote', choice: 'keep' }, game.deadline));
  assert.equal(game.phase, Phase.NIGHT);
  assert.equal(findPlayer(game, 'p4').alive, true);
  assert.ok(game.events.some((e) => e.key === 'defense.spared'));
});

test('a failed defense kicks the accused and reveals the role', () => {
  const game = makeGame();
  nightWith(game);
  goto(game, Phase.VOTE);
  voteWith(game, { p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p1', p5: 'p4', p6: 'p4' });
  goto(game, Phase.REVOTE);
  ['p1', 'p2'].forEach((id) => submit(game, id, { type: 'revote', choice: 'switch' }, game.deadline));
  ['p3', 'p5', 'p6'].forEach((id) => submit(game, id, { type: 'revote', choice: 'keep' }, game.deadline));
  assert.equal(findPlayer(game, 'p4').alive, false);
  assert.equal(findPlayer(game, 'p4').revealed, true);
  assert.equal(game.consecutiveTies, 0);
});

test('a player cannot use the defense twice', () => {
  const game = makeGame();
  const votes = { p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p1', p5: 'p4', p6: 'p4' };
  nightWith(game);
  goto(game, Phase.VOTE);
  voteWith(game, votes);
  goto(game, Phase.REVOTE);
  ['p1', 'p2', 'p3', 'p5', 'p6'].forEach((id) => submit(game, id, { type: 'revote', choice: 'switch' }, game.deadline));
  assert.equal(game.phase, Phase.NIGHT);
  nightWith(game);
  goto(game, Phase.VOTE);
  voteWith(game, votes);
  assert.equal(findPlayer(game, 'p4').alive, false);
  assert.notEqual(game.phase, Phase.DEFENSE);
});

test('only voters of the accused can revote', () => {
  const game = makeGame();
  nightWith(game);
  goto(game, Phase.VOTE);
  voteWith(game, { p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p1', p5: 'p4', p6: 'p4' });
  goto(game, Phase.REVOTE);
  assert.deepEqual(submit(game, 'p4', { type: 'revote', choice: 'keep' }, 0), { error: 'NOT_ELIGIBLE' });
  assert.deepEqual(submit(game, 'p1', { type: 'revote', choice: 'maybe' }, 0), { error: 'INVALID_CHOICE' });
});

test('with two mafia the kill follows the plurality', () => {
  const agree = makeGame({ count: 9, roles: { p9: 'mafia' } });
  nightWith(agree, { p1: 'p4', p9: 'p4' });
  assert.equal(findPlayer(agree, 'p4').alive, false);

  const split = makeGame({ count: 9, roles: { p9: 'mafia' } });
  nightWith(split, { p1: 'p4', p9: 'p5' });
  const dead = ['p4', 'p5'].filter((id) => !findPlayer(split, id).alive);
  assert.equal(dead.length, 1);
});

test('views hide roles from living players', () => {
  const game = makeGame();
  const view = viewFor(game, 'p4');
  assert.equal(view.me.role, 'citizen');
  assert.equal(view.players.find((p) => p.id === 'p1').role, null);
  assert.equal(view.players.find((p) => p.id === 'p4').role, 'citizen');
  const text = JSON.stringify(view);
  assert.ok(!text.includes('nightActions'));
  assert.ok(!text.includes('"mafia"'));
});

test('mafia see each other and dead players see everything', () => {
  const game = makeGame({ count: 9, roles: { p9: 'mafia' } });
  const mafiaView = viewFor(game, 'p1');
  assert.equal(mafiaView.players.find((p) => p.id === 'p9').role, 'mafia');
  assert.equal(mafiaView.players.find((p) => p.id === 'p4').role, null);

  nightWith(game, { p1: 'p4' });
  const deadView = viewFor(game, 'p4');
  assert.equal(deadView.players.find((p) => p.id === 'p1').role, 'mafia');
  assert.equal(deadView.players.find((p) => p.id === 'p2').role, 'doctor');
});

test('every dead player is revealed to everyone, including night victims', () => {
  const game = makeGame();
  nightWith(game, { p1: 'p4' });
  assert.equal(viewFor(game, 'p5').players.find((p) => p.id === 'p4').role, 'citizen');
  const died = game.events.find((e) => e.key === 'night.died');
  assert.deepEqual(died.params, { playerId: 'p4', role: 'citizen' });
  goto(game, Phase.VOTE);
  voteWith(game, { p1: 'p5', p2: 'p5', p3: 'p5', p5: 'p1', p6: 'p5' });
  goto(game, Phase.REVOTE);
  tick(game, game.deadline);
  assert.equal(viewFor(game, 'p6').players.find((p) => p.id === 'p5').role, 'citizen');
  assert.equal(viewFor(game, 'p6').players.find((p) => p.id === 'p1').role, null);
});

test('night victim roles can be hidden through config', () => {
  const game = makeGame({ config: { revealRoleOnNightDeath: false } });
  nightWith(game, { p1: 'p4' });
  assert.equal(viewFor(game, 'p5').players.find((p) => p.id === 'p4').role, null);
  const died = game.events.find((e) => e.key === 'night.died');
  assert.deepEqual(died.params, { playerId: 'p4' });
});

test('the vote tally is hidden until the vote resolves', () => {
  const game = makeGame();
  nightWith(game);
  goto(game, Phase.VOTE);
  submit(game, 'p2', { type: 'vote', target: 'p4' }, 0);
  assert.equal(viewFor(game, 'p5').voteCounts, null);
  assert.equal(viewFor(game, 'p5').me.voteChoice, null);
  assert.equal(viewFor(game, 'p2').me.voteChoice, 'p4');
});

test('awaiting action reflects the phase', () => {
  const game = makeGame();
  assert.equal(awaitingAction(game, 'p4'), true);
  submit(game, 'p4', { type: 'night', target: null }, 0);
  assert.equal(awaitingAction(game, 'p4'), false);
  assert.equal(awaitingAction(game, 'p5'), true);
  nightWith(game);
  assert.equal(awaitingAction(game, 'p5'), false);
});

test('phases advance on schedule with the configured durations', () => {
  const game = makeGame({ config: { seconds: { night: 10, report: 2, discussion: 120, vote: 5 } } });
  assert.equal(game.deadline, 10000);
  tick(game, 10000);
  assert.equal(game.phase, Phase.REPORT);
  assert.equal(game.deadline, 12000);
  tick(game, 12000);
  assert.equal(game.phase, Phase.DISCUSSION);
  assert.equal(game.deadline, 132000);
  tick(game, 132000);
  assert.equal(game.phase, Phase.VOTE);
  assert.equal(game.deadline, 137000);
});

test('actions are refused after the game ends', () => {
  const game = makeGame();
  ['p4', 'p5', 'p6'].forEach((id) => {
    findPlayer(game, id).alive = false;
  });
  nightWith(game, { p1: 'p2' });
  assert.equal(game.phase, Phase.ENDED);
  assert.deepEqual(submit(game, 'p1', { type: 'night', target: null }, 0), { error: 'GAME_ENDED' });
  assert.equal(viewFor(game, 'p3').players.find((p) => p.id === 'p1').role, 'mafia');
});
