const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/auth.controller');
const v = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

const limiter = (max, extra = {}) =>
  rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many attempts, please try again later' }, ...extra });

router.post('/register', limiter(20), validate({ body: v.register }), c.register);
router.post('/login', limiter(10, { skipSuccessfulRequests: true }), validate({ body: v.login }), c.login);
router.post('/refresh', limiter(60), validate({ body: v.refresh }), c.refresh);
router.post('/logout', validate({ body: v.refresh }), c.logout);

router.use(authenticate);
router.post('/logout-all', c.logoutAll);
router.get('/me', c.me);
router.patch('/me', validate({ body: v.updateProfile }), c.updateMe);
router.patch('/change-password', limiter(10), validate({ body: v.changePassword }), c.changePassword);

module.exports = router;
