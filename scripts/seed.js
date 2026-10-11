/* Creates an admin, a manager and two executives for local testing:  npm run seed */
const mongoose = require('mongoose');
const config = require('../src/config/env');
const User = require('../src/models/User');
const { ROLES } = require('../src/utils/constants');

(async () => {
  if (config.isProd) {
    console.error('Refusing to seed demo users in production');
    process.exit(1);
  }
  await mongoose.connect(config.mongoUri);
  await User.syncIndexes();

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@crm.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const demoPassword = 'Password@123';

  const upsert = async (data) => {
    let u = await User.findOne({ email: data.email });
    if (!u) u = await User.create(data);
    return u;
  };

  await upsert({ name: 'Admin User', email: adminEmail, password: adminPassword, role: ROLES.ADMIN });
  const manager = await upsert({ name: 'Maya Manager', email: 'manager@crm.local', password: demoPassword, role: ROLES.MANAGER });
  await upsert({ name: 'Eli Executive', email: 'eli@crm.local', password: demoPassword, role: ROLES.EXECUTIVE, manager: manager._id });
  await upsert({ name: 'Esha Executive', email: 'esha@crm.local', password: demoPassword, role: ROLES.EXECUTIVE, manager: manager._id });

  console.log('Seeded users:');
  console.log(`  admin    ${adminEmail} / ${adminPassword}`);
  console.log(`  manager  manager@crm.local / ${demoPassword}`);
  console.log(`  exec     eli@crm.local, esha@crm.local / ${demoPassword}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
