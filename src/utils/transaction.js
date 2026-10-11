const mongoose = require('mongoose');
const config = require('../config/env');

/**
 * Runs fn(session) inside a MongoDB transaction (commit on success, abort on error).
 * With USE_TRANSACTIONS=false (standalone mongod) fn receives a null session and runs without one.
 */
async function withTransaction(fn) {
  if (!config.useTransactions) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
module.exports = { withTransaction };
