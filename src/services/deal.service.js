const Customer = require('../models/Customer');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const AppError = require('../utils/AppError');
const { ROLES, ACTIVE_STAGES, CLOSED_STAGES, DEAL_TRANSITIONS, STAGE_PROBABILITY, TIMELINE_ACTIONS: T } = require('../utils/constants');
const { and, searchFilter, dateRange, applyChanges, paginate } = require('../utils/query');
const { assertClosingDate } = require('../utils/dealRules');
const { withTransaction } = require('../utils/transaction');
const { ownedScope, findScoped, assertAssignable } = require('./scope.service');
const timeline = require('./timeline.service');

const ASSIGNEE = 'name email role';
const sess = (session) => (session ? { session } : {});
const entry = (action, d, actor, previousValue, newValue, metadata) => ({ action, entityType: 'Deal', entityId: d._id, performedBy: actor._id, previousValue, newValue, metadata });
const populated = (id) => Deal.findById(id).populate('assignedTo', ASSIGNEE).populate('customer', 'name email company').populate('lead', 'name status');
const snapshot = (d) => ({ stage: d.stage, status: d.status, value: d.value, probability: d.probability, expectedRevenue: d.expectedRevenue });

exports.create = async (actor, data) => {
  assertClosingDate(data.expectedClosingDate);
  const customer = await findScoped(Customer, data.customer, actor);
  if (customer.status === 'Inactive') throw new AppError('Cannot create a deal for an inactive customer', 400);

  let assignedTo = customer.assignedTo;
  if (actor.role === ROLES.EXECUTIVE) {
    if (data.assignedTo && String(data.assignedTo) !== String(actor._id)) throw new AppError('Sales executives can only create deals assigned to themselves', 403);
    assignedTo = actor._id;
  } else if (data.assignedTo) {
    await assertAssignable(actor, data.assignedTo);
    assignedTo = data.assignedTo;
  }
  if (!assignedTo) throw new AppError('Deal must be assigned to a sales executive (assign the customer or pass assignedTo)', 400);

  const id = await withTransaction(async (session) => {
    const [deal] = await Deal.create(
      [{
        name: data.name,
        lead: customer.lead || null,
        customer: customer._id,
        assignedTo,
        value: data.value,
        probability: data.probability ?? STAGE_PROBABILITY.Qualification,
        expectedClosingDate: data.expectedClosingDate,
        description: data.description,
        stage: 'Qualification',
        createdBy: actor._id,
      }],
      sess(session)
    );
    await timeline.log(entry(T.DEAL_CREATED, deal, actor, null, { name: deal.name, ...snapshot(deal), customer: deal.customer }, { origin: 'manual' }), session);
    return deal._id;
  });
  return populated(id);
};

exports.list = async (actor, q) => {
  const amount = {};
  if (q.minAmount !== undefined) amount.$gte = q.minAmount;
  if (q.maxAmount !== undefined) amount.$lte = q.maxAmount;
  const filter = and(
    await ownedScope(actor),
    q.stage ? { stage: { $in: q.stage } } : null,
    q.status ? { status: { $in: q.status } } : null,
    q.assignedTo ? { assignedTo: q.assignedTo } : null,
    q.customer ? { customer: q.customer } : null,
    q.lead ? { lead: q.lead } : null,
    Object.keys(amount).length ? { value: amount } : null,
    searchFilter(q.search, ['name', 'description']),
    dateRange('expectedClosingDate', q.closingFrom, q.closingTo),
    dateRange('createdAt', q.createdFrom, q.createdTo)
  );
  return paginate(Deal, filter, q, {
    sortable: ['name', 'value', 'probability', 'expectedRevenue', 'expectedClosingDate', 'stage', 'status', 'createdAt', 'updatedAt'],
    defaultSort: { createdAt: -1 },
    populate: [['assignedTo', ASSIGNEE], ['customer', 'name company']],
    lean: true,
  });
};

exports.getById = async (actor, id) => {
  const deal = await findScoped(Deal, id, actor);
  return populated(deal._id);
};

