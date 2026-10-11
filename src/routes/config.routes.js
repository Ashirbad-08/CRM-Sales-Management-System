const router = require('express').Router();
const c = require('../controllers/config.controller');
const v = require('../validators/misc.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.ADMIN));
router.get('/', validate({ query: v.configQuery }), c.list);
router.route('/:key').get(validate({ params: v.configKeyParams }), c.get).put(validate({ params: v.configKeyParams, body: v.configUpsert }), c.upsert).delete(validate({ params: v.configKeyParams }), c.remove);

module.exports = router;
