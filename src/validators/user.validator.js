const { z } = require('zod');
const { ROLES } = require('../utils/constants');
const { objectId, email, phone, password, listQuery, nonEmpty, nonEmptyMsg } = require('./common');

const name = z.string().trim().min(2).max(100);
const role = z.enum(Object.values(ROLES));

exports.create = z
  .object({ name, email, phone: phone.optional(), password, role, manager: objectId.optional(), isActive: z.boolean().optional() })
  .strict();

exports.update = z
  .object({ name: name.optional(), email: email.optional(), phone: phone.optional(), password: password.optional(), role: role.optional(), manager: objectId.nullable().optional() })
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

exports.status = z.object({ isActive: z.boolean({ required_error: 'isActive is required', invalid_type_error: 'isActive must be boolean' }) }).strict();

exports.query = listQuery.extend({
  role: role.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  manager: objectId.optional(),
});
