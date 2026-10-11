const User = require('../models/User');
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const AppError = require('../utils/AppError');
const { ROLES } = require('../utils/constants');
const { and, searchFilter, paginate } = require('../utils/query');
const { getTeamIds } = require('./scope.service');

async function assertValidManager(managerId) {
  const m = await User.findById(managerId);
  if (!m || m.role !== ROLES.MANAGER) throw new AppError('manager must be an existing sales manager', 400);
  if (!m.isActive) throw new AppError('manager must be an active user', 400);
}

exports.create = async (actor, data) => {
  if (data.manager) {
    if (data.role !== ROLES.EXECUTIVE) throw new AppError('Only sales executives can have a manager', 400);
    await assertValidManager(data.manager);
  }
  return User.create(data);
};

exports.list = async (actor, q) => {
  const filter = and(
    searchFilter(q.search, ['name', 'email']),
    q.role ? { role: q.role } : null,
    q.status ? { isActive: q.status === 'active' } : null,
    q.manager ? { manager: q.manager } : null
  );
  return paginate(User, filter, q, {
    sortable: ['name', 'email', 'role', 'isActive', 'createdAt', 'updatedAt'],
    defaultSort: { createdAt: -1 },
    populate: [['manager', 'name email']],
  });
};

exports.getById = async (id) => {
  const user = await User.findById(id).populate('manager', 'name email');
  if (!user) throw new AppError('User not found', 404);
  return user;
};

/** Active executives the caller may assign work to (managers: their own team only). */
exports.assignable = async (actor) => {
  const filter = { role: ROLES.EXECUTIVE, isActive: true };
  if (actor.role === ROLES.MANAGER) filter._id = { $in: await getTeamIds(actor) };
  return User.find(filter).select('name email phone manager').sort({ name: 1 }).limit(500);
};

exports.update = async (actor, id, data) => {
  const user = await User.findById(id).select('+tokenVersion +refreshTokens');
  if (!user) throw new AppError('User not found', 404);

  const nextRole = data.role || user.role;
  if (data.role && data.role !== user.role) {
    if (String(user._id) === String(actor._id)) throw new AppError('You cannot change your own role', 400);
    if (user.role === ROLES.MANAGER && (await User.exists({ manager: user._id }))) {
      throw new AppError('This manager still has team members. Reassign them before changing the role', 409);
    }
  }
  if (data.manager !== undefined && data.manager !== null) {
    if (nextRole !== ROLES.EXECUTIVE) throw new AppError('Only sales executives can have a manager', 400);
    await assertValidManager(data.manager);
  }
  if (nextRole !== ROLES.EXECUTIVE) user.manager = null;

  for (const f of ['name', 'email', 'phone', 'role', 'manager']) if (data[f] !== undefined) user[f] = data[f];
  if (data.password) {
    user.password = data.password;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.refreshTokens = [];
  }
  await user.save();
  return user;
};

exports.setStatus = async (actor, id, isActive) => {
  if (String(actor._id) === String(id) && !isActive) throw new AppError('You cannot deactivate your own account', 400);
  const user = await User.findById(id).select('+tokenVersion +refreshTokens');
  if (!user) throw new AppError('User not found', 404);
  user.isActive = isActive;
  if (!isActive) {
    user.tokenVersion = (user.tokenVersion || 0) + 1; // kill active sessions immediately
    user.refreshTokens = [];
  }
  await user.save();
  return user;
};

exports.remove = async (actor, id) => {
  if (String(actor._id) === String(id)) throw new AppError('You cannot delete your own account', 400);
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);

  const [team, leads, customers, deals, activities] = await Promise.all([
    User.countDocuments({ manager: id }),
    Lead.countDocuments({ assignedTo: id }),
    Customer.countDocuments({ assignedTo: id }),
    Deal.countDocuments({ assignedTo: id }),
    Activity.countDocuments({ assignedTo: id, status: 'Pending' }),
  ]);
  if (team || leads || customers || deals || activities) {
    throw new AppError(
      `User still owns records (team members: ${team}, leads: ${leads}, customers: ${customers}, deals: ${deals}, pending activities: ${activities}). Reassign them or deactivate the user instead`,
      409
    );
  }
  await user.deleteOne();
};
