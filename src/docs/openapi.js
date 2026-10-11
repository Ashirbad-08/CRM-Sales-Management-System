/** OpenAPI 3 spec, assembled programmatically from the same constants the validators use. */
const C = require('../utils/constants');

const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const str = (extra = {}) => ({ type: 'string', ...extra });
const oid = { type: 'string', pattern: '^[a-fA-F0-9]{24}$', example: '650f1c2e8a1b2c3d4e5f6a7b' };
const num = (extra = {}) => ({ type: 'number', ...extra });
const obj = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const en = (values) => ({ type: 'string', enum: values });
const dt = { type: 'string', format: 'date-time' };

const ERR = {
  400: 'Validation failed / invalid request',
  401: 'Missing, invalid or expired authentication',
  403: 'Forbidden: insufficient role or resource outside your scope',
  404: 'Resource not found',
  409: 'Conflict: duplicate data or business rule violation',
  429: 'Too many requests',
  500: 'Unexpected server error',
};
const errResp = (codes) => Object.fromEntries(codes.map((c) => [c, { description: ERR[c], content: { 'application/json': { schema: ref('Error') } } }]));

const q = (name, schema, description) => ({ name, in: 'query', required: false, schema, description });
const pathId = { name: 'id', in: 'path', required: true, schema: oid };
const pageQ = [
  q('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number'),
  q('limit', { type: 'integer', minimum: 1, maximum: 100, default: 10 }, 'Page size (max 100)'),
  q('sort', str(), 'Comma separated fields; prefix "-" for descending, e.g. "-createdAt,name"'),
  q('search', str(), 'Case-insensitive keyword search'),
];
const csv = (values, d) => q(d.name, { type: 'string', example: values.slice(0, 2).join(',') }, `${d.text} (comma separated: ${values.join(', ')})`);

function op({ tags, summary, description = '', roles, auth = true, params = [], query = [], body, bodyExample, ok = 200, data, list = false, errors = [400, 401, 403, 404] }) {
  const o = {
    tags, summary,
    description: [description, roles ? `**Roles:** ${roles.join(', ')}` : auth ? '**Roles:** any authenticated user' : '**Public**'].filter(Boolean).join('\n\n'),
    parameters: [...params, ...query],
    responses: {
      [ok]: {
        description: 'Success',
        content: { 'application/json': { schema: list ? ref('PagedResponse') : { allOf: [ref('Success'), obj({ data: data || {} })] } } },
      },
      ...errResp([...new Set([...errors, 500])].sort()),
    },
  };
  if (auth) o.security = [{ bearerAuth: [] }, { cookieAuth: [] }];
  else o.security = [];
  if (body) o.requestBody = { required: true, content: { 'application/json': { schema: body, ...(bodyExample ? { example: bodyExample } : {}) } } };
  return o;
}

const A = C.ROLES.ADMIN, M = C.ROLES.MANAGER;
const T = (t) => [t];
const P = {}; // paths
const add = (path, method, def) => { (P[path] ||= {})[method] = def; };

