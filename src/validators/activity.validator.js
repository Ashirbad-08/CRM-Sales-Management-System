const { z } = require('zod');
const { ACTIVITY_TYPES, ACTIVITY_STATUSES, RELATED_MODELS } = require('../utils/constants');
const { objectId, isoDate, dateTo, csvEnum, listQuery, rangeCheck, nonEmpty, nonEmptyMsg } = require('./common');

const title = z.string().trim().min(2).max(200);
const description = z.string().trim().max(2000);

exports.create = z
  .object({
    type: z.enum(ACTIVITY_TYPES),
    title,
    description: description.optional(),
    assignedTo: objectId.optional(),
    dueDate: isoDate.optional(),
    relatedModel: z.enum(RELATED_MODELS).optional(),
    relatedTo: objectId.optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.type !== 'Note' && !d.dueDate) ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'dueDate is required for this activity type' });
    if (!!d.relatedModel !== !!d.relatedTo) ctx.addIssue({ code: 'custom', path: ['relatedTo'], message: 'relatedModel and relatedTo must be provided together' });
  });

exports.update = z
  .object({ title: title.optional(), description: description.optional(), dueDate: isoDate.optional(), assignedTo: objectId.optional() })
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

exports.complete = z.object({ outcome: z.string().trim().max(1000).optional() }).strict();

exports.query = listQuery
  .extend({
    type: csvEnum(ACTIVITY_TYPES).optional(),
    status: csvEnum(ACTIVITY_STATUSES).optional(),
    assignedTo: objectId.optional(),
    relatedModel: z.enum(RELATED_MODELS).optional(),
    relatedTo: objectId.optional(),
    dueFrom: isoDate.optional(),
    dueTo: dateTo.optional(),
  })
  .superRefine(rangeCheck([['dueFrom', 'dueTo']]));
