const CrmConfig = require('../models/Config');
const AppError = require('../utils/AppError');
const { paginate } = require('../utils/query');

exports.list = (q) => paginate(CrmConfig, {}, q, { sortable: ['key', 'createdAt', 'updatedAt'], defaultSort: { key: 1 }, lean: true });

exports.get = async (key) => {
  const c = await CrmConfig.findOne({ key });
  if (!c) throw new AppError('Configuration key not found', 404);
  return c;
};

exports.upsert = (actor, key, { value, description }) =>
  CrmConfig.findOneAndUpdate(
    { key },
    { $set: { value, updatedBy: actor._id, ...(description !== undefined ? { description } : {}) } },
    { new: true, upsert: true, runValidators: true }
  );

exports.remove = async (key) => {
  const c = await CrmConfig.findOneAndDelete({ key });
  if (!c) throw new AppError('Configuration key not found', 404);
};
