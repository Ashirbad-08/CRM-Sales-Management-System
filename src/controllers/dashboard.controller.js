const svc = require('../services/dashboard.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');

exports.stats = catchAsync(async (req, res) => sendSuccess(res, 'Dashboard statistics fetched successfully', await svc.stats(req.user, req.query)));
exports.pipeline = catchAsync(async (req, res) => sendSuccess(res, 'Sales pipeline fetched successfully', await svc.pipeline(req.user, req.query)));
exports.teamPerformance = catchAsync(async (req, res) => sendSuccess(res, 'Team performance fetched successfully', await svc.teamPerformance(req.user, req.query)));
exports.salesReport = catchAsync(async (req, res) => sendSuccess(res, 'Sales report fetched successfully', await svc.salesReport(req.user, req.query)));