// ---------- schemas
const schemas = {
  Success: obj({ success: { type: 'boolean', example: true }, message: str({ example: 'Lead fetched successfully' }), data: {} }),
  Error: obj({ success: { type: 'boolean', example: false }, message: str({ example: 'Lead not found' }), errors: { type: 'array', items: obj({ field: str(), message: str() }) } }),
  Pagination: obj({ currentPage: { type: 'integer' }, pageSize: { type: 'integer' }, totalRecords: { type: 'integer' }, totalPages: { type: 'integer' }, hasNextPage: { type: 'boolean' }, hasPrevPage: { type: 'boolean' } }),
  PagedResponse: obj({ success: { type: 'boolean', example: true }, message: str(), data: { type: 'array', items: {} }, pagination: ref('Pagination') }),
  UserRef: obj({ _id: oid, name: str(), email: str(), role: en(Object.values(C.ROLES)) }),
  User: obj({ _id: oid, name: str(), email: str(), phone: str(), role: en(Object.values(C.ROLES)), isActive: { type: 'boolean' }, manager: oid, lastLoginAt: dt, createdAt: dt, updatedAt: dt }),
  Lead: obj({ _id: oid, name: str(), email: str(), phone: str(), company: str(), source: en(C.LEAD_SOURCES), status: en(C.LEAD_STATUSES), priority: en(C.PRIORITIES), assignedTo: ref('UserRef'), description: str(), convertedCustomer: oid, convertedDeal: oid, createdAt: dt, updatedAt: dt }),
  Customer: obj({ _id: oid, name: str(), email: str(), phone: str(), company: str(), address: ref('Address'), lead: oid, assignedTo: ref('UserRef'), status: en(C.CUSTOMER_STATUSES), createdAt: dt, updatedAt: dt }),
  Address: obj({ street: str(), city: str(), state: str(), country: str(), postalCode: str() }),
  Deal: obj({ _id: oid, name: str(), lead: oid, customer: oid, assignedTo: ref('UserRef'), value: num(), probability: num({ minimum: 0, maximum: 100 }), expectedRevenue: num({ description: 'Server-calculated: value x probability / 100 (value when Won, 0 when Lost)' }), expectedClosingDate: dt, actualClosingDate: dt, stage: en(C.DEAL_STAGES), status: en(C.DEAL_STATUSES), lostReason: str(), description: str(), createdAt: dt, updatedAt: dt }),
  Activity: obj({ _id: oid, type: en(C.ACTIVITY_TYPES), title: str(), description: str(), assignedTo: ref('UserRef'), dueDate: dt, status: { ...en(C.ACTIVITY_STATUSES), description: '"Overdue" is derived by the server from dueDate while Pending' }, relatedModel: en(C.RELATED_MODELS), relatedTo: oid, createdBy: ref('UserRef'), completedAt: dt }),
  TimelineEntry: obj({ _id: oid, action: en(Object.values(C.TIMELINE_ACTIONS)), entityType: en(C.TIMELINE_ENTITIES), entityId: oid, performedBy: ref('UserRef'), previousValue: {}, newValue: {}, metadata: {}, timestamp: dt }),
  AuthData: obj({ user: ref('User'), accessToken: str() }),
};

// ---------- auth
const AU = T('Authentication');
add('/auth/register', 'post', op({ tags: AU, summary: 'Register (creates a sales executive)', auth: false, ok: 201, errors: [400, 403, 409, 429], body: obj({ name: str(), email: str({ format: 'email' }), phone: str(), password: str({ description: 'min 8, upper+lower+digit' }) }, ['name', 'email', 'password']), bodyExample: { name: 'Jane Doe', email: 'jane@example.com', phone: '+919876543210', password: 'Strong@123' }, data: obj({ user: ref('User') }) }));
add('/auth/login', 'post', op({ tags: AU, summary: 'Login', description: 'Sets HTTP-only `accessToken` and `refreshToken` cookies and also returns the access token for Bearer use.', auth: false, errors: [400, 401, 403, 429], body: obj({ email: str(), password: str() }, ['email', 'password']), bodyExample: { email: 'admin@crm.local', password: 'Admin@12345' }, data: ref('AuthData') }));
add('/auth/refresh', 'post', op({ tags: AU, summary: 'Rotate refresh token', description: 'Reads the refresh token from the cookie (or body). Reuse of a rotated token revokes all sessions.', auth: false, errors: [401, 403, 429], body: obj({ refreshToken: str() }), data: ref('AuthData') }));
add('/auth/logout', 'post', op({ tags: AU, summary: 'Logout this device', auth: false, errors: [] }));
add('/auth/logout-all', 'post', op({ tags: AU, summary: 'Logout all devices', errors: [401] }));
add('/auth/me', 'get', op({ tags: AU, summary: 'Current user profile', errors: [401], data: obj({ user: ref('User') }) }));
add('/auth/me', 'patch', op({ tags: AU, summary: 'Update own name / phone', errors: [400, 401], body: obj({ name: str(), phone: str() }), data: obj({ user: ref('User') }) }));
add('/auth/change-password', 'patch', op({ tags: AU, summary: 'Change password (signs out other sessions)', errors: [400, 401, 429], body: obj({ currentPassword: str(), newPassword: str() }, ['currentPassword', 'newPassword']), data: ref('AuthData') }));

