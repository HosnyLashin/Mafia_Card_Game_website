import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submit, tick, alivePlayers, findPlayer, Phase } from '../engine/engine.js';
import { createBotTeam } from '../engine/bots.js';
import { LINE_CATEGORIES, LINE_VARIANTS } from '../engine/botlines.js';
import { createRng } from '../engine/rng.js';
import { simulateGame } from '../engine/simulate.js';
import { BOT_NAMES } from '../engine/botnames.js';
import { QUICK_IDS } from '../engine/quick.js';
import { AVATARS, COLORS, cleanProfile } from '../profile.js';

function botGame({ count = 6, roles = {}, humans = [], seed = 3, names = {} } = {}) {
  const players = Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: names[`p${i + 1}`] ?? `P${i + 1}`,
    isBot: !humans.includes(`p${i + 1}`),
  }));
  const rng = createRng(seed);
  const game = createGame({ players, rng, now: 0 });
  const defaults = { p1: 'mafia', p2: 'doctor', p3: 'police' };
  game.players.forEach((p) => {
    p.role = roles[p.id] ?? defaults[p.id] ?? 'citizen';
  });
  return { game, team: createBotTeam(game, rng), rng };
}

function botsAct(game, team, except = {}) {
  for (const player of [...alivePlayers(game)]) {
    const phase = game.phase;
    if (except[player.id]) {
      submit(game, player.id, except[player.id], game.deadline);
    } else if (player.isBot) {
      const action = team.act(player.id);
      if (action) submit(game, player.id, action, game.deadline);
    }
    if (game.phase !== phase) break;
  }
}

function quietNight(game) {
  for (const player of [...alivePlayers(game)]) {
    submit(game, player.id, { type: 'night', target: null }, game.deadline);
  }
}

function goto(game, team, phase) {
  let guard = 0;
  while (game.phase !== phase && game.phase !== Phase.ENDED) {
    assert.ok(guard++ < 30, 'phase never reached');
    team.sync();
    tick(game, game.deadline);
  }
  team.sync();
}

const say = (team, game, playerId, text, phase = game.phase) =>
  team.observeChat({ playerId, text, day: game.day, phase });

test('bots only ever make legal moves and games always finish', () => {
  let stalemates = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const { game } = simulateGame(seed, { afkRate: 0.1 });
    assert.ok(game.winner);
    if (game.events.some((e) => e.key === 'game.over' && e.params.reason === 'stalemate')) stalemates += 1;
  }
  assert.ok(stalemates < 8, `too many stalemates: ${stalemates}`);
});

test('a police bot that finds the mafia remembers it, votes for it and pushes without revealing itself', () => {
  const { game, team } = botGame();
  botsAct(game, team, { p3: { type: 'night', target: 'p1' } });
  goto(game, team, Phase.REPORT);
  assert.equal(game.report.policeResult, 'right');
  assert.ok(team.knowledge('p3').known.has('p1'));
  goto(game, team, Phase.DISCUSSION);
  const line = team.nextLine('p3');
  assert.equal(line.key, 'sure');
  assert.deepEqual(line.params, { target: 'p1' });
  goto(game, team, Phase.VOTE);
  assert.deepEqual(team.act('p3'), { type: 'vote', target: 'p1' });
});

test('a cleared player is never voted for by the police bot', () => {
  const { game, team } = botGame();
  botsAct(game, team, { p3: { type: 'night', target: 'p4' } });
  goto(game, team, Phase.REPORT);
  assert.equal(game.report.policeResult, 'wrong');
  assert.ok(team.knowledge('p3').cleared.has('p4'));
  goto(game, team, Phase.DISCUSSION);
  let announced = null;
  for (let i = 0; i < 40 && !announced; i++) {
    const line = team.nextLine('p3');
    if (line?.key === 'vouch') announced = line;
  }
  assert.ok(announced);
  assert.deepEqual(announced.params, { target: 'p4' });
  say(team, game, 'p5', 'I think P4 is the mafia');
  say(team, game, 'p6', 'P4 is acting strange');
  goto(game, team, Phase.VOTE);
  for (let i = 0; i < 30; i++) assert.notEqual(team.act('p3').target, 'p4');
});

