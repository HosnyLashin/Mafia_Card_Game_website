# Mafia

Online Mafia card game for 6 to 12 players, in English and Arabic.

## Run it

Server, in this folder:

    npm install
    npm start

Website, in a second window:

    cd client
    npm install
    npm run dev

Open the Network address that Vite prints. On a phone, use the same Wi-Fi as the PC.

## Test it

    npm test
    cd client
    npm test

## Settings

Server: PORT, CLIENT_ORIGIN (the website address), SESSION_SECRET (keeps guest sessions valid after a restart).

Website: VITE_SERVER_URL (the server address). Copy client/.env.example to client/.env to change it.
