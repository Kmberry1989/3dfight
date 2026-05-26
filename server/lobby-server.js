import { PeerServer } from 'peer';

const port = Number(process.env.PORT || process.env.PEER_PORT || 9000);
const host = process.env.PEER_HOST || '0.0.0.0';
const path = process.env.PEER_PATH || '/peerjs';
const key = process.env.PEER_KEY || 'family-fighter';
const allowDiscovery = process.env.PEER_ALLOW_DISCOVERY === 'true';
const corsOrigins = process.env.PEER_CORS_ORIGINS
    ? process.env.PEER_CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : '*';

const server = PeerServer({
    host,
    port,
    path,
    key,
    proxied: true,
    allow_discovery: allowDiscovery,
    corsOptions: {
        origin: corsOrigins,
        methods: ['GET', 'POST', 'OPTIONS']
    }
}, (httpServer) => {
    const address = httpServer.address();
    const bound = typeof address === 'string' ? address : `${address?.address ?? host}:${address?.port ?? port}`;
    console.log(`[lobby] PeerJS signaling server listening on ${bound}${path}`);
});

server.on('connection', (client) => {
    console.log(`[lobby] peer connected: ${client.getId()}`);
});

server.on('disconnect', (client) => {
    console.log(`[lobby] peer disconnected: ${client.getId()}`);
});

server.on('error', (err) => {
    console.error('[lobby] server error:', err);
});

const shutdown = () => {
    console.log('[lobby] shutting down...');
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
