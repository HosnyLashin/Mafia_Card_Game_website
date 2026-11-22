import { Phase, Role, alivePlayers, findPlayer, awaitingAction } from './engine.js';
import { pick } from './rng.js';
import { LINE_VARIANTS, ACCUSING_LINES } from './botlines.js';

const POLICE_CLAIM = /(?:\bi am|\bi'm|\bim)\s+(?:the\s+)?police\b|أنا\s+(?:ال)?شرط[يى]/i;
const RECENT_DAYS = 2;

function weightedPick(items, weightOf, rng) {
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function createBotTeam(game, rng) {
  const memories = new Map();
  const claims = new Set();
  const mentions = [];
  const spoken = new Map();
  const plans = new Map();
  const defended = new Set();

  game.players
    .filter((p) => p.isBot)
    .forEach((p) =>
      memories.set(p.id, {
        known: new Set(),
        cleared: new Set(),
        said: new Set(),
        reportDay: 0,
        lastSuspect: null,
        lastResult: 'none',
        accusedPending: 0,
      }),
    );

  const hasBots = memories.size > 0;
  const aliveOthers = (id) => alivePlayers(game).filter((p) => p.id !== id);
  const spokeOn = (day, id) => spoken.get(`${day}:${id}`) ?? 0;

  function addMention(by, target, weight) {
    if (by === target) return;
    mentions.push({ day: game.day, by, target, weight });
    const memo = memories.get(target);
    if (memo) memo.accusedPending += 1;
  }

  function mentionWeight(targetId, exceptId) {
    return mentions
      .filter((m) => m.target === targetId && m.by !== exceptId && m.day >= game.day - RECENT_DAYS)
      .reduce((sum, m) => sum + m.weight, 0);
  }

  function mislead(playerId) {
    const wrong = game.events
      .filter((e) => e.key === 'vote.kicked' && e.params.role !== Role.MAFIA)
      .map((e) => e.params.playerId);
    return mentions
      .filter((m) => m.by === playerId && wrong.includes(m.target))
      .reduce((sum, m) => sum + 0.8 * m.weight, 0);
  }

  function quietness(targetId) {
    const day = game.phase === Phase.NIGHT ? game.day - 1 : game.day;
    return day >= 1 && spokeOn(day, targetId) === 0 ? 0.6 : 0;
  }

  function suspicion(botId, targetId) {
    const me = findPlayer(game, botId);
    const target = findPlayer(game, targetId);
    const memo = memories.get(botId);
    if (memo.known.has(targetId)) return 100;
    if (memo.cleared.has(targetId)) return -100;
    if (me.role === Role.MAFIA && target.role === Role.MAFIA) return -100;

    let score = rng() * 0.4;
    score += mentionWeight(targetId, botId);
    score += quietness(targetId);
    score += mislead(targetId);
    if (claims.has(targetId) && targetId !== botId) {
      if (me.role === Role.POLICE) score += 100;
      else if (me.role === Role.MAFIA) score += 1.5;
      else score += claims.size > 1 ? 1 : -0.7;
    }
    return score;
  }

  function topSuspect(botId, candidates) {
    let best = null;
    let bestScore = -Infinity;
    candidates.forEach((p) => {
      const score = suspicion(botId, p.id);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    });
    return best ? { player: best, score: bestScore } : null;
  }

  function mafiaPlan(kind) {
    const key = `${kind}:${game.day}`;
    const planned = plans.get(key);
    if (planned && findPlayer(game, planned)?.alive) return planned;
    const targets = alivePlayers(game).filter((p) => p.role !== Role.MAFIA);
    if (targets.length === 0) return null;
    const mafiaIds = new Set(alivePlayers(game).filter((p) => p.role === Role.MAFIA).map((p) => p.id));
    const threat = (p) =>
      (claims.has(p.id) ? 5 : 0) +
      mentions.filter((m) => m.by === p.id && mafiaIds.has(m.target)).reduce((sum, m) => sum + m.weight, 0) +
      rng() * 0.5;
    const chosen = targets.reduce((best, p) => (threat(p) > threat(best) ? p : best), targets[0]);
    plans.set(key, chosen.id);
    return chosen.id;
  }

  function sync() {
    if (game.phase !== Phase.REPORT || !game.report) return;
    game.players
      .filter((p) => p.isBot && p.role === Role.POLICE)
      .forEach((police) => {
        const memo = memories.get(police.id);
        const suspect = game.nightActions[police.id] ?? null;
        if (memo.reportDay === game.day || suspect === null) return;
        memo.reportDay = game.day;
        memo.lastSuspect = suspect;
        memo.lastResult = game.report.policeResult;
        if (game.report.policeResult === 'right') memo.known.add(suspect);
        if (game.report.policeResult === 'wrong') memo.cleared.add(suspect);
      });
  }

  function nightTarget(bot) {
    const others = aliveOthers(bot.id);
    switch (bot.role) {
      case Role.MAFIA:
        return mafiaPlan('night');
      case Role.DOCTOR: {
        const options = alivePlayers(game);
        return weightedPick(options, (p) => (claims.has(p.id) ? 4 : p.id === bot.id ? 1.5 : 1), rng).id;
      }
      case Role.POLICE: {
        const memo = memories.get(bot.id);
        const fresh = others.filter((p) => !memo.known.has(p.id) && !memo.cleared.has(p.id));
        const pool = fresh.length > 0 ? fresh : others;
        return topSuspect(bot.id, pool)?.player.id ?? null;
      }
      default:
        return pick(others, rng).id;
    }
  }

  function voteTarget(bot) {
    const candidates = aliveOthers(bot.id).filter((p) => !(bot.role === Role.MAFIA && p.role === Role.MAFIA));
    if (candidates.length === 0) return null;
    if (bot.role === Role.MAFIA) return mafiaPlan('vote');
    if (rng() < 0.03) return null;
    return topSuspect(bot.id, candidates).player.id;
  }

  function revoteChoice(bot) {
    const memo = memories.get(bot.id);
    const accused = game.accused;
    if (memo.known.has(accused)) return 'keep';
    if (memo.cleared.has(accused)) return 'switch';
    if (bot.role === Role.MAFIA) return 'keep';
    const score = suspicion(bot.id, accused);
    let chance = score < 0.8 ? 0.55 : 0.2;
    if (defended.has(accused)) chance += 0.15;
    if (claims.has(accused)) chance += 0.2;
    return rng() < chance ? 'switch' : 'keep';
  }

  function act(botId) {
    if (!awaitingAction(game, botId)) return null;
    const bot = findPlayer(game, botId);
    switch (game.phase) {
      case Phase.NIGHT:
        return { type: 'night', target: nightTarget(bot) };
      case Phase.VOTE:
        return { type: 'vote', target: voteTarget(bot) };
      case Phase.REVOTE:
        return { type: 'revote', choice: revoteChoice(bot) };
      default:
        return null;
    }
  }

  function observeChat(message) {
    if (!hasBots) return;
    const day = message.day ?? game.day;
    const speakerKey = `${day}:${message.playerId}`;
    spoken.set(speakerKey, (spoken.get(speakerKey) ?? 0) + 1);

    if (message.template) {
      const { key, params } = message.template;
      if (ACCUSING_LINES.has(key) && params.target) addMention(message.playerId, params.target, 1);
      if (key === 'claimPolice' && params.target) {
        claims.add(message.playerId);
        addMention(message.playerId, params.target, 2);
      }
      return;
    }

    const text = String(message.text ?? '');
    if (POLICE_CLAIM.test(text)) claims.add(message.playerId);
    if (message.phase === Phase.DEFENSE) defended.add(message.playerId);
    const lowered = text.toLowerCase();
    game.players
      .filter((p) => p.id !== message.playerId && p.name.length >= 2)
      .forEach((p) => {
        if (lowered.includes(p.name.toLowerCase())) addMention(message.playerId, p.id, 0.6);
      });
  }

  function nextLine(botId) {
    const bot = findPlayer(game, botId);
    const memo = memories.get(botId);
    if (!bot?.alive || !memo) return null;
    const variant = Math.floor(rng() * LINE_VARIANTS);
    const line = (key, params = {}) => ({ key, variant, params });
    const once = (tag) => {
      const mark = `${game.day}:${tag}`;
      if (memo.said.has(mark)) return false;
      memo.said.add(mark);
      return true;
    };

    if (game.phase === Phase.DEFENSE) {
      return game.accused === botId && once('defense') ? line('defense') : null;
    }
    if (game.phase !== Phase.DISCUSSION) return null;

    if (memo.accusedPending > 0 && once(`defend${memo.accusedPending > 2 ? 2 : 1}`)) {
      memo.accusedPending = 0;
      return line('defend');
    }
    const knownMafia = [...memo.known].find((id) => findPlayer(game, id)?.alive);
    if (bot.role === Role.POLICE && knownMafia && once('claim')) return line('claimPolice', { target: knownMafia });
    if (bot.role === Role.POLICE && memo.lastResult === 'wrong' && memo.lastSuspect && rng() < 0.5 && once('cleared')) {
      return line('cleared', { target: memo.lastSuspect });
    }
    if (bot.role === Role.MAFIA) {
      const claimant = [...claims].find((id) => id !== botId && findPlayer(game, id)?.alive);
      if (claimant && once(`counter:${claimant}`)) return line('counter', { target: claimant });
    }
    if (once('opening')) {
      const victim = game.report?.victimId;
      if (victim && rng() < 0.6) return line('mourn', { target: victim });
      if (!victim && game.day > 1 && rng() < 0.6) return line('nodeath');
      return line('open');
    }

    const others = aliveOthers(botId);
    if (others.length === 0) return null;
    const silent = others.find((p) => spokeOn(game.day, p.id) === 0 && once(`quiet:${p.id}`));
    if (silent && rng() < 0.5) return line('quiet', { target: silent.id });

    const talked = others
      .map((p) => ({ p, weight: mentionWeight(p.id, botId) }))
      .filter((entry) => entry.weight > 0)
      .sort((a, b) => b.weight - a.weight)[0];
    if (talked && bot.role !== Role.MAFIA && once(`agree:${talked.p.id}`)) return line('agree', { target: talked.p.id });

    const aim = bot.role === Role.MAFIA ? mafiaPlan('vote') : topSuspect(botId, others)?.player.id;
    if (aim && once(`suspect:${aim}`)) return line('suspect', { target: aim });
    if (once('ask')) return line('ask', { target: pick(others, rng).id });
    return once('filler') ? line('filler') : null;
  }

  return {
    sync,
    act,
    observeChat,
    nextLine,
    suspicion,
    knowledge: (botId) => memories.get(botId),
  };
}
