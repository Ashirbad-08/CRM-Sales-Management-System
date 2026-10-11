const { z } = require('zod');
const { LEAD_SOURCES, LEAD_STATUSES, PRIORITIES } = require('../utils/constants');
const { objectId, email, phone, isoDate, dateTo, csvEnum, listQuery, rangeCheck, nonEmpty, nonEmptyMsg } = require('./common');

const fields = {
  name: z.string().trim().min(2).max(100),
  email,
  phone,
  company: z.string().trim().max(150),
  source: z.enum(LEAD_SOURCES),
  priority: z.enum(PRIORITIES),
  description: z.string().trim().max(2000),
};

exports.create = z
  .object({
    name: fields.name,
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    company: fields.company.optional(),
    source: fields.source,
    priority: fields.priority.optional(),
    assignedTo: objectId.optional(),
    description: fields.description.optional(),
  })
  .strict()
  .refine((d) => d.email || d.phone, { message: 'Either email or phone is required', path: ['email'] });

exports.update = z
  .object({
    name: fields.name.optional(),
    email: fields.email.optional(),
    phone: fields.phone.optional(),
    company: fields.company.optional(),
    source: fields.source.optional(),
    priority: fields.priority.optional(),
    description: fields.description.optional(),
  })
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

exports.status = z
  .object({ status: z.enum(LEAD_STATUSES), reason: z.string().trim().max(500).optional() })
  .strict();

exports.assign = z.object({ assignedTo: objectId }).strict();

exports.convert = z
  .object({
    customer: z
      .object({
        name: fields.name.optional(),
        company: fields.company.optional(),
        address: z
          .object({
            street: z.string().trim().max(200).optional(),
            city: z.string().trim().max(100).optional(),
            state: z.string().trim().max(100).optional(),
            country: z.string().trim().max(100).optional(),
            postalCode: z.string().trim().max(20).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    deal: z
      .object({
        name: z.string().trim().min(2).max(150).optional(),
        value: z.number({ required_error: 'Deal value is required', invalid_type_error: 'Deal value must be a number' }).gt(0, 'Deal value must be greater than zero').max(1e12),
        probability: z.number().min(0, 'Probability must be between 0 and 100').max(100, 'Probability must be between 0 and 100').optional(),
        expectedClosingDate: isoDate,
        description: z.string().trim().max(2000).optional(),
      })
      .strict(),
  })
  .strict();

exports.query = listQuery
  .extend({
    status: csvEnum(LEAD_STATUSES).optional(),
    priority: csvEnum(PRIORITIES).optional(),
    source: csvEnum(LEAD_SOURCES).optional(),
    assignedTo: z.union([objectId, z.literal('unassigned')]).optional(),
    createdFrom: isoDate.optional(),
    createdTo: dateTo.optional(),
  })
  .superRefine(rangeCheck([['createdFrom', 'createdTo']]));
