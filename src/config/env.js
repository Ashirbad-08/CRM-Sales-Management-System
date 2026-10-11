require('dotenv').config();

const required = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const bool = (v, d) => (v === undefined ? d : String(v).toLowerCase() === 'true');
const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

if (isProd && (process.env.JWT_ACCESS_SECRET.length < 32 || process.env.JWT_REFRESH_SECRET.length < 32)) {
  console.error('JWT secrets must be at least 32 characters in production');
  process.exit(1);
}

module.exports = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  useTransactions: bool(process.env.USE_TRANSACTIONS, true),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  allowPublicRegistration: bool(process.env.ALLOW_PUBLIC_REGISTRATION, true),
  enableDocs: bool(process.env.ENABLE_DOCS, !isProd),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
  cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresSec: (Number(process.env.ACCESS_TOKEN_EXPIRES_MIN) || 15) * 60,
    refreshExpiresSec: (Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 7) * 86400,
  },
};
