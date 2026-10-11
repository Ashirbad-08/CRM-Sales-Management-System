const Customer = require('../models/Customer');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const AppError = require('../utils/AppError');
const { ROLES, TIMELINE_ACTIONS: T } = require('../utils/constants');
const { and, searchFilter, dateRange, applyChanges, paginate } = require('../utils/query');
const { withTransaction } = require('../utils/transaction');
const { ownedScope, findScoped, assertAssignable } = require('./scope.service');
const timeline = require('./timeline.service');

const ASSIGNEE = 'name email role';
const sess = (session) => (session ? { session } : {});
const entry = (action, c, actor, previousValue, newValue, metadata) => ({ action, entityType: 'Customer', entityId: c._id, performedBy: actor._id, previousValue, newValue, metadata });
const populated = (id) => Customer.findById(id).populate('assignedTo', ASSIGNEE).populate('lead', 'name status');

exports.create = async (actor, data) => {
  const doc = { ...data, createdBy: actor._id };
  if (actor.role === ROLES.EXECUTIVE) {
    if (data.assignedTo && String(data.assignedTo) !== String(actor._id)) throw new AppError('Sales executives can only create customers assigned to themselves', 403);
    doc.assignedTo = actor._id;
  } else if (data.assignedTo) {
    await assertAssignable(actor, data.assignedTo);
  }
  const id = await withTransaction(async (session) => {
    const [customer] = await Customer.create([doc], sess(session));
    await timeline.log(entry(T.CUSTOMER_CREATED, customer, actor, null, { name: customer.name, email: customer.email, status: customer.status }, { origin: 'manual' }), session);
    return customer._id;
  });
  return populated(id);
};

exports.list = async (actor, q) => {
  const filter = and(
    await ownedScope(actor),
    q.status ? { status: { $in: q.status } } : null,
    q.assignedTo === 'unassigned' ? { assignedTo: null } : q.assignedTo ? { assignedTo: q.assignedTo } : null,
    searchFilter(q.search, ['name', 'email', 'phone', 'company']),
    dateRange('createdAt', q.createdFrom, q.createdTo)
  );
  return paginate(Customer, filter, q, {
    sortable: ['name', 'company', 'email', 'status', 'createdAt', 'updatedAt'],
    defaultSort: { createdAt: -1 },
    populate: [['assignedTo', ASSIGNEE]],
    lean: true,
  });
};

/** Customer + original lead + associated deals (deals filtered by the caller's own deal scope). */
exports.getById = async (actor, id) => {
  const customer = await findScoped(Customer, id, actor);
  const dealScope = await ownedScope(actor);
  const [full, deals] = await Promise.all([
    populated(customer._id).lean(),
    Deal.find(and({ customer: customer._id }, dealScope)).select('name stage status value probability expectedRevenue expectedClosingDate assignedTo').sort({ createdAt: -1 }).lean(),
  ]);
  return { ...full, deals };
};

exports.update = async (actor, id, data) => {
  const customer = await findScoped(Customer, id, actor);
  const { previous, current, changed } = applyChanges(customer, data, ['name', 'email', 'phone', 'company', 'address', 'status']);
  if (!changed.length) return populated(customer._id);
  await withTransaction(async (session) => {
    await customer.save(sess(session));
    await timeline.log(entry(T.CUSTOMER_UPDATED, customer, actor, previous, current), session);
  });
  return populated(customer._id);
};

exports.assign = async (actor, id, { assignedTo }) => {
  const customer = await findScoped(Customer, id, actor);
  const target = await assertAssignable(actor, assignedTo);
  if (customer.assignedTo && customer.assignedTo.equals(target._id)) throw new AppError('Customer is already assigned to this user', 400);
  const previous = customer.assignedTo;
  customer.assignedTo = target._id;
  await withTransaction(async (session) => {
    await customer.save(sess(session));
    await timeline.log(entry(T.CUSTOMER_ASSIGNED, customer, actor, { assignedTo: previous || null }, { assignedTo: target._id }, { assigneeName: target.name }), session);
  });
  return populated(customer._id);
};

exports.remove = async (actor, id) => {
  const customer = await findScoped(Customer, id, actor);
  if (await Deal.exists({ customer: customer._id })) throw new AppError('This customer has deals and cannot be deleted. Mark the customer Inactive instead', 409);
  await withTransaction(async (session) => {
    await Activity.deleteMany({ relatedModel: 'Customer', relatedTo: customer._id }, sess(session));
    await customer.deleteOne(sess(session));
    await timeline.log(entry(T.CUSTOMER_DELETED, customer, actor, { name: customer.name, email: customer.email }, null), session);
  });
};
