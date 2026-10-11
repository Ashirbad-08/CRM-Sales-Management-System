const config = require('../config/env');
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const Timeline = require('../models/Timeline');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { ROLES, LEAD_TRANSITIONS, STAGE_PROBABILITY, TIMELINE_ACTIONS: T } = require('../utils/constants');
const { and, searchFilter, dateRange, applyChanges, paginate } = require('../utils/query');
const { assertClosingDate } = require('../utils/dealRules');
const { withTransaction } = require('../utils/transaction');
const { leadScope, findScoped, assertAssignable } = require('./scope.service');
const timeline = require('./timeline.service');

const ASSIGNEE = 'name email role';
const populated = (id) => Lead.findById(id).populate('assignedTo', ASSIGNEE).populate('createdBy', ASSIGNEE);
const entry = (action, lead, actor, previousValue, newValue, metadata) => ({
  action, entityType: 'Lead', entityId: lead._id, performedBy: actor._id, previousValue, newValue, metadata,
});
const sess = (session) => (session ? { session } : {});

exports.create = async (actor, data) => {
  const doc = { ...data, createdBy: actor._id };
  if (actor.role === ROLES.EXECUTIVE) {
    if (data.assignedTo && String(data.assignedTo) !== String(actor._id)) {
      throw new AppError('Sales executives can only create leads assigned to themselves', 403);
    }
    doc.assignedTo = actor._id;
  } else if (data.assignedTo) {
    await assertAssignable(actor, data.assignedTo);
  }

  const id = await withTransaction(async (session) => {
    const [lead] = await Lead.create([doc], sess(session));
    const entries = [entry(T.LEAD_CREATED, lead, actor, null, { name: lead.name, status: lead.status, priority: lead.priority, source: lead.source })];
    if (lead.assignedTo && actor.role !== ROLES.EXECUTIVE) entries.push(entry(T.LEAD_ASSIGNED, lead, actor, { assignedTo: null }, { assignedTo: lead.assignedTo }));
    await timeline.logMany(entries, session);
    return lead._id;
  });
  return populated(id);
};

exports.list = async (actor, q) => {
  const scope = await leadScope(actor);
  const filter = and(
    scope,
    q.status ? { status: { $in: q.status } } : null,
    q.priority ? { priority: { $in: q.priority } } : null,
    q.source ? { source: { $in: q.source } } : null,
    q.assignedTo === 'unassigned' ? { assignedTo: null } : q.assignedTo ? { assignedTo: q.assignedTo } : null,
    searchFilter(q.search, ['name', 'email', 'phone', 'company']),
    dateRange('createdAt', q.createdFrom, q.createdTo)
  );
  return paginate(Lead, filter, q, {
    sortable: ['name', 'company', 'status', 'priority', 'source', 'createdAt', 'updatedAt'],
    defaultSort: { createdAt: -1 },
    populate: [['assignedTo', ASSIGNEE]],
    lean: true,
  });
};

exports.getById = async (actor, id) => {
  const lead = await findScoped(Lead, id, actor);
  return populated(lead._id).populate('convertedCustomer', 'name email').populate('convertedDeal', 'name stage value');
};

exports.update = async (actor, id, data) => {
  const lead = await findScoped(Lead, id, actor);
  if (lead.status === 'Converted') throw new AppError('A converted lead can no longer be edited', 409);

  const { previous, current, changed } = applyChanges(lead, data, ['name', 'email', 'phone', 'company', 'source', 'priority', 'description']);
  if (!changed.length) return populated(lead._id);

  await withTransaction(async (session) => {
    await lead.save(sess(session));
    const entries = [];
    if (changed.includes('priority')) {
      entries.push(entry(T.LEAD_PRIORITY_CHANGED, lead, actor, { priority: previous.priority }, { priority: current.priority }));
    }
    const rest = changed.filter((f) => f !== 'priority');
    if (rest.length) {
      const pick = (o) => Object.fromEntries(rest.map((f) => [f, o[f]]));
      entries.push(entry(T.LEAD_UPDATED, lead, actor, pick(previous), pick(current)));
    }
    await timeline.logMany(entries, session);
  });
  return populated(lead._id);
};

exports.updateStatus = async (actor, id, { status, reason }) => {
  const lead = await findScoped(Lead, id, actor);
  if (status === 'Converted') throw new AppError('Use POST /leads/:id/convert to convert a lead', 400);
  if (lead.status === 'Converted') throw new AppError('A converted lead can no longer change status', 409);
  if (lead.status === status) throw new AppError(`Lead is already "${status}"`, 400);
  if (!LEAD_TRANSITIONS[lead.status].includes(status)) {
    throw new AppError(`Invalid status transition: ${lead.status} -> ${status}. Allowed: ${LEAD_TRANSITIONS[lead.status].join(', ') || 'none'}`, 400);
  }
  const prev = lead.status;
  lead.status = status;
  lead.statusReason = reason || undefined;

  await withTransaction(async (session) => {
    await lead.save(sess(session));
    await timeline.log(entry(T.LEAD_STATUS_CHANGED, lead, actor, { status: prev }, { status }, reason ? { reason } : undefined), session);
  });
  return populated(lead._id);
};

