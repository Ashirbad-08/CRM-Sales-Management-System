/** Consistent success envelope: { success, message, data, pagination? } */
function sendSuccess(res, message, data = null, { status = 200, pagination } = {}) {
  const body = { success: true, message, data };
  if (pagination) body.pagination = pagination;
  return res.status(status).json(body);
}
module.exports = { sendSuccess };
