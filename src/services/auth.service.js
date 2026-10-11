const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { ROLES } = require('../utils/constants');

const MAX_SESSIONS = 5;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Used so unknown e-mails cost the same time as wrong passwords (no user enumeration by timing).
let dummyHash;
const getDummyHash = () => dummyHash || (dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptRounds));

const signAccess = (user) =>
  jwt.sign({ sub: String(user._id), tv: user.tokenVersion || 0 }, config.jwt.accessSecret, { algorithm: 'HS256', expiresIn: config.jwt.accessExpiresSec });
const signRefresh = (user) =>
  jwt.sign({ sub: String(user._id), tv: user.tokenVersion || 0, jti: crypto.randomUUID() }, config.jwt.refreshSecret, { algorithm: 'HS256', expiresIn: config.jwt.refreshExpiresSec });

/** Create a token pair and store the refresh token's hash (never the token itself). */
async function issueTokens(user) {
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  const now = new Date();
  const kept = (user.refreshTokens || []).filter((t) => t.expiresAt > now);
  kept.push({ hash: sha256(refreshToken), expiresAt: new Date(Date.now() + config.jwt.refreshExpiresSec * 1000) });
  user.refreshTokens = kept.slice(-MAX_SESSIONS);
  await user.save();
  return { accessToken, refreshToken };
}

exports.register = async ({ name, email, phone, password }) => {
  if (!config.allowPublicRegistration) throw new AppError('Public registration is disabled. Ask an admin to create your account', 403);
  // Self-registration can only ever create a sales executive; privileged roles are assigned by admins.
  return User.create({ name, email, phone, password, role: ROLES.EXECUTIVE });
};

exports.login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password +tokenVersion +refreshTokens');
  const ok = user ? await user.comparePassword(password) : await bcrypt.compare(password, getDummyHash()).then(() => false);
  if (!user || !ok) throw new AppError('Invalid email or password', 401);
  if (!user.isActive) throw new AppError('Your account has been deactivated. Contact an administrator', 403);
  user.lastLoginAt = new Date();
  const tokens = await issueTokens(user);
  return { user, ...tokens };
};

exports.refresh = async (token) => {
  if (!token) throw new AppError('Refresh token required', 401);
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.refreshSecret, { algorithms: ['HS256'] });
  } catch (e) {
    throw new AppError('Invalid or expired refresh token', 401);
  }
  const user = await User.findById(payload.sub).select('+tokenVersion +refreshTokens');
  if (!user || (user.tokenVersion || 0) !== payload.tv) throw new AppError('Invalid or expired refresh token', 401);
  if (!user.isActive) throw new AppError('Your account has been deactivated', 403);

  const hash = sha256(token);
  const idx = user.refreshTokens.findIndex((t) => t.hash === hash);
  if (idx === -1) {
    // A validly-signed token that we no longer know = reuse of a rotated token. Revoke every session.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.refreshTokens = [];
    await user.save();
    throw new AppError('Refresh token reuse detected. Please log in again', 401);
  }
  user.refreshTokens.splice(idx, 1); // rotation
  const tokens = await issueTokens(user);
  return { user, ...tokens };
};

/** Revoke the presented refresh token (idempotent, works even if the access token has expired). */
exports.logout = async (token) => {
  if (!token) return;
  try {
    const payload = jwt.verify(token, config.jwt.refreshSecret, { algorithms: ['HS256'], ignoreExpiration: true });
    await User.updateOne({ _id: payload.sub }, { $pull: { refreshTokens: { hash: sha256(token) } } });
  } catch (e) {
    /* invalid token: nothing to revoke */
  }
};

exports.logoutAll = async (userId) => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 }, $set: { refreshTokens: [] } });
};

exports.updateProfile = async (userId, data) => {
  const user = await User.findById(userId);
  if (data.name !== undefined) user.name = data.name;
  if (data.phone !== undefined) user.phone = data.phone;
  await user.save();
  return user;
};

exports.changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password +tokenVersion +refreshTokens');
  if (!(await user.comparePassword(currentPassword))) throw new AppError('Current password is incorrect', 400);
  user.password = newPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidates every other session
  user.refreshTokens = [];
  const tokens = await issueTokens(user);
  return { user, ...tokens };
};
