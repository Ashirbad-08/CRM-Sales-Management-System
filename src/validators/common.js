const { z } = require('zod');

const objectId = z.string({ required_error: 'ID is required', invalid_type_error: 'Invalid ID' }).regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');
const idParams = z.object({ id: objectId });

const email = z.string().trim().toLowerCase().email('Invalid email address').max(254);
const phone = z.string().trim().regex(/^\+?[0-9\s\-()]{7,15}$/, 'Invalid phone number (7-15 digits, optional leading +)');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a number');

const dateStr = z.string().trim().refine((s) => s !== '' && !Number.isNaN(Date.parse(s)), 'Invalid date');
const isoDate = dateStr.transform((s) => new Date(s));
// A date-only upper bound ("2026-10-31") includes the whole day.
const dateTo = dateStr.transform((s) => {
  const d = new Date(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d.setUTCHours(23, 59, 59, 999);
  return d;
});

const csvEnum = (values) =>
  z.string().trim().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.enum(values)).min(1));

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.string().trim().max(100).optional(),
  search: z.string().trim().max(100).optional(),
});

const rangeCheck = (pairs) => (obj, ctx) => {
  for (const [a, b] of pairs) {
    if (obj[a] && obj[b] && obj[a] > obj[b]) ctx.addIssue({ code: 'custom', path: [a], message: `"${a}" must not be after "${b}"` });
  }
};

const nonEmpty = (o) => Object.keys(o).length > 0;
const nonEmptyMsg = { message: 'At least one field is required' };

module.exports = { objectId, idParams, email, phone, password, isoDate, dateTo, dateStr, csvEnum, listQuery, rangeCheck, nonEmpty, nonEmptyMsg };
