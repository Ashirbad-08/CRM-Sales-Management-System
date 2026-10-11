# CRM Sales Management System – Backend

Node.js · Express · MongoDB (Mongoose). No frontend.
Lead → qualification → customer conversion → deal → closure, with RBAC, audit timeline and analytics.

## Quick start

```bash
npm install
cp .env.example .env          # set the two JWT secrets
docker compose up -d          # single-node Mongo replica set (needed for transactions)
npm run seed                  # demo admin / manager / executives
npm run dev                   # http://localhost:5000  ·  Swagger UI: /api-docs
```

No Docker? Use any MongoDB and set `USE_TRANSACTIONS=false` (lead conversion then uses an atomic claim + compensating cleanup instead of a transaction). MongoDB Atlas works with `USE_TRANSACTIONS=true`.

Seeded logins: `admin@crm.local / Admin@12345`, `manager@crm.local`, `eli@crm.local`, `esha@crm.local` (`Password@123`).

## Structure

```
src/
  config/        env + db connection
  models/        User, Lead, Customer, Deal, Activity, Timeline, Config
  validators/    Zod schemas (body / query / params), strict on bodies
  middleware/    auth (authenticate, authorize), validate, errorHandler
  controllers/   thin HTTP layer
  services/      business rules (scope, lead, customer, deal, activity, timeline, dashboard, auth, user)
  routes/        /api/v1/*
  utils/         AppError, pagination/query helpers, transactions, constants
  docs/openapi.js  Swagger spec (served at /api-docs and /api-docs.json)
```

## Roles & access (enforced in `scope.service.js`)

| | Admin | Sales Manager | Sales Executive |
|---|---|---|---|
| Users CRUD / activate | ✅ | – | – |
| Leads / customers / deals visible | all | own team (+ unassigned leads) | assigned to them |
| Assign / reassign | any active executive | executives in own team | – |
| Create/update leads, activities, convert | ✅ | ✅ (team) | ✅ (own) |
| Delete lead / deal | ✅ | ✅ | – |
| Delete customer | ✅ | – | – |
| Reopen closed deal | ✅ | – | – |
| Team performance | ✅ | ✅ | – |
| Sales report, CRM config | ✅ | – | – |

Team = executives whose `manager` is that manager. Records outside a caller's scope return **404** (not 403) so existence isn't leaked.

## Authentication

- bcrypt (cost 12), JWT access (15 min) + refresh (7 days, rotated, hashed in DB, max 5 devices, reuse detection).
- Tokens are set as HTTP-only cookies and the access token is also returned for `Authorization: Bearer`.
- `tokenVersion` is bumped on password change, deactivation and logout-all, which kills all tokens immediately.
- Public `/auth/register` can only create `sales_executive`; admins create other roles.

## Key business rules

- **Lead status** transitions are validated (e.g. `New → Contacted → Qualified`); `Converted` is reachable only via `POST /leads/:id/convert`.
- **Conversion** (`Qualified`, assigned, not converted): in one transaction the lead is atomically claimed, then Customer (→ lead) and Deal (→ customer, lead) are created, links saved and 3 timeline entries written. Unique index on `customer.lead` is a second guard against double conversion.
- **Deals**: start in `Qualification`; stage graph enforced; `Lost` needs a reason; `Won` sets probability 100 and revenue = value; closed deals are frozen (admin-only reopen with reason); value > 0; probability 0–100; `expectedRevenue` is always server-calculated (clients sending it are rejected); closing date can't be in the past or > 5 years out.
- **Activities**: stored as `Pending`/`Completed`; `Overdue` is derived from `dueDate` at read time and in filters/aggregations.
- **Timeline**: append-only collection (update/delete blocked at model level) with action, entity, actor, previous/new value, timestamp. Admins can still read history of deleted records.

## MongoDB design

