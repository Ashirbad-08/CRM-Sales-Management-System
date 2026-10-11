const { z } = require('zod');
const { DEAL_STAGES, DEAL_STATUSES } = require('../utils/constants');
const { objectId, isoDate, dateTo, csvEnum, listQuery, rangeCheck, nonEmpty, nonEmptyMsg } = require('./common');

const value = z.number({ required_error: 'Deal value is required', invalid_type_error: 'Deal value must be a number' }).gt(0, 'Deal value must be greater than zero').max(1e12);
const probability = z.number({ invalid_type_error: 'Probability must be a number' }).min(0, 'Probability must be between 0 and 100').max(100, 'Probability must be between 0 and 100');
const name = z.string().trim().min(2).max(150);
const description = z.string().trim().max(2000);

// expectedRevenue, stage, status are intentionally absent: .strict() rejects them if a client sends them.
exports.create = z
  .object({
    name,
    customer: objectId,
    assignedTo: objectId.optional(),
    value,
    probability: probability.optional(),
    expectedClosingDate: isoDate,
    description: description.optional(),
  })
  .strict();

exports.update = z
  .object({ name: name.optional(), value: value.optional(), probability: probability.optional(), expectedClosingDate: isoDate.optional(), description: description.optional() })
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

exports.stage = z
  .object({
    stage: z.enum(DEAL_STAGES),
    lostReason: z.string().trim().min(5, 'Lost reason must be at least 5 characters').max(500).optional(),
    reopenReason: z.string().trim().min(5, 'Reopen reason must be at least 5 characters').max(500).optional(),
    probability: probability.optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.stage === 'Lost' && !d.lostReason) ctx.addIssue({ code: 'custom', path: ['lostReason'], message: 'A lost reason is required when marking a deal as Lost' });
  });

exports.assign = z.object({ assignedTo: objectId }).strict();

exports.query = listQuery
  .extend({
    stage: csvEnum(DEAL_STAGES).optional(),
    status: csvEnum(DEAL_STATUSES).optional(),
    assignedTo: objectId.optional(),
    customer: objectId.optional(),
    lead: objectId.optional(),
    minAmount: z.coerce.number().min(0).optional(),
    maxAmount: z.coerce.number().min(0).optional(),
    closingFrom: isoDate.optional(),
    closingTo: dateTo.optional(),
    createdFrom: isoDate.optional(),
    createdTo: dateTo.optional(),
  })
  .superRefine((o, ctx) => {
    rangeCheck([['closingFrom', 'closingTo'], ['createdFrom', 'createdTo']])(o, ctx);
    if (o.minAmount !== undefined && o.maxAmount !== undefined && o.minAmount > o.maxAmount) {
      ctx.addIssue({ code: 'custom', path: ['minAmount'], message: '"minAmount" must not exceed "maxAmount"' });
    }
  });
