const config = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const mongoose = require('mongoose');

let server;

async function start() {
  await connectDB();
  server = app.listen(config.port, () => {
    console.log(`CRM API listening on :${config.port} (${config.nodeEnv}); transactions ${config.useTransactions ? 'ON' : 'OFF'}`);
    if (config.enableDocs) console.log(`Swagger UI: http://localhost:${config.port}/api-docs`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  if (server) await new Promise((r) => server.close(r));
  await mongoose.connection.close();
  process.exit(0);
}
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err && err.message);
  shutdown('unhandledRejection');
});

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
