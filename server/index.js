import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { Simulation } from './sim.js';
import { TICK_DT } from '../shared/constants.js';
import { debugSettingsSchema, inputSchema, inventoryRequestSchema, orderSchema, safeParse } from '../shared/schemas.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const sim = new Simulation();

app.get('/health', (_, res) => res.json({ ok: true }));

const clients = new Map();

io.on('connection', (socket) => {
  clients.set(socket.id, { lastPing: Date.now(), rtt: 0 });
  socket.emit('hello', { id: socket.id });

  socket.on('setMode', (mode) => sim.spawnScenario(mode));
  socket.on('input', (payload) => {
    const msg = safeParse(inputSchema, payload);
    if (msg) sim.applyInput(msg);
  });
  socket.on('order', (payload) => {
    const msg = safeParse(orderSchema, payload);
    if (msg) sim.applyOrder(msg);
  });
  socket.on('inventoryMove', (payload) => {
    const msg = safeParse(inventoryRequestSchema, payload);
    if (msg && sim.inventoryMove(msg)) socket.emit('inventoryAck', msg);
  });
  socket.on('loot', (unitId) => sim.tryLoot(unitId));
  socket.on('setDebug', (payload) => {
    const msg = safeParse(debugSettingsSchema, payload);
    if (msg) sim.debug = msg;
  });
  socket.on('spawn', ({ kind, pos }) => {
    if (kind === 'infantry') sim.spawnUnit('infantry', 'enemy', pos);
    if (kind === 'light') sim.spawnUnit('mech', 'enemy', pos);
    if (kind === 'heavy') sim.spawnUnit('tank', 'enemy', pos);
    if (kind === 'wall') sim.spawnWall(pos);
    if (kind === 'crate') sim.spawnCrate(pos);
  });
  socket.on('pongEstimate', (t) => {
    const c = clients.get(socket.id);
    if (c) c.rtt = Date.now() - t;
  });
  socket.on('disconnect', () => clients.delete(socket.id));
});

setInterval(() => {
  sim.tickStep();
  const avgRtt = [...clients.values()].reduce((a, c) => a + c.rtt, 0) / Math.max(1, clients.size);
  io.emit('snapshot', sim.snapshot(avgRtt));
  io.emit('pingEstimate', Date.now());
}, TICK_DT * 1000);

const PORT = 3001;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
