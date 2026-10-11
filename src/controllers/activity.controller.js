const svc = require('../services/activity.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');

exports.create = catchAsync(async (req, res) => sendSuccess(res, 'Activity created successfully', await svc.create(req.user, req.body), { status: 201 }));
exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await svc.list(req.user, req.query);
  sendSuccess(res, 'Activities fetched successfully', items, { pagination: meta });
});
exports.getById = catchAsync(async (req, res) => sendSuccess(res, 'Activity fetched successfully', await svc.getById(req.user, req.params.id)));
exports.update = catchAsync(async (req, res) => sendSuccess(res, 'Activity updated successfully', await svc.update(req.user, req.params.id, req.body)));
exports.complete = catchAsync(async (req, res) => sendSuccess(res, 'Activity marked as completed', await svc.complete(req.user, req.params.id, req.body)));
exports.remove = catchAsync(async (req, res) => {
  await svc.remove(req.user, req.params.id);
  sendSuccess(res, 'Activity deleted successfully');
});

/** Activities attached to a lead / customer / deal (the entity's access scope is enforced by the activity service). */
exports.forEntity = (relatedModel) =>
  catchAsync(async (req, res) => {
    const { items, meta } = await svc.list(req.user, { ...req.query, relatedModel, relatedTo: req.params.id });
    sendSuccess(res, 'Activities fetched successfully', items, { pagination: meta });
  });
