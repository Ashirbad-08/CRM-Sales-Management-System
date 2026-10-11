const config = require('../config/env');

const base = () => ({ httpOnly: true, secure: config.isProd, sameSite: config.cookieSameSite });

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('accessToken', accessToken, { ...base(), path: '/', maxAge: config.jwt.accessExpiresSec * 1000 });
  res.cookie('refreshToken', refreshToken, { ...base(), path: '/api/v1/auth', maxAge: config.jwt.refreshExpiresSec * 1000 });
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken', { ...base(), path: '/' });
  res.clearCookie('refreshToken', { ...base(), path: '/api/v1/auth' });
}
module.exports = { setAuthCookies, clearAuthCookies };