// ---------- users
const US = T('Users');
const userBody = obj({ name: str(), email: str(), phone: str(), password: str(), role: en(Object.values(C.ROLES)), manager: oid, isActive: { type: 'boolean' } }, ['name', 'email', 'password', 'role']);
add('/users', 'post', op({ tags: US, summary: 'Create user', roles: [A], ok: 201, errors: [400, 401, 403, 409], body: userBody, data: ref('User') }));
add('/users', 'get', op({ tags: US, summary: 'List users', roles: [A], list: true, query: [...pageQ, q('role', en(Object.values(C.ROLES))), q('status', en(['active', 'inactive'])), q('manager', oid)], errors: [400, 401, 403] }));
add('/users/assignable', 'get', op({ tags: US, summary: 'Active executives the caller can assign work to', roles: [A, M], errors: [401, 403] }));
add('/users/{id}', 'get', op({ tags: US, summary: 'Get user', roles: [A], params: [pathId], data: ref('User') }));
add('/users/{id}', 'patch', op({ tags: US, summary: 'Update user', roles: [A], params: [pathId], errors: [400, 401, 403, 404, 409], body: obj({ name: str(), email: str(), phone: str(), password: str(), role: en(Object.values(C.ROLES)), manager: oid }), data: ref('User') }));
add('/users/{id}', 'delete', op({ tags: US, summary: 'Delete user (only if they own no records)', roles: [A], params: [pathId], errors: [400, 401, 403, 404, 409] }));
add('/users/{id}/status', 'patch', op({ tags: US, summary: 'Activate / deactivate user', roles: [A], params: [pathId], body: obj({ isActive: { type: 'boolean' } }, ['isActive']), data: ref('User') }));

// ---------- leads
const LD = T('Leads');
add('/leads', 'post', op({ tags: LD, summary: 'Create lead', description: 'Executives always own the leads they create. Admin/manager may pass `assignedTo`.', ok: 201, errors: [400, 401, 403, 409], body: obj({ name: str(), email: str(), phone: str(), company: str(), source: en(C.LEAD_SOURCES), priority: en(C.PRIORITIES), assignedTo: oid, description: str() }, ['name', 'source']), bodyExample: { name: 'Acme Buyer', email: 'buyer@acme.com', phone: '+14155550123', company: 'Acme', source: 'Website', priority: 'High' }, data: ref('Lead') }));
add('/leads', 'get', op({ tags: LD, summary: 'List leads (scoped to caller)', list: true, errors: [400, 401], query: [...pageQ, csv(C.LEAD_STATUSES, { name: 'status', text: 'Status' }), csv(C.PRIORITIES, { name: 'priority', text: 'Priority' }), csv(C.LEAD_SOURCES, { name: 'source', text: 'Source' }), q('assignedTo', str({ description: 'User id or "unassigned"' })), q('createdFrom', dt, 'Created on/after'), q('createdTo', dt, 'Created on/before (date-only values include the whole day)')] }));
add('/leads/{id}', 'get', op({ tags: LD, summary: 'Get lead', params: [pathId], data: ref('Lead') }));
add('/leads/{id}', 'patch', op({ tags: LD, summary: 'Update lead (not status/assignment)', params: [pathId], errors: [400, 401, 403, 404, 409], body: obj({ name: str(), email: str(), phone: str(), company: str(), source: en(C.LEAD_SOURCES), priority: en(C.PRIORITIES), description: str() }), data: ref('Lead') }));
add('/leads/{id}', 'delete', op({ tags: LD, summary: 'Delete lead (not converted ones)', roles: [A, M], params: [pathId], errors: [401, 403, 404, 409] }));
add('/leads/{id}/status', 'patch', op({ tags: LD, summary: 'Update lead status', description: `Allowed transitions: ${JSON.stringify(C.LEAD_TRANSITIONS)}. "Converted" only via the convert endpoint.`, params: [pathId], body: obj({ status: en(C.LEAD_STATUSES), reason: str() }, ['status']), data: ref('Lead') }));
add('/leads/{id}/assign', 'patch', op({ tags: LD, summary: 'Assign / reassign lead', description: 'Assignee must be an active sales executive; managers are limited to their own team.', roles: [A, M], params: [pathId], errors: [400, 401, 403, 404, 409], body: obj({ assignedTo: oid }, ['assignedTo']), data: ref('Lead') }));
add('/leads/{id}/convert', 'post', op({ tags: LD, summary: 'Convert qualified lead -> customer + deal (transaction)', description: 'Lead must be Qualified, assigned and not already converted. Creates a Customer (referencing the lead) and a Deal (referencing both) atomically.', params: [pathId], ok: 201, errors: [400, 401, 403, 404, 409], body: obj({ customer: obj({ name: str(), company: str(), address: ref('Address') }), deal: obj({ name: str(), value: num({ exclusiveMinimum: 0 }), probability: num({ minimum: 0, maximum: 100 }), expectedClosingDate: dt, description: str() }, ['value', 'expectedClosingDate']) }, ['deal']), bodyExample: { deal: { name: 'Acme annual plan', value: 25000, expectedClosingDate: '2027-01-31' } }, data: obj({ lead: ref('Lead'), customer: ref('Customer'), deal: ref('Deal') }) }));
add('/leads/{id}/timeline', 'get', op({ tags: LD, summary: 'Lead timeline', params: [pathId], list: true, query: pageQ.slice(0, 3) }));
add('/leads/{id}/activities', 'get', op({ tags: LD, summary: 'Activities for a lead', params: [pathId], list: true, query: pageQ }));