test('mafia bots pick the same victim and never a partner', () => {
  const { game, team } = botGame({ count: 11, roles: { p1: 'mafia', p2: 'mafia', p3: 'doctor', p4: 'police' } });
  const first = team.act('p1');
  const second = team.act('p2');
  assert.equal(first.target, second.target);
  assert.ok(!['p1', 'p2'].includes(first.target));
  botsAct(game, team);
  goto(game, team, Phase.VOTE);
  const votes = [team.act('p1'), team.act('p2')];
  assert.equal(votes[0].target, votes[1].target);
  assert.ok(!['p1', 'p2'].includes(votes[0].target));
});

test('a mafia bot never votes for or kills its human partner', () => {
  const { game, team } = botGame({ count: 8, roles: { p1: 'mafia', p2: 'mafia' }, humans: ['p1'] });
  for (let i = 0; i < 40; i++) assert.notEqual(team.act('p2').target, 'p1');
  botsAct(game, team);
  goto(game, team, Phase.VOTE);
  for (let i = 0; i < 40; i++) assert.notEqual(team.act('p2').target, 'p1');
});

test('citizen bots follow what a human accuses in the chat', () => {
  const { game, team } = botGame({ humans: ['p1'] });
  botsAct(game, team);
  goto(game, team, Phase.DISCUSSION);
  say(team, game, 'p1', 'I am sure P4 is the mafia');
  goto(game, team, Phase.VOTE);
  const voters = ['p2', 'p3', 'p5', 'p6'];
  const picks = voters.map((id) => team.act(id).target);
  assert.ok(picks.filter((target) => target === 'p4').length >= 3, picks.join());
});

test('players who stay silent look more suspicious', () => {
  const { game, team } = botGame({ humans: ['p1'], roles: { p1: 'citizen', p2: 'mafia', p3: 'doctor', p4: 'police' } });
  botsAct(game, team);
  goto(game, team, Phase.DISCUSSION);
  say(team, game, 'p1', 'hello');
  say(team, game, 'p3', 'hello', Phase.DISCUSSION);
  goto(game, team, Phase.VOTE);
  const average = (target) => Array.from({ length: 60 }, () => team.suspicion('p5', target)).reduce((a, b) => a + b, 0) / 60;
  assert.ok(average('p6') > average('p3') + 0.3);
});

