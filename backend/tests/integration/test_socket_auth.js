require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { z } = require('zod');
const { getAdminDb } = require('../../src/lib/db');
const { Server } = require('socket.io');
const { createServer } = require('http');
const ioClient = require('socket.io-client');

async function testSocketAuth() {
  const { app, httpServer } = require('../../src/app');
  
  const client = ioClient(`http://localhost:4000`, {
    auth: { role: 'admin', state_id: 'fake-uuid' },
    transports: ['websocket'],
    forceNew: true
  });

  await new Promise(resolve => client.on('connect', resolve));
  
  // The client connected, but what rooms is it in?
  // We can't easily inspect rooms from the client, so we will look at the server socket
  const ioServer = app.get('io');
  const serverSockets = await ioServer.fetchSockets();
  const socket = serverSockets.find(s => s.id === client.id);
  
  const rooms = Array.from(socket.rooms);
  console.log('Client connected with forged role, rooms joined:', rooms);
  
  if (rooms.includes('role:admin')) {
    throw new Error('Socket was allowed to forge admin role!');
  }
  
  client.disconnect();
  httpServer.close();
  console.log('Socket auth check passed');
}

testSocketAuth().catch(console.error);
