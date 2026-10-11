const svc = require('../services/timeline.service');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/response');

const respond = (res, { items, meta }) => sendSuccess(res, 'Timeline fetched successfully', items, { pagination: meta });

exports.get = catchAsync(async (req, res) => respond(res, await svc.getFor(req.user, req.params.entityType, req.params.entityId, req.query)));
exports.forEntity = (entityType) =>
  catchAsync(async (req, res) => respond(res, await svc.getFor(req.user, entityType, req.params.id, req.query)));
