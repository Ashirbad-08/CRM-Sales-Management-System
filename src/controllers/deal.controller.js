const svc = require('../services/deal.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');

exports.create = catchAsync(async (req, res) => sendSuccess(res, 'Deal created successfully', await svc.create(req.user, req.body), { status: 201 }));
exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await svc.list(req.user, req.query);
  sendSuccess(res, 'Deals fetched successfully', items, { pagination: meta });
});
exports.getById = catchAsync(async (req, res) => sendSuccess(res, 'Deal fetched successfully', await svc.getById(req.user, req.params.id)));
exports.update = catchAsync(async (req, res) => sendSuccess(res, 'Deal updated successfully', await svc.update(req.user, req.params.id, req.body)));
exports.changeStage = catchAsync(async (req, res) => sendSuccess(res, 'Deal stage updated successfully', await svc.changeStage(req.user, req.params.id, req.body)));
exports.assign = catchAsync(async (req, res) => sendSuccess(res, 'Deal assigned successfully', await svc.assign(req.user, req.params.id, req.body)));
exports.remove = catchAsync(async (req, res) => {
  await svc.remove(req.user, req.params.id);
  sendSuccess(res, 'Deal deleted successfully');
});