References between collections (no unbounded embedding): `Lead ← Customer(lead) ← Deal(customer, lead)`; `Activity(relatedModel, relatedTo via refPath)`; `Timeline(entityType, entityId)`; users referenced by `assignedTo` / `createdBy`. Address is embedded in Customer.
Indexes: user email (unique), role+isActive, manager; lead status+createdAt, assignedTo+status+createdAt, source, priority, email (partial unique); customer email, lead (partial unique), assignedTo+status; deal stage, assignedTo+stage, status+value, expectedClosingDate, customer, lead; activity assignedTo+status+dueDate, related entity, dueDate; timeline entity+timestamp. Dashboards use aggregation pipelines; lists use `lean()` + `Promise.all` for data and count.

## Lists: pagination, search, sort, filters

All list endpoints accept `page`, `limit` (≤100), `sort` (`-createdAt,name`, whitelisted), `search`, and combinable filters. Multi-value filters are comma separated.

```
GET /api/v1/leads?status=New,Contacted&priority=High&source=Website&assignedTo=<id>&createdFrom=2026-01-01&createdTo=2026-03-31&search=acme&sort=-createdAt&page=2&limit=20
GET /api/v1/deals?stage=Proposal,Negotiation&minAmount=5000&maxAmount=50000&closingFrom=2026-11-01&closingTo=2026-12-31&status=open
```
Response: `{ success, message, data: [...], pagination: { currentPage, pageSize, totalRecords, totalPages, hasNextPage, hasPrevPage } }`

## Endpoints (all under `/api/v1`)

- **Auth**: `POST /auth/register|login|refresh|logout|logout-all`, `GET|PATCH /auth/me`, `PATCH /auth/change-password`
- **Users** (admin): `POST|GET /users`, `GET /users/assignable` (admin/manager), `GET|PATCH|DELETE /users/:id`, `PATCH /users/:id/status`
- **Leads**: `POST|GET /leads`, `GET|PATCH|DELETE /leads/:id`, `PATCH /leads/:id/status`, `PATCH /leads/:id/assign`, `POST /leads/:id/convert`, `GET /leads/:id/timeline|activities`
- **Customers**: `POST|GET /customers`, `GET|PATCH|DELETE /customers/:id`, `PATCH /customers/:id/assign`, `GET /customers/:id/timeline|activities`
- **Deals**: `POST|GET /deals`, `GET|PATCH|DELETE /deals/:id`, `PATCH /deals/:id/stage`, `PATCH /deals/:id/assign`, `GET /deals/:id/timeline|activities`
- **Activities**: `POST|GET /activities`, `GET|PATCH|DELETE /activities/:id`, `PATCH /activities/:id/complete`
- **Timeline**: `GET /timeline/:lead|customer|deal/:id`
- **Dashboard**: `GET /dashboard/stats`, `/dashboard/pipeline`, `/dashboard/team-performance`, `/dashboard/reports/sales`
- **Config** (admin): `GET /config`, `GET|PUT|DELETE /config/:key`

## Errors & security

Centralised handler → `{ success:false, message, errors? }` for validation, auth, forbidden, not found, duplicate key (409), cast errors, malformed JSON, CORS and unexpected errors; stack traces only outside production and never in the body in production.
Helmet, CORS allow-list, global + stricter auth rate limits, 100 kb body limit, `express-mongo-sanitize`, strict Zod bodies (blocks mass assignment such as `role` or `expectedRevenue`), no passwords/tokens in responses or logs, constant-time-ish login for unknown emails.

## Example flow

```bash
# login
curl -c jar -X POST localhost:5000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"eli@crm.local","password":"Password@123"}'
# create → qualify → convert
curl -b jar -X POST localhost:5000/api/v1/leads -H 'content-type: application/json' -d '{"name":"Acme Buyer","email":"buyer@acme.com","source":"Website"}'
curl -b jar -X PATCH localhost:5000/api/v1/leads/<id>/status -H 'content-type: application/json' -d '{"status":"Contacted"}'
curl -b jar -X PATCH localhost:5000/api/v1/leads/<id>/status -H 'content-type: application/json' -d '{"status":"Qualified"}'
curl -b jar -X POST  localhost:5000/api/v1/leads/<id>/convert -H 'content-type: application/json' -d '{"deal":{"value":25000,"expectedClosingDate":"2027-01-31"}}'
```
