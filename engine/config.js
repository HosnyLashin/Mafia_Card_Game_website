export const defaultConfig = {
  minPlayers: 6,
  maxPlayers: 12,
  mafiaThresholds: [{ minPlayers: 11, mafia: 2 }],
  seconds: {
    night: 30,
    report: 8,
    discussion: 120,
    vote: 30,
    defense: 30,
    revote: 15,
    result: 6,
  },
  nightMinSeconds: 8,
  mafiaCount: null,
  publicVotes: false,
  revealRoleOnKick: true,
  afkStrikes: 3,
  maxConsecutiveTies: 3,
  defensePerPlayer: 1,
  revealRoleOnNightDeath: true,
};

export function mergeConfig(overrides = {}) {
  return {
    ...defaultConfig,
    ...overrides,
    seconds: { ...defaultConfig.seconds, ...(overrides.seconds ?? {}) },
    mafiaThresholds: overrides.mafiaThresholds ?? defaultConfig.mafiaThresholds,
  };
}

export function mafiaCount(playerCount, config) {
  return config.mafiaThresholds.reduce(
    (count, rule) => (playerCount >= rule.minPlayers ? Math.max(count, rule.mafia) : count),
    1,
  );
}
