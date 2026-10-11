const { z } = require('zod');
const { email, phone, password } = require('./common');

const name = z.string().trim().min(2).max(100);

exports.register = z.object({ name, email, phone: phone.optional(), password }).strict();
exports.login = z.object({ email, password: z.string().min(1, 'Password is required').max(72) }).strict();
exports.refresh = z.object({ refreshToken: z.string().min(10).optional() }).strict();
exports.updateProfile = z
  .object({ name: name.optional(), phone: phone.optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });
exports.changePassword = z
  .object({ currentPassword: z.string().min(1).max(72), newPassword: password })
  .strict()
  .refine((o) => o.currentPassword !== o.newPassword, { message: 'New password must differ from the current password', path: ['newPassword'] });
