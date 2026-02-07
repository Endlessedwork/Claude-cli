const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { handleWebSocket } = require('./websocket');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!process.env.ANTHROPIC_API_KEY });
});

// Set API key at runtime
app.post('/api/config', (req, res) => {
  const { apiKey } = req.body;
  if (apiKey) {
    process.env.ANTHROPIC_API_KEY = apiKey;
    res.json({ status: 'ok' });
  } else {
    res.status(400).json({ error: 'apiKey is required' });
  }
});

// WebSocket connection
wss.on('connection', (ws) => {
  handleWebSocket(ws);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Claude CLI Web running on http://localhost:${PORT}`);
});