// ---------- customers
const CU = T('Customers');
add('/customers', 'post', op({ tags: CU, summary: 'Create customer', ok: 201, errors: [400, 401, 403, 409], body: obj({ name: str(), email: str(), phone: str(), company: str(), address: ref('Address'), assignedTo: oid, status: en(C.CUSTOMER_STATUSES) }, ['name']), data: ref('Customer') }));
add('/customers', 'get', op({ tags: CU, summary: 'List customers', list: true, errors: [400, 401], query: [...pageQ, csv(C.CUSTOMER_STATUSES, { name: 'status', text: 'Status' }), q('assignedTo', str()), q('createdFrom', dt), q('createdTo', dt)] }));
add('/customers/{id}', 'get', op({ tags: CU, summary: 'Get customer with original lead and deals', params: [pathId], data: ref('Customer') }));
add('/customers/{id}', 'patch', op({ tags: CU, summary: 'Update customer', params: [pathId], errors: [400, 401, 403, 404, 409], body: obj({ name: str(), email: str(), phone: str(), company: str(), address: ref('Address'), status: en(C.CUSTOMER_STATUSES) }), data: ref('Customer') }));
add('/customers/{id}', 'delete', op({ tags: CU, summary: 'Delete customer (only when it has no deals)', roles: [A], params: [pathId], errors: [401, 403, 404, 409] }));
add('/customers/{id}/assign', 'patch', op({ tags: CU, summary: 'Assign / reassign customer', roles: [A, M], params: [pathId], body: obj({ assignedTo: oid }, ['assignedTo']), data: ref('Customer') }));
add('/customers/{id}/timeline', 'get', op({ tags: CU, summary: 'Customer timeline', params: [pathId], list: true, query: pageQ.slice(0, 3) }));
add('/customers/{id}/activities', 'get', op({ tags: CU, summary: 'Activities for a customer', params: [pathId], list: true, query: pageQ }));