exports.update = async (actor, id, data) => {
  const deal = await findScoped(Deal, id, actor);
  if (CLOSED_STAGES.includes(deal.stage)) throw new AppError(`A ${deal.stage} deal is closed and cannot be edited`, 409);
  if (data.expectedClosingDate) assertClosingDate(data.expectedClosingDate);

  const before = snapshot(deal);
  const { previous, current, changed } = applyChanges(deal, data, ['name', 'value', 'probability', 'expectedClosingDate', 'description']);
  if (!changed.length) return populated(deal._id);

  await withTransaction(async (session) => {
    await deal.save(sess(session)); // pre-validate hook recalculates expectedRevenue
    if (before.expectedRevenue !== deal.expectedRevenue) {
      previous.expectedRevenue = before.expectedRevenue;
      current.expectedRevenue = deal.expectedRevenue;
    }
    await timeline.log(entry(T.DEAL_UPDATED, deal, actor, previous, current), session);
  });
  return populated(deal._id);
};

exports.changeStage = async (actor, id, { stage, lostReason, reopenReason, probability }) => {
  const deal = await findScoped(Deal, id, actor);
  const from = deal.stage;
  if (from === stage) throw new AppError(`Deal is already in the "${stage}" stage`, 400);

  const before = snapshot(deal);
  const extra = [];
  let action = T.DEAL_STAGE_CHANGED;
  let metadata;

  if (CLOSED_STAGES.includes(from)) {
    // Closed deals are frozen; only an admin may reopen one, to an active stage, with a reason.
    if (actor.role !== ROLES.ADMIN) throw new AppError(`A ${from} deal is closed and cannot move to another stage. Only an admin can reopen it`, 403);
    if (!ACTIVE_STAGES.includes(stage)) throw new AppError('A closed deal can only be reopened into an active stage', 400);
    if (!reopenReason) throw new AppError('reopenReason is required to reopen a closed deal', 400);
    deal.stage = stage;
    deal.probability = probability ?? STAGE_PROBABILITY[stage];
    deal.lostReason = undefined;
    deal.actualClosingDate = undefined;
    action = T.DEAL_REOPENED;
    metadata = { reopenReason };
  } else {
    if (!DEAL_TRANSITIONS[from].includes(stage)) {
      throw new AppError(`Invalid stage transition: ${from} -> ${stage}. Allowed: ${DEAL_TRANSITIONS[from].join(', ')}`, 400);
    }
    if (stage === 'Won') {
      if (!(deal.value > 0)) throw new AppError('A won deal must have a deal value greater than zero', 400);
      if (!deal.customer || !deal.assignedTo || !deal.expectedClosingDate) throw new AppError('A won deal must have a customer, an owner and a closing date', 400);
      deal.stage = 'Won';
      deal.actualClosingDate = new Date();
    } else if (stage === 'Lost') {
      if (!lostReason) throw new AppError('A lost reason is required when marking a deal as Lost', 400);
      deal.stage = 'Lost';
      deal.lostReason = lostReason;
      deal.actualClosingDate = new Date();
    } else {
      deal.stage = stage;
      deal.probability = probability ?? STAGE_PROBABILITY[stage];
    }
  }

  await withTransaction(async (session) => {
    await deal.save(sess(session));
    const after = snapshot(deal);
    const entries = [entry(action, deal, actor, before, after, metadata)];
    if (stage === 'Won') entries.push(entry(T.DEAL_WON, deal, actor, before, after, { value: deal.value }));
    if (stage === 'Lost') entries.push(entry(T.DEAL_LOST, deal, actor, before, after, { reason: lostReason }));
    await timeline.logMany(entries.concat(extra), session);
  });
  return populated(deal._id);
};

exports.assign = async (actor, id, { assignedTo }) => {
  const deal = await findScoped(Deal, id, actor);
  if (CLOSED_STAGES.includes(deal.stage)) throw new AppError('A closed deal cannot be reassigned', 409);
  const target = await assertAssignable(actor, assignedTo);
  if (deal.assignedTo.equals(target._id)) throw new AppError('Deal is already assigned to this user', 400);
  const previous = deal.assignedTo;
  deal.assignedTo = target._id;
  await withTransaction(async (session) => {
    await deal.save(sess(session));
    await timeline.log(entry(T.DEAL_ASSIGNED, deal, actor, { assignedTo: previous }, { assignedTo: target._id }, { assigneeName: target.name }), session);
  });
  return populated(deal._id);
};

exports.remove = async (actor, id) => {
  const deal = await findScoped(Deal, id, actor);
  await withTransaction(async (session) => {
    await Activity.deleteMany({ relatedModel: 'Deal', relatedTo: deal._id }, sess(session));
    await deal.deleteOne(sess(session));
    await timeline.log(entry(T.DEAL_DELETED, deal, actor, { name: deal.name, ...snapshot(deal) }, null), session);
  });
};
