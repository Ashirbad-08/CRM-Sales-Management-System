/**
 * Row-level access control. Every read/write of a CRM record goes through these scopes, so a user can
 * never reach a resource outside their permitted set (cross-user lookups return 404, not 403, to avoid
 * leaking that the record exists).
 *
 *   admin             -> everything
 *   sales_manager     -> records assigned to / created by their team (themselves + executives reporting to them)
 *   sales_executive   -> records assigned to them
 */
const User = require('../models/User');
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const AppError = require('../utils/AppError');
const { ROLES } = require('../utils/constants');
const { and } = require('../utils/query');

const teamCache = new WeakMap();

async function getTeamIds(user) {
  if (user.role === ROLES.EXECUTIVE) return [user._id];
  if (teamCache.has(user)) return teamCache.get(user);
  const members = await User.find({ manager: user._id }).distinct('_id');
  const ids = [user._id, ...members];
  teamCache.set(user, ids);
  return ids;
}

async function leadScope(user) {
  if (user.role === ROLES.ADMIN) return {};
  if (user.role === ROLES.EXECUTIVE) return { assignedTo: user._id };
  const ids = await getTeamIds(user);
  // Managers also see the unassigned pool so they can assign it.
  return { $or: [{ assignedTo: { $in: ids } }, { createdBy: { $in: ids } }, { assignedTo: null }] };
}

async function ownedScope(user) {
  if (user.role === ROLES.ADMIN) return {};
  if (user.role === ROLES.EXECUTIVE) return { assignedTo: user._id };
  const ids = await getTeamIds(user);
  return { $or: [{ assignedTo: { $in: ids } }, { createdBy: { $in: ids } }] };
}

async function activityScope(user) {
  if (user.role === ROLES.ADMIN) return {};
  if (user.role === ROLES.EXECUTIVE) return { $or: [{ assignedTo: user._id }, { createdBy: user._id }] };
  const ids = await getTeamIds(user);
  return { $or: [{ assignedTo: { $in: ids } }, { createdBy: { $in: ids } }] };
}

const SCOPES = { Lead: leadScope, Customer: ownedScope, Deal: ownedScope, Activity: activityScope };
const MODELS = { Lead, Customer, Deal, Activity };

/** Fetch a document the user is allowed to see, or 404. */
async function findScoped(Model, id, user, { session } = {}) {
  const scope = await SCOPES[Model.modelName](user);
  const doc = await Model.findOne(and({ _id: id }, scope)).session(session || null);
  if (!doc) throw new AppError(`${Model.modelName} not found`, 404);
  return doc;
}

/**
 * Validate an assignee: must exist, be active, be a sales executive, and (for managers) be on the manager's team.
 */
async function assertAssignable(actor, userId) {
  const target = await User.findById(userId);
  if (!target) throw new AppError('Assignee not found', 400);
  if (!target.isActive) throw new AppError('Cannot assign to an inactive user', 400);
  if (target.role !== ROLES.EXECUTIVE) throw new AppError('Records can only be assigned to sales executives', 400);
  if (actor.role === ROLES.MANAGER) {
    const ids = await getTeamIds(actor);
    if (!ids.some((id) => id.equals(target._id))) throw new AppError('You can only assign records to members of your own team', 403);
  } else if (actor.role === ROLES.EXECUTIVE && !target._id.equals(actor._id)) {
    throw new AppError('You can only assign records to yourself', 403);
  }
  return target;
}

module.exports = { getTeamIds, leadScope, ownedScope, activityScope, findScoped, assertAssignable, MODELS };
