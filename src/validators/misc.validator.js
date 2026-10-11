const { z } = require('zod');
const { TIMELINE_ACTIONS } = require('../utils/constants');
const { objectId, isoDate, dateTo, listQuery, rangeCheck, nonEmpty } = require('./common');

// ---- timeline
exports.timelineParams = z.object({
  entityType: z.string().transform((s) => s.toLowerCase()).pipe(z.enum(['lead', 'customer', 'deal'])).transform((s) => s[0].toUpperCase() + s.slice(1)),
  entityId: objectId,
});
exports.timelineQuery = listQuery.extend({ action: z.enum(Object.values(TIMELINE_ACTIONS)).optional() }).omit({ search: true });

// ---- dashboard
exports.dashboardQuery = z
  .object({ from: isoDate.optional(), to: dateTo.optional(), assignedTo: objectId.optional() })
  .superRefine(rangeCheck([['from', 'to']]));
exports.teamQuery = z
  .object({ from: isoDate.optional(), to: dateTo.optional(), managerId: objectId.optional() })
  .superRefine(rangeCheck([['from', 'to']]));
exports.reportQuery = z
  .object({ from: isoDate.optional(), to: dateTo.optional() })
  .superRefine(rangeCheck([['from', 'to']]));

// ---- crm configuration
const key = z.string().regex(/^[a-zA-Z0-9_.-]{2,64}$/, 'Key must be 2-64 chars: letters, numbers, _ . -');
exports.configKeyParams = z.object({ key });
exports.configUpsert = z
  .object({ value: z.any().refine((v) => v !== undefined, 'value is required'), description: z.string().trim().max(300).optional() })
  .strict();
exports.configQuery = listQuery.omit({ search: true });
void nonEmpty;
