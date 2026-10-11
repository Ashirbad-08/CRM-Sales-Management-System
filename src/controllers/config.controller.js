const svc = require('../services/config.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');

exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await svc.list(req.query);
  sendSuccess(res, 'Configuration fetched successfully', items, { pagination: meta });
});
exports.get = catchAsync(async (req, res) => sendSuccess(res, 'Configuration fetched successfully', await svc.get(req.params.key)));
exports.upsert = catchAsync(async (req, res) => sendSuccess(res, 'Configuration saved successfully', await svc.upsert(req.user, req.params.key, req.body)));
exports.remove = catchAsync(async (req, res) => {
  await svc.remove(req.params.key);
  sendSuccess(res, 'Configuration deleted successfully');
});
