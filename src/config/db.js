const mongoose = require('mongoose');
const config = require('./env');

mongoose.set('strictQuery', true);

async function connectDB() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected');
  // Make sure all declared indexes exist before serving traffic.
  await mongoose.syncIndexes();
}

module.exports = connectDB;
