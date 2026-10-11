const Timeline = require('../models/Timeline');
const { ROLES } = require('../utils/constants');
const { and, paginate } = require('../utils/query');
const { findScoped, MODELS } = require('./scope.service');

const opts = (session) => (session ? { session } : {});

async function log(entry, session) {
  const [doc] = await Timeline.create([entry], opts(session));
  return doc;
}

async function logMany(entries, session) {
  if (!entries.length) return [];
  return Timeline.create(entries, { ordered: true, ...opts(session) });
}

/** Timeline for a lead / customer / deal. Access follows the entity's own scope (admins may also read history of deleted records). */
async function getFor(actor, entityType, entityId, q) {
  const Model = MODELS[entityType];
  if (actor.role === ROLES.ADMIN) {
    // admins can read audit history even after the entity is deleted
  } else {
    await findScoped(Model, entityId, actor);
  }
  const filter = and({ entityType, entityId }, q.action ? { action: q.action } : null);
  return paginate(Timeline, filter, q, {
    sortable: ['timestamp', 'action'],
    defaultSort: { timestamp: -1 },
    populate: [['performedBy', 'name email role']],
    lean: true,
  });
}

module.exports = { log, logMany, getFor };
