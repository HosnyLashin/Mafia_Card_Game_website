import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.js';

const server = createServer({ clientOrigin: process.env.CLIENT_ORIGIN ?? '*' });
const port = Number(process.env.PORT ?? 3000);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client', 'dist', 'index.html');

server.listen(port).then((bound) => {
  console.log(`mafia server listening on ${bound}`);
  console.log(fs.existsSync(site) ? `website found at ${site}` : `website MISSING, expected at ${site}`);
});