// ---------- deals
const DL = T('Deals');
add('/deals', 'post', op({ tags: DL, summary: 'Create deal (starts in Qualification)', description: '`expectedRevenue`, `stage` and `status` are server-controlled; sending them is rejected.', ok: 201, errors: [400, 401, 403, 404], body: obj({ name: str(), customer: oid, assignedTo: oid, value: num({ exclusiveMinimum: 0 }), probability: num({ minimum: 0, maximum: 100 }), expectedClosingDate: dt, description: str() }, ['name', 'customer', 'value', 'expectedClosingDate']), data: ref('Deal') }));
add('/deals', 'get', op({ tags: DL, summary: 'List deals', list: true, errors: [400, 401], query: [...pageQ, csv(C.DEAL_STAGES, { name: 'stage', text: 'Stage' }), csv(C.DEAL_STATUSES, { name: 'status', text: 'Status' }), q('assignedTo', oid), q('customer', oid), q('lead', oid), q('minAmount', num()), q('maxAmount', num()), q('closingFrom', dt, 'Expected closing on/after'), q('closingTo', dt, 'Expected closing on/before'), q('createdFrom', dt), q('createdTo', dt)] }));
add('/deals/{id}', 'get', op({ tags: DL, summary: 'Get deal', params: [pathId], data: ref('Deal') }));
add('/deals/{id}', 'patch', op({ tags: DL, summary: 'Update deal details (not the stage)', description: 'Closed (Won/Lost) deals are frozen. Expected revenue is recalculated.', params: [pathId], errors: [400, 401, 403, 404, 409], body: obj({ name: str(), value: num({ exclusiveMinimum: 0 }), probability: num({ minimum: 0, maximum: 100 }), expectedClosingDate: dt, description: str() }), data: ref('Deal') }));
add('/deals/{id}', 'delete', op({ tags: DL, summary: 'Delete deal', roles: [A, M], params: [pathId], errors: [401, 403, 404] }));
add('/deals/{id}/stage', 'patch', op({ tags: DL, summary: 'Change deal stage', description: `Allowed transitions: ${JSON.stringify(C.DEAL_TRANSITIONS)}. Lost requires \`lostReason\`. Won sets probability 100 and revenue = value. Only an admin can reopen a closed deal (needs \`reopenReason\`).`, params: [pathId], errors: [400, 401, 403, 404], body: obj({ stage: en(C.DEAL_STAGES), lostReason: str(), reopenReason: str(), probability: num() }, ['stage']), data: ref('Deal') }));
add('/deals/{id}/assign', 'patch', op({ tags: DL, summary: 'Assign / reassign deal', roles: [A, M], params: [pathId], errors: [400, 401, 403, 404, 409], body: obj({ assignedTo: oid }, ['assignedTo']), data: ref('Deal') }));
add('/deals/{id}/timeline', 'get', op({ tags: DL, summary: 'Deal timeline', params: [pathId], list: true, query: pageQ.slice(0, 3) }));
add('/deals/{id}/activities', 'get', op({ tags: DL, summary: 'Activities for a deal', params: [pathId], list: true, query: pageQ }));

// ---------- activities
const AC = T('Activities');
add('/activities', 'post', op({ tags: AC, summary: 'Create activity / follow-up / note', description: 'Notes are stored as Completed. Non-note types require `dueDate`. `relatedModel` and `relatedTo` go together.', ok: 201, errors: [400, 401, 403, 404], body: obj({ type: en(C.ACTIVITY_TYPES), title: str(), description: str(), assignedTo: oid, dueDate: dt, relatedModel: en(C.RELATED_MODELS), relatedTo: oid }, ['type', 'title']), data: ref('Activity') }));
add('/activities', 'get', op({ tags: AC, summary: 'List activities', list: true, errors: [400, 401], query: [...pageQ, csv(C.ACTIVITY_TYPES, { name: 'type', text: 'Type' }), csv(C.ACTIVITY_STATUSES, { name: 'status', text: 'Status (Overdue is computed)' }), q('assignedTo', oid), q('relatedModel', en(C.RELATED_MODELS)), q('relatedTo', oid), q('dueFrom', dt), q('dueTo', dt)] }));
add('/activities/{id}', 'get', op({ tags: AC, summary: 'Get activity', params: [pathId], data: ref('Activity') }));
add('/activities/{id}', 'patch', op({ tags: AC, summary: 'Update activity', params: [pathId], errors: [400, 401, 403, 404, 409], body: obj({ title: str(), description: str(), dueDate: dt, assignedTo: oid }), data: ref('Activity') }));
add('/activities/{id}/complete', 'patch', op({ tags: AC, summary: 'Mark activity completed', params: [pathId], errors: [400, 401, 403, 404, 409], body: obj({ outcome: str() }), data: ref('Activity') }));
add('/activities/{id}', 'delete', op({ tags: AC, summary: 'Delete activity', params: [pathId], errors: [401, 403, 404] }));

