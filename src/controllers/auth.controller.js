const authService = require('../services/auth.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');
const { setAuthCookies, clearAuthCookies } = require('../utils/cookies');

exports.register = catchAsync(async (req, res) => {
  const user = await authService.register(req.body);
  sendSuccess(res, 'Registration successful', { user }, { status: 201 });
});

exports.login = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  setAuthCookies(res, { accessToken, refreshToken });
  sendSuccess(res, 'Login successful', { user, accessToken });
});

exports.refresh = catchAsync(async (req, res) => {
  const token = (req.cookies && req.cookies.refreshToken) || req.body.refreshToken;
  const { user, accessToken, refreshToken } = await authService.refresh(token);
  setAuthCookies(res, { accessToken, refreshToken });
  sendSuccess(res, 'Token refreshed', { user, accessToken });
});

exports.logout = catchAsync(async (req, res) => {
  await authService.logout((req.cookies && req.cookies.refreshToken) || req.body.refreshToken);
  clearAuthCookies(res);
  sendSuccess(res, 'Logged out successfully');
});

exports.logoutAll = catchAsync(async (req, res) => {
  await authService.logoutAll(req.user._id);
  clearAuthCookies(res);
  sendSuccess(res, 'Logged out from all devices');
});

exports.me = catchAsync(async (req, res) => sendSuccess(res, 'Profile fetched successfully', { user: req.user }));

exports.updateMe = catchAsync(async (req, res) => {
  const user = await authService.updateProfile(req.user._id, req.body);
  sendSuccess(res, 'Profile updated successfully', { user });
});

exports.changePassword = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.changePassword(req.user._id, req.body);
  setAuthCookies(res, { accessToken, refreshToken });
  sendSuccess(res, 'Password changed successfully. Other sessions were signed out', { user, accessToken });
});
