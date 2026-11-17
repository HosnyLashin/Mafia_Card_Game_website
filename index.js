import { createServer } from './server.js';

const server = createServer({ clientOrigin: process.env.CLIENT_ORIGIN ?? '*' });
const port = Number(process.env.PORT ?? 3000);

server.listen(port).then((bound) => {
  console.log(`mafia server listening on ${bound}`);
});
