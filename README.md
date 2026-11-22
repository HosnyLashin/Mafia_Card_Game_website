# Mafia

Online Mafia card game for 6 to 12 players, in English and Arabic.

## Run it while developing

Server, in this folder:

    npm install
    npm start

Website, in a second window:

    cd client
    npm install
    npm run dev

Open the Network address that Vite prints. On a phone, use the same Wi-Fi as the PC.

## Run it as one service

The server also serves the built website, so one address is enough:

    npm install
    npm run build
    npm start

Then open http://localhost:3000.

## Put it online

Build command: npm install && npm run build
Start command: npm start

Settings: SESSION_SECRET (a long random value, keeps guest sessions valid after a restart), NODE_VERSION=22, PORT (set by the host).
CLIENT_ORIGIN is only needed when the website is hosted at a different address from the server.

## Test it

    npm test
    cd client
    npm test
