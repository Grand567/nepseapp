import http from 'http';
import express from 'express';
import floorsheetHubRouter, { broadcastSseContracts } from '../proxy/routes/floorsheetHubRoutes.mjs';

const app = express();
app.use('/api/floorsheet/hub', floorsheetHubRouter);
app.get('/api/floorsheet/stream', (req, res, next) => {
  req.url = '/stream';
  floorsheetHubRouter(req, res, next);
});

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`[TestSSE] Server running on port ${port}`);

  const req = http.get(`http://127.0.0.1:${port}/api/floorsheet/stream?symbol=SHIVM`, (res) => {
    let receivedHandshake = false;
    let receivedContract = false;

    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log('[TestSSE] Chunk received:', chunk.trim());
      if (chunk.includes('status') && chunk.includes('connected')) {
        receivedHandshake = true;
        // Trigger a broadcast test
        setTimeout(() => {
          broadcastSseContracts([
            { contractNo: 'TEST-999', symbol: 'SHIVM', kitta: 100, rate: 520, amount: 52000 }
          ]);
        }, 100);
      }
      if (chunk.includes('TEST-999')) {
        receivedContract = true;
        console.log('✅ TEST PASSED: Broadcast contract successfully received via SSE!');
        req.destroy();
        server.close(() => {
          process.exit(0);
        });
      }
    });
  });

  req.on('error', (err) => {
    console.error('SSE connection error:', err);
    server.close(() => process.exit(1));
  });

  // Timeout guard
  setTimeout(() => {
    console.error('❌ SSE test timed out');
    server.close(() => process.exit(1));
  }, 5000);
});
