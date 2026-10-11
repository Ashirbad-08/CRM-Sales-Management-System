const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { ROLES, DEAL_STAGES } = require('../utils/constants');
const { and, dateRange } = require('../utils/query');
const { leadScope, ownedScope, activityScope, getTeamIds } = require('./scope.service');

const oid = (id) => new mongoose.Types.ObjectId(id);
const round2 = (n) => Math.round((n || 0) * 100) / 100;

exports.stats = async (actor, q) => {
  const [ls, os, as] = await Promise.all([leadScope(actor), ownedScope(actor), activityScope(actor)]);
  const assigned = q.assignedTo ? { assignedTo: oid(q.assignedTo) } : null;
  const range = dateRange('createdAt', q.from, q.to);
  const now = new Date();

  const leadMatch = and(ls, assigned, range);
  const custMatch = and(os, assigned, range);
  const dealMatch = and(os, assigned, range);
  const actMatch = and(as, assigned, range);

  const [leadGroups, customers, dealGroups, pending, overdue] = await Promise.all([
    Lead.aggregate([{ $match: leadMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Customer.countDocuments(custMatch),
    Deal.aggregate([{ $match: dealMatch }, { $group: { _id: '$status', count: { $sum: 1 }, totalValue: { $sum: '$value' }, expectedRevenue: { $sum: '$expectedRevenue' } } }]),
    Activity.countDocuments(and(actMatch, { status: 'Pending', $or: [{ dueDate: null }, { dueDate: { $gte: now } }] })),
    Activity.countDocuments(and(actMatch, { status: 'Pending', dueDate: { $lt: now } })),
  ]);

  const L = Object.fromEntries(leadGroups.map((g) => [g._id, g.count]));
  const D = Object.fromEntries(dealGroups.map((g) => [g._id, g]));
  const totalLeads = leadGroups.reduce((s, g) => s + g.count, 0);
  const converted = L.Converted || 0;

  return {
    leads: {
      total: totalLeads, new: L.New || 0, contacted: L.Contacted || 0, qualified: L.Qualified || 0,
      unqualified: L.Unqualified || 0, converted, lost: L.Lost || 0,
    },
    customers: { total: customers },
    deals: {
      total: dealGroups.reduce((s, g) => s + g.count, 0),
      open: D.open?.count || 0, won: D.won?.count || 0, lost: D.lost?.count || 0,
    },
    revenue: { total: round2(D.won?.totalValue), expected: round2(D.open?.expectedRevenue), openPipelineValue: round2(D.open?.totalValue) },
    conversionRate: totalLeads ? round2((converted / totalLeads) * 100) : 0,
    activities: { pending: pending, overdue },
  };
};

exports.pipeline = async (actor, q) => {
  const os = await ownedScope(actor);
  const match = and(os, q.assignedTo ? { assignedTo: oid(q.assignedTo) } : null, dateRange('createdAt', q.from, q.to));
  const groups = await Deal.aggregate([
    { $match: match },
    { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$value' }, expectedRevenue: { $sum: '$expectedRevenue' } } },
  ]);
  const byStage = Object.fromEntries(groups.map((g) => [g._id, g]));
  const stages = DEAL_STAGES.map((stage) => ({
    stage,
    count: byStage[stage]?.count || 0,
    totalValue: round2(byStage[stage]?.totalValue),
    expectedRevenue: round2(byStage[stage]?.expectedRevenue),
  }));
  return { stages, totalDeals: stages.reduce((s, x) => s + x.count, 0), totalValue: round2(stages.reduce((s, x) => s + x.totalValue, 0)) };
};

/** Per-executive performance. Managers: their team. Admins: everyone (optionally one manager's team). */
exports.teamPerformance = async (actor, q) => {
  const userFilter = { role: ROLES.EXECUTIVE };
  if (actor.role === ROLES.MANAGER) userFilter._id = { $in: await getTeamIds(actor) };
  else if (q.managerId) userFilter.manager = q.managerId;
  const members = await User.find(userFilter).select('name email isActive manager').sort({ name: 1 }).lean();
  const ids = members.map((m) => m._id);
  const range = dateRange('createdAt', q.from, q.to);
  const now = new Date();
  const cnt = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
  const hasDue = { $eq: [{ $type: '$dueDate' }, 'date'] };

  const [leads, deals, acts] = await Promise.all([
    Lead.aggregate([
      { $match: and({ assignedTo: { $in: ids } }, range) },
      { $group: { _id: '$assignedTo', total: { $sum: 1 }, qualified: cnt({ $eq: ['$status', 'Qualified'] }), converted: cnt({ $eq: ['$status', 'Converted'] }) } },
    ]),
    Deal.aggregate([
      { $match: and({ assignedTo: { $in: ids } }, range) },
      {
        $group: {
          _id: '$assignedTo', total: { $sum: 1 },
          open: cnt({ $eq: ['$status', 'open'] }), won: cnt({ $eq: ['$status', 'won'] }), lost: cnt({ $eq: ['$status', 'lost'] }),
          revenue: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$value', 0] } },
          expectedRevenue: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, '$expectedRevenue', 0] } },
        },
      },
    ]),
    Activity.aggregate([
      { $match: and({ assignedTo: { $in: ids } }, range) },
      {
        $group: {
          _id: '$assignedTo',
          overdue: cnt({ $and: [{ $eq: ['$status', 'Pending'] }, hasDue, { $lt: ['$dueDate', now] }] }),
          pending: cnt({ $and: [{ $eq: ['$status', 'Pending'] }, { $not: [{ $and: [hasDue, { $lt: ['$dueDate', now] }] }] }] }),
          completed: cnt({ $eq: ['$status', 'Completed'] }),
        },
      },
    ]),
  ]);

  const L = new Map(leads.map((x) => [String(x._id), x]));
  const D = new Map(deals.map((x) => [String(x._id), x]));
  const A = new Map(acts.map((x) => [String(x._id), x]));

  const team = members.map((m) => {
    const l = L.get(String(m._id)) || {};
    const d = D.get(String(m._id)) || {};
    const a = A.get(String(m._id)) || {};
    const totalLeads = l.total || 0;
    return {
      user: m,
      leads: { total: totalLeads, qualified: l.qualified || 0, converted: l.converted || 0, conversionRate: totalLeads ? round2(((l.converted || 0) / totalLeads) * 100) : 0 },
      deals: { total: d.total || 0, open: d.open || 0, won: d.won || 0, lost: d.lost || 0, winRate: d.won + d.lost ? round2((d.won / (d.won + d.lost)) * 100) : 0 },
      revenue: { won: round2(d.revenue), expected: round2(d.expectedRevenue) },
      activities: { pending: a.pending || 0, overdue: a.overdue || 0, completed: a.completed || 0 },
    };
  });

  const sum = (f) => team.reduce((s, t) => s + f(t), 0);
  return {
    totals: { members: team.length, leads: sum((t) => t.leads.total), converted: sum((t) => t.leads.converted), dealsWon: sum((t) => t.deals.won), revenue: round2(sum((t) => t.revenue.won)), overdueActivities: sum((t) => t.activities.overdue) },
    team,
  };
};

/** Admin sales report: revenue trend, lead sources, funnel and top performers. */
exports.salesReport = async (actor, q) => {
  const wonRange = dateRange('actualClosingDate', q.from, q.to);
  const leadRange = dateRange('createdAt', q.from, q.to);
  const [revenueByMonth, leadsBySource, leadsByStatus, topPerformers] = await Promise.all([
    Deal.aggregate([
      { $match: and({ status: 'won' }, wonRange) },
      { $group: { _id: { year: { $year: '$actualClosingDate' }, month: { $month: '$actualClosingDate' } }, deals: { $sum: 1 }, revenue: { $sum: '$value' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month', deals: 1, revenue: 1 } },
    ]),
    Lead.aggregate([
      { $match: leadRange || {} },
      { $group: { _id: '$source', leads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } } } },
      { $project: { _id: 0, source: '$_id', leads: 1, converted: 1 } },
      { $sort: { leads: -1 } },
    ]),
    Lead.aggregate([{ $match: leadRange || {} }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $project: { _id: 0, status: '$_id', count: 1 } }]),
    Deal.aggregate([
      { $match: and({ status: 'won' }, wonRange) },
      { $group: { _id: '$assignedTo', deals: { $sum: 1 }, revenue: { $sum: '$value' } } },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, userId: '$_id', name: '$user.name', email: '$user.email', deals: 1, revenue: 1 } },
    ]),
  ]);
  return { revenueByMonth, leadsBySource, leadsByStatus, topPerformers };
};
