const svc = require('../services/user.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');

exports.create = catchAsync(async (req, res) => sendSuccess(res, 'User created successfully', await svc.create(req.user, req.body), { status: 201 }));
exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await svc.list(req.user, req.query);
  sendSuccess(res, 'Users fetched successfully', items, { pagination: meta });
});
exports.assignable = catchAsync(async (req, res) => sendSuccess(res, 'Assignable users fetched successfully', await svc.assignable(req.user)));
exports.getById = catchAsync(async (req, res) => sendSuccess(res, 'User fetched successfully', await svc.getById(req.params.id)));
exports.update = catchAsync(async (req, res) => sendSuccess(res, 'User updated successfully', await svc.update(req.user, req.params.id, req.body)));
exports.setStatus = catchAsync(async (req, res) => {
  const user = await svc.setStatus(req.user, req.params.id, req.body.isActive);
  sendSuccess(res, `User ${user.isActive ? 'activated' : 'deactivated'} successfully`, user);
});
exports.remove = catchAsync(async (req, res) => {
  await svc.remove(req.user, req.params.id);
  sendSuccess(res, 'User deleted successfully');
});
