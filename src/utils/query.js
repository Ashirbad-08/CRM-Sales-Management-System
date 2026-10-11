const AppError = require('./AppError');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Combine filters with $and, skipping empty ones. */
function and(...filters) {
  const f = filters.filter((x) => x && Object.keys(x).length > 0);
  if (f.length === 0) return {};
  if (f.length === 1) return f[0];
  return { $and: f };
}

function getPagination(q) {
  const page = q.page || 1;
  const limit = q.limit || 10;
  return { page, limit, skip: (page - 1) * limit };
}

/** "-createdAt,name" -> { createdAt: -1, name: 1 } validated against a whitelist. _id is appended for stable paging. */
function parseSort(sortStr, allowed, defaultSort = { createdAt: -1 }) {
  let sort = defaultSort;
  if (sortStr) {
    sort = {};
    for (const raw of sortStr.split(',').map((s) => s.trim()).filter(Boolean)) {
      const field = raw.replace(/^[-+]/, '');
      if (!allowed.includes(field)) {
        throw new AppError(`Invalid sort field "${field}". Allowed: ${allowed.join(', ')}`, 400);
      }
      sort[field] = raw.startsWith('-') ? -1 : 1;
    }
  }
  return { ...sort, _id: -1 };
}

function buildMeta({ page, limit, total }) {
  const totalPages = Math.ceil(total / limit) || 0;
  return { currentPage: page, pageSize: limit, totalRecords: total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 };
}

function searchFilter(term, fields) {
  if (!term) return null;
  const rx = new RegExp(escapeRegex(term), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

function dateRange(field, from, to) {
  if (!from && !to) return null;
  const r = {};
  if (from) r.$gte = from;
  if (to) r.$lte = to;
  return { [field]: r };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Assign changed fields onto a document and report previous/new values (for the audit timeline). */
function applyChanges(doc, data, fields) {
  const previous = {};
  const current = {};
  for (const f of fields) {
    if (data[f] !== undefined && !same(doc[f], data[f])) {
      previous[f] = doc[f] === undefined ? null : doc[f];
      current[f] = data[f];
      doc[f] = data[f];
    }
  }
  return { previous, current, changed: Object.keys(current) };
}

/** Run a list query and return { items, meta }. */
async function paginate(Model, filter, q, { sortable, defaultSort, populate, select, lean = false }) {
  const { page, limit, skip } = getPagination(q);
  const sort = parseSort(q.sort, sortable, defaultSort);
  let query = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) query = query.select(select);
  if (populate) for (const p of populate) query = query.populate(p[0], p[1]);
  if (lean) query = query.lean();
  const [items, total] = await Promise.all([query, Model.countDocuments(filter)]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

module.exports = { escapeRegex, and, getPagination, parseSort, buildMeta, searchFilter, dateRange, applyChanges, paginate };
