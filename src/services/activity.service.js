const Activity = require('../models/Activity');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { ROLES, TIMELINE_ACTIONS: T } = require('../utils/constants');
const { and, searchFilter, dateRange, paginate } = require('../utils/query');
const { activityStatusFilter } = require('../utils/activityStatus');
const { withTransaction } = require('../utils/transaction');
const { activityScope, getTeamIds, findScoped, MODELS } = require('./scope.service');
const timeline = require('./timeline.service');

const USER_FIELDS = 'name email role';
const sess = (session) => (session ? { session } : {});
const populated = (id) => Activity.findById(id).populate('assignedTo', USER_FIELDS).populate('createdBy', USER_FIELDS).populate('completedBy', USER_FIELDS);
const FOLLOWUP_TYPES = ['Follow-up', 'Reminder'];

/** The caller must be able to see the entity an activity is attached to. */
async function assertRelatedAccess(actor, relatedModel, relatedTo) {
  if (!relatedModel) return;
  if (relatedModel === 'User') {
    const target = await User.findById(relatedTo);
    if (!target) throw new AppError('Related user not found', 404);
    if (actor.role === ROLES.ADMIN || String(target._id) === String(actor._id)) return;
    if (actor.role === ROLES.MANAGER && (await getTeamIds(actor)).some((id) => id.equals(target._id))) return;
    throw new AppError('Related user not found', 404);
  }
  await findScoped(MODELS[relatedModel], relatedTo, actor);
}

async function resolveAssignee(actor, requested) {
  if (!requested || String(requested) === String(actor._id)) return actor._id;
  if (actor.role === ROLES.EXECUTIVE) throw new AppError('Sales executives can only create activities for themselves', 403);
  const target = await User.findById(requested);
  if (!target || !target.isActive) throw new AppError('Assignee not found or inactive', 400);
  if (actor.role === ROLES.MANAGER && !(await getTeamIds(actor)).some((id) => id.equals(target._id))) {
    throw new AppError('You can only assign activities to members of your own team', 403);
  }
  return target._id;
}

function timelineAction(type, completed = false) {
  if (type === 'Note') return T.NOTE_ADDED;
  if (FOLLOWUP_TYPES.includes(type)) return completed ? T.FOLLOWUP_COMPLETED : T.FOLLOWUP_CREATED;
  return completed ? T.ACTIVITY_COMPLETED : T.ACTIVITY_CREATED;
}

const tlEntry = (action, a, actor, previousValue, newValue) => ({
  action, entityType: a.relatedModel, entityId: a.relatedTo, performedBy: actor._id, previousValue, newValue,
  metadata: { activityId: a._id, type: a.type, title: a.title },
});
const hasTimeline = (a) => ['Lead', 'Customer', 'Deal'].includes(a.relatedModel);

exports.create = async (actor, data) => {
  await assertRelatedAccess(actor, data.relatedModel, data.relatedTo);
  const assignedTo = await resolveAssignee(actor, data.assignedTo);
  const isNote = data.type === 'Note';

  const id = await withTransaction(async (session) => {
    const [activity] = await Activity.create(
      [{
        ...data,
        assignedTo,
        createdBy: actor._id,
        status: isNote ? 'Completed' : 'Pending', // notes are logged, not scheduled
        completedAt: isNote ? new Date() : undefined,
        completedBy: isNote ? actor._id : undefined,
      }],
      sess(session)
    );
    if (hasTimeline(activity)) {
      await timeline.log(tlEntry(timelineAction(activity.type), activity, actor, null, { title: activity.title, description: activity.description, dueDate: activity.dueDate }), session);
    }
    return activity._id;
  });
  return populated(id);
};

exports.list = async (actor, q) => {
  const filter = and(
    await activityScope(actor),
    q.type ? { type: { $in: q.type } } : null,
    q.status ? activityStatusFilter(q.status) : null,
    q.assignedTo ? { assignedTo: q.assignedTo } : null,
    q.relatedModel ? { relatedModel: q.relatedModel } : null,
    q.relatedTo ? { relatedTo: q.relatedTo } : null,
    searchFilter(q.search, ['title', 'description']),
    dateRange('dueDate', q.dueFrom, q.dueTo)
  );
  return paginate(Activity, filter, q, {
    sortable: ['dueDate', 'title', 'type', 'status', 'createdAt', 'updatedAt', 'completedAt'],
    defaultSort: { dueDate: 1 },
    populate: [['assignedTo', USER_FIELDS], ['createdBy', USER_FIELDS]],
  });
};

exports.getById = async (actor, id) => {
  const a = await findScoped(Activity, id, actor);
  return populated(a._id);
};

exports.update = async (actor, id, data) => {
  const activity = await findScoped(Activity, id, actor);
  if (activity.status === 'Completed') throw new AppError('A completed activity cannot be edited', 409);
  if (data.dueDate && activity.type === 'Note') throw new AppError('Notes do not have a due date', 400);
  if (data.assignedTo !== undefined && String(data.assignedTo) !== String(activity.assignedTo)) {
    if (actor.role === ROLES.EXECUTIVE) throw new AppError('Sales executives cannot reassign activities', 403);
    activity.assignedTo = await resolveAssignee(actor, data.assignedTo);
  }
  for (const f of ['title', 'description', 'dueDate']) if (data[f] !== undefined) activity[f] = data[f];
  await activity.save();
  return populated(activity._id);
};

exports.complete = async (actor, id, { outcome } = {}) => {
  const activity = await findScoped(Activity, id, actor);
  if (activity.status === 'Completed') throw new AppError('Activity is already completed', 409);

  // Atomic guard against double completion.
  await withTransaction(async (session) => {
    const done = await Activity.findOneAndUpdate(
      { _id: activity._id, status: 'Pending' },
      { $set: { status: 'Completed', completedAt: new Date(), completedBy: actor._id, ...(outcome ? { outcome } : {}) } },
      { new: true, ...sess(session) }
    );
    if (!done) throw new AppError('Activity is already completed', 409);
    if (hasTimeline(done)) {
      await timeline.log(tlEntry(timelineAction(done.type, true), done, actor, { status: 'Pending' }, { status: 'Completed', outcome }), session);
    }
  });
  return populated(activity._id);
};

exports.remove = async (actor, id) => {
  const activity = await findScoped(Activity, id, actor);
  // Executives may only delete what they created; managers/admins within their scope.
  if (actor.role === ROLES.EXECUTIVE && String(activity.createdBy) !== String(actor._id)) {
    throw new AppError('You can only delete activities you created', 403);
  }
  await activity.deleteOne();
};