// ---------- timeline / dashboard / config
add('/timeline/{entityType}/{entityId}', 'get', op({ tags: T('Timeline'), summary: 'Timeline for a lead, customer or deal', params: [{ name: 'entityType', in: 'path', required: true, schema: en(['lead', 'customer', 'deal']) }, { name: 'entityId', in: 'path', required: true, schema: oid }], list: true, query: [...pageQ.slice(0, 3), q('action', en(Object.values(C.TIMELINE_ACTIONS)))] }));
const rangeQ = [q('from', dt, 'Created on/after'), q('to', dt, 'Created on/before')];
const DB = T('Dashboard');
add('/dashboard/stats', 'get', op({ tags: DB, summary: 'Sales statistics (scoped to caller)', description: 'Leads, customers, deals, revenue, expected revenue, conversion rate, pending & overdue activities.', query: [...rangeQ, q('assignedTo', oid)], errors: [400, 401] }));
add('/dashboard/pipeline', 'get', op({ tags: DB, summary: 'Deals count/value per stage', query: [...rangeQ, q('assignedTo', oid)], errors: [400, 401] }));
add('/dashboard/team-performance', 'get', op({ tags: DB, summary: 'Per-executive performance', roles: [A, M], query: [...rangeQ, q('managerId', oid, 'Admin only: limit to one manager\'s team')], errors: [400, 401, 403] }));
add('/dashboard/reports/sales', 'get', op({ tags: DB, summary: 'Sales report: revenue by month, lead sources, top performers', roles: [A], query: rangeQ, errors: [400, 401, 403] }));
const CF = T('Configuration');
const keyP = { name: 'key', in: 'path', required: true, schema: str() };
add('/config', 'get', op({ tags: CF, summary: 'List CRM configuration', roles: [A], list: true, query: pageQ.slice(0, 3), errors: [401, 403] }));
add('/config/{key}', 'get', op({ tags: CF, summary: 'Get configuration value', roles: [A], params: [keyP], errors: [401, 403, 404] }));
add('/config/{key}', 'put', op({ tags: CF, summary: 'Create / replace configuration value', roles: [A], params: [keyP], errors: [400, 401, 403], body: obj({ value: {}, description: str() }, ['value']) }));
add('/config/{key}', 'delete', op({ tags: CF, summary: 'Delete configuration value', roles: [A], params: [keyP], errors: [401, 403, 404] }));

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'CRM Sales Management API',
    version: '1.0.0',
    description:
      'Leads -> qualification -> customer conversion -> deals -> closure.\n\n' +
      '**Auth:** `POST /auth/login` sets HTTP-only cookies and returns an access token. Use it as `Authorization: Bearer <token>` or rely on the cookie.\n\n' +
      '**Envelope:** success `{ success, message, data, pagination? }`; error `{ success: false, message, errors? }`.\n\n' +
      '**Roles:** `admin`, `sales_manager`, `sales_executive`. Record-level access is enforced on the server (executives see their assigned records; managers their team; admins everything).',
  },
  servers: [{ url: '/api/v1' }],
  tags: ['Authentication', 'Users', 'Leads', 'Customers', 'Deals', 'Activities', 'Timeline', 'Dashboard', 'Configuration'].map((name) => ({ name })),
  paths: P,
  components: {
    schemas,
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'accessToken' },
    },
  },
};