exports.assign = async (actor, id, { assignedTo }) => {
  const lead = await findScoped(Lead, id, actor);
  if (lead.status === 'Converted') throw new AppError('A converted lead cannot be reassigned', 409);
  const target = await assertAssignable(actor, assignedTo);
  if (lead.assignedTo && lead.assignedTo.equals(target._id)) throw new AppError('Lead is already assigned to this user', 400);

  const previous = lead.assignedTo;
  lead.assignedTo = target._id;
  await withTransaction(async (session) => {
    await lead.save(sess(session));
    await timeline.log(
      entry(previous ? T.LEAD_REASSIGNED : T.LEAD_ASSIGNED, lead, actor, { assignedTo: previous || null }, { assignedTo: target._id }, { assigneeName: target.name }),
      session
    );
  });
  return populated(lead._id);
};

exports.remove = async (actor, id) => {
  const lead = await findScoped(Lead, id, actor);
  if (lead.status === 'Converted') throw new AppError('A converted lead cannot be deleted (it is referenced by a customer and deal)', 409);
  await withTransaction(async (session) => {
    await Activity.deleteMany({ relatedModel: 'Lead', relatedTo: lead._id }, sess(session));
    await lead.deleteOne(sess(session));
    await timeline.log(entry(T.LEAD_DELETED, lead, actor, { name: lead.name, status: lead.status, email: lead.email }, null), session);
  });
};

/**
 * Lead -> Customer -> Deal, atomically.
 *  1. The lead is claimed with a conditional update (status Qualified AND not yet converted), so two
 *     concurrent requests can never both succeed.
 *  2. Customer + Deal + links + timeline are written in one transaction; any failure rolls everything back.
 *  3. Without transactions (standalone mongod), a compensating cleanup restores the lead on failure.
 */
exports.convert = async (actor, id, payload) => {
  const lead = await findScoped(Lead, id, actor);
  if (lead.status === 'Converted' || lead.convertedAt) throw new AppError('This lead has already been converted', 409);
  if (lead.status !== 'Qualified') throw new AppError(`Only Qualified leads can be converted (current status: ${lead.status})`, 400);
  if (!lead.assignedTo) throw new AppError('Assign the lead to a sales executive before converting it', 400);
  const assignee = await User.findById(lead.assignedTo);
  if (!assignee || !assignee.isActive) throw new AppError('The assigned user is inactive. Reassign the lead before converting it', 400);

  const dealIn = payload.deal;
  const customerIn = payload.customer || {};
  assertClosingDate(dealIn.expectedClosingDate);
  if (lead.email && (await Customer.exists({ email: lead.email }))) throw new AppError('A customer with this email already exists', 409);

  const created = {};
  try {
    const result = await withTransaction(async (session) => {
      const claimed = await Lead.findOneAndUpdate(
        { _id: lead._id, status: 'Qualified', convertedAt: null, assignedTo: lead.assignedTo },
        { $set: { status: 'Converted', convertedAt: new Date() } },
        { new: true, ...sess(session) }
      );
      if (!claimed) throw new AppError('The lead was converted or modified by someone else. Please reload and retry', 409);

      const [customer] = await Customer.create(
        [{
          name: customerIn.name || lead.name,
          email: lead.email,
          phone: lead.phone,
          company: customerIn.company || lead.company,
          address: customerIn.address,
          lead: lead._id,
          assignedTo: lead.assignedTo,
          createdBy: actor._id,
        }],
        sess(session)
      );
      created.customer = customer._id;

      const [deal] = await Deal.create(
        [{
          name: dealIn.name || `${lead.company || lead.name} - Opportunity`,
          lead: lead._id,
          customer: customer._id,
          assignedTo: lead.assignedTo,
          value: dealIn.value,
          probability: dealIn.probability ?? STAGE_PROBABILITY.Qualification,
          expectedClosingDate: dealIn.expectedClosingDate,
          description: dealIn.description,
          stage: 'Qualification',
          createdBy: actor._id,
        }],
        sess(session)
      );
      created.deal = deal._id;

      claimed.convertedCustomer = customer._id;
      claimed.convertedDeal = deal._id;
      await claimed.save(sess(session));

      await timeline.logMany(
        [
          { action: T.LEAD_CONVERTED, entityType: 'Lead', entityId: lead._id, performedBy: actor._id, previousValue: { status: 'Qualified' }, newValue: { status: 'Converted', customer: customer._id, deal: deal._id } },
          { action: T.CUSTOMER_CREATED, entityType: 'Customer', entityId: customer._id, performedBy: actor._id, newValue: { name: customer.name, email: customer.email, lead: lead._id }, metadata: { origin: 'lead_conversion' } },
          { action: T.DEAL_CREATED, entityType: 'Deal', entityId: deal._id, performedBy: actor._id, newValue: { name: deal.name, value: deal.value, stage: deal.stage, customer: customer._id, lead: lead._id }, metadata: { origin: 'lead_conversion' } },
        ],
        session
      );
      return { lead: claimed, customer, deal };
    });
    return result;
  } catch (err) {
    if (!config.useTransactions) await compensate(lead._id, created);
    throw err;
  }
};

async function compensate(leadId, created) {
  try {
    const ids = [created.customer, created.deal].filter(Boolean);
    if (created.deal) await Deal.deleteOne({ _id: created.deal });
    if (created.customer) await Customer.deleteOne({ _id: created.customer });
    await Timeline.collection.deleteMany({ $or: [{ entityId: { $in: ids } }, { entityId: leadId, action: T.LEAD_CONVERTED }] });
    await Lead.updateOne(
      { _id: leadId, status: 'Converted' },
      { $set: { status: 'Qualified' }, $unset: { convertedAt: 1, convertedCustomer: 1, convertedDeal: 1 } }
    );
  } catch (e) {
    console.error('Lead conversion compensation failed:', e.message);
  }
}
