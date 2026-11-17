import crypto from 'node:crypto';

export function createIdentity(secret = process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString('hex')) {
  const sign = (id) => crypto.createHmac('sha256', secret).update(id).digest('base64url');

  return {
    newGuest() {
      const playerId = `g_${crypto.randomBytes(8).toString('hex')}`;
      return { playerId, token: `${playerId}.${sign(playerId)}` };
    },
    verify(token) {
      if (typeof token !== 'string') return null;
      const split = token.lastIndexOf('.');
      if (split < 1) return null;
      const playerId = token.slice(0, split);
      const given = Buffer.from(token.slice(split + 1));
      const expected = Buffer.from(sign(playerId));
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
      return playerId;
    },
  };
}
