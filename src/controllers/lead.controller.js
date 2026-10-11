const svc = require('../services/lead.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');

exports.create = catchAsync(async (req, res) => sendSuccess(res, 'Lead created successfully', await svc.create(req.user, req.body), { status: 201 }));
exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await svc.list(req.user, req.query);
  sendSuccess(res, 'Leads fetched successfully', items, { pagination: meta });
});
exports.getById = catchAsync(async (req, res) => sendSuccess(res, 'Lead fetched successfully', await svc.getById(req.user, req.params.id)));
exports.update = catchAsync(async (req, res) => sendSuccess(res, 'Lead updated successfully', await svc.update(req.user, req.params.id, req.body)));
exports.updateStatus = catchAsync(async (req, res) => sendSuccess(res, 'Lead status updated successfully', await svc.updateStatus(req.user, req.params.id, req.body)));
exports.assign = catchAsync(async (req, res) => sendSuccess(res, 'Lead assigned successfully', await svc.assign(req.user, req.params.id, req.body)));
exports.convert = catchAsync(async (req, res) => sendSuccess(res, 'Lead converted to customer and deal successfully', await svc.convert(req.user, req.params.id, req.body), { status: 201 }));
exports.remove = catchAsync(async (req, res) => {
  await svc.remove(req.user, req.params.id);
  sendSuccess(res, 'Lead deleted successfully');
});
