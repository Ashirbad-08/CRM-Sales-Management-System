const { z } = require('zod');
const { CUSTOMER_STATUSES } = require('../utils/constants');
const { objectId, email, phone, isoDate, dateTo, csvEnum, listQuery, rangeCheck, nonEmpty, nonEmptyMsg } = require('./common');

const address = z
  .object({
    street: z.string().trim().max(200).optional(),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    country: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(20).optional(),
  })
  .strict();

const name = z.string().trim().min(2).max(100);
const company = z.string().trim().max(150);

exports.create = z
  .object({
    name,
    email: email.optional(),
    phone: phone.optional(),
    company: company.optional(),
    address: address.optional(),
    assignedTo: objectId.optional(),
    status: z.enum(CUSTOMER_STATUSES).optional(),
  })
  .strict()
  .refine((d) => d.email || d.phone, { message: 'Either email or phone is required', path: ['email'] });

exports.update = z
  .object({
    name: name.optional(),
    email: email.optional(),
    phone: phone.optional(),
    company: company.optional(),
    address: address.optional(),
    status: z.enum(CUSTOMER_STATUSES).optional(),
  })
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

exports.assign = z.object({ assignedTo: objectId }).strict();

exports.query = listQuery
  .extend({
    status: csvEnum(CUSTOMER_STATUSES).optional(),
    assignedTo: z.union([objectId, z.literal('unassigned')]).optional(),
    createdFrom: isoDate.optional(),
    createdTo: dateTo.optional(),
  })
  .superRefine(rangeCheck([['createdFrom', 'createdTo']]));