test('the doctor bot protects a player who claims to be the police', () => {
  const { team } = botGame({ humans: ['p1'], roles: { p1: 'police', p2: 'doctor', p3: 'citizen', p4: 'mafia' } });
  say(team, { day: 1 }, 'p1', "I'm the police, listen to me", Phase.DISCUSSION);
  const counts = {};
  for (let i = 0; i < 400; i++) {
    const target = team.act('p2').target;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(best, 'p1');
  assert.ok(counts.p1 > 120);
});

test('mafia bots go after a player who claims to be the police', () => {
  const { team } = botGame({ humans: ['p1'], roles: { p1: 'police', p2: 'doctor', p3: 'mafia' } });
  say(team, { day: 1 }, 'p1', 'I am the police!', Phase.DISCUSSION);
  for (let i = 0; i < 20; i++) assert.equal(team.act('p3').target, 'p1');
});

test('a bot that is accused defends itself first', () => {
  const { game, team } = botGame({ humans: ['p1'] });
  botsAct(game, team);
  goto(game, team, Phase.DISCUSSION);
  say(team, game, 'p1', 'I think P2 is lying');
  const line = team.nextLine('p2');
  assert.equal(line.key, 'defend');
  assert.ok(line.variant >= 0 && line.variant < LINE_VARIANTS);
});

test('bot lines are valid, do not repeat within a day and stay quiet when dead', () => {
  const { game, team } = botGame();
  botsAct(game, team);
  goto(game, team, Phase.DISCUSSION);
  const speaker = alivePlayers(game).find((p) => p.role === 'citizen').id;
  const seen = new Set();
  const alive = new Set(alivePlayers(game).map((p) => p.id));
  for (let i = 0; i < 40; i++) {
    const line = team.nextLine(speaker);
    if (!line) continue;
    assert.ok(LINE_CATEGORIES.includes(line.key));
    assert.ok(line.variant >= 0 && line.variant < LINE_VARIANTS);
    if (line.key === 'mourn') assert.equal(line.params.target, game.report.victimId);
    else if (line.params.target) assert.ok(alive.has(line.params.target));
    const signature = `${line.key}:${line.params.target ?? ''}`;
    assert.ok(!seen.has(signature), signature);
    seen.add(signature);
  }
  assert.ok(seen.size > 2);
  findPlayer(game, speaker).alive = false;
  assert.equal(team.nextLine(speaker), null);
  assert.equal(team.act(speaker), null);
});

test('only the accused bot speaks during the defense', () => {
  const { game, team } = botGame();
  quietNight(game);
  goto(game, team, Phase.VOTE);
  const votes = { p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p1', p5: 'p4', p6: 'p4' };
  Object.entries(votes).forEach(([id, target]) => submit(game, id, { type: 'vote', target }, game.deadline));
  goto(game, team, Phase.DEFENSE);
  assert.equal(team.nextLine('p4').key, 'defense');
  assert.equal(team.nextLine('p2'), null);
  assert.equal(team.nextLine('p4'), null);
});

test('bot voters decide on the final vote from what they know', () => {
  const { game, team } = botGame();
  quietNight(game);
  goto(game, team, Phase.VOTE);
  const votes = { p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p1', p5: 'p4', p6: 'p4' };
  Object.entries(votes).forEach(([id, target]) => submit(game, id, { type: 'vote', target }, game.deadline));
  goto(game, team, Phase.REVOTE);
  team.knowledge('p3').known.add('p4');
  team.knowledge('p5').cleared.add('p4');
  assert.deepEqual(team.act('p3'), { type: 'revote', choice: 'keep' });
  assert.deepEqual(team.act('p5'), { type: 'revote', choice: 'switch' });
  assert.deepEqual(team.act('p1'), { type: 'revote', choice: 'keep' });
  assert.equal(team.act('p4'), null);
});

test('bots do not act when nothing is expected of them', () => {
  const { game, team } = botGame();
  botsAct(game, team);
  assert.equal(game.phase, Phase.REPORT);
  assert.equal(team.act('p2'), null);
  goto(game, team, Phase.DISCUSSION);
  assert.equal(team.act('p2'), null);
});

test('no bot ever says it is the police', () => {
  assert.ok(!LINE_CATEGORIES.includes('claimPolice'));
  assert.ok(!LINE_CATEGORIES.includes('cleared'));
  const { game, team } = botGame();
  botsAct(game, team, { p3: { type: 'night', target: 'p1' } });
  goto(game, team, Phase.DISCUSSION);
  const keys = new Set();
  for (let i = 0; i < 60; i++) {
    const line = team.nextLine('p3');
    if (line) keys.add(line.key);
  }
  assert.ok(keys.has('sure'));
  [...keys].forEach((key) => assert.ok(LINE_CATEGORIES.includes(key)));
});

test('a push from the police bot moves the other bots against the mafia', () => {
  const { game, team } = botGame();
  botsAct(game, team, { p3: { type: 'night', target: 'p1' } });
  goto(game, team, Phase.DISCUSSION);
  const line = team.nextLine('p3');
  team.observeChat({ playerId: 'p3', day: game.day, phase: game.phase, template: line });
  goto(game, team, Phase.VOTE);
  const voters = ['p2', 'p4', 'p5', 'p6'].filter((id) => findPlayer(game, id).alive);
  const targets = voters.map((id) => team.act(id).target);
  assert.ok(targets.filter((t) => t === 'p1').length >= Math.ceil(voters.length / 2));
});

test('bot personalities change how much a bot talks', () => {
  const { game, team } = botGame();
  botsAct(game, team);
  goto(game, team, Phase.DISCUSSION);
  const seen = {};
  for (let seed = 1; seed <= 200; seed++) {
    const fresh = botGame({ seed });
    botsAct(fresh.game, fresh.team);
    goto(fresh.game, fresh.team, Phase.DISCUSSION);
    fresh.game.players.forEach((p) => {
      const persona = fresh.team.persona(p.id);
      (seen[persona] ??= []).push(fresh.team.chatTurns(p.id));
    });
  }
  assert.deepEqual(Object.keys(seen).sort(), ['balanced', 'quiet', 'suspicious', 'talkative']);
  assert.ok(Math.max(...seen.quiet) <= 1);
  assert.ok(Math.min(...seen.talkative) >= 2);
  assert.ok(Math.max(...seen.talkative) <= 4);
  assert.ok(Math.min(...seen.balanced) >= 1 && Math.max(...seen.balanced) <= 3);
  assert.equal(team.chatTurns('p2') >= 0, true);
});

test('suspicious bots accuse first', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { game, team } = botGame({ seed, roles: { p1: 'citizen', p2: 'citizen', p3: 'mafia', p4: 'citizen', p5: 'citizen', p6: 'citizen' } });
    const suspicious = game.players.find((p) => team.persona(p.id) === 'suspicious');
    if (!suspicious) continue;
    botsAct(game, team);
    goto(game, team, Phase.DISCUSSION);
    if (!findPlayer(game, suspicious.id).alive) continue;
    let line = null;
    for (let i = 0; i < 6; i++) {
      line = team.nextLine(suspicious.id);
      if (line && !['open', 'mourn', 'nodeath', 'defend'].includes(line.key)) break;
    }
    if (!line) continue;
    assert.equal(line.key, 'suspect');
    return;
  }
  assert.fail('no suspicious bot found');
});

test('a bot mafia member tells its human partner the plan at night', () => {
  const { game, team } = botGame({ humans: ['p1'], roles: { p1: 'mafia', p2: 'mafia', p3: 'doctor', p4: 'police' } });
  const line = team.nextLine('p2');
  assert.equal(line.key, 'plan');
  assert.ok(findPlayer(game, line.params.target));
  assert.notEqual(findPlayer(game, line.params.target).role, 'mafia');
  assert.equal(team.nextLine('p2'), null);
  assert.equal(team.nextLine('p3'), null);
});

test('bots keep quiet at night when no human mafia is there to talk to', () => {
  const { team } = botGame({ roles: { p1: 'mafia', p2: 'mafia' } });
  assert.equal(team.nextLine('p1'), null);
  assert.equal(team.nextLine('p2'), null);
});

test('bot names are Egyptian names that are all different', () => {
  assert.ok(BOT_NAMES.length >= 24);
  assert.equal(new Set(BOT_NAMES.map((n) => n.toLowerCase())).size, BOT_NAMES.length);
  BOT_NAMES.forEach((name) => assert.match(name, /^[A-Z][a-z]+$/));
});

test('profile and quick message lists are valid', () => {
  assert.equal(new Set(AVATARS).size, AVATARS.length);
  assert.equal(new Set(COLORS).size, COLORS.length);
  assert.deepEqual(cleanProfile({ avatar: AVATARS[3], color: 'blue' }), { avatar: AVATARS[3], color: 'blue' });
  const fixed = cleanProfile({ avatar: '<script>', color: 'neon' }, 2);
  assert.ok(AVATARS.includes(fixed.avatar) && COLORS.includes(fixed.color));
  assert.equal(new Set(QUICK_IDS).size, QUICK_IDS.length);
});
