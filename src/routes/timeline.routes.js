const router = require('express').Router();
const c = require('../controllers/timeline.controller');
const v = require('../validators/misc.validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/:entityType/:entityId', validate({ params: v.timelineParams, query: v.timelineQuery }), c.get);

module.exports = router;
