const svc = require('../services/customer.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');

exports.create = catchAsync(async (req, res) => sendSuccess(res, 'Customer created successfully', await svc.create(req.user, req.body), { status: 201 }));
exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await svc.list(req.user, req.query);
  sendSuccess(res, 'Customers fetched successfully', items, { pagination: meta });
});
exports.getById = catchAsync(async (req, res) => sendSuccess(res, 'Customer fetched successfully', await svc.getById(req.user, req.params.id)));
exports.update = catchAsync(async (req, res) => sendSuccess(res, 'Customer updated successfully', await svc.update(req.user, req.params.id, req.body)));
exports.assign = catchAsync(async (req, res) => sendSuccess(res, 'Customer assigned successfully', await svc.assign(req.user, req.params.id, req.body)));
exports.remove = catchAsync(async (req, res) => {
  await svc.remove(req.user, req.params.id);
  sendSuccess(res, 'Customer deleted successfully');
});
