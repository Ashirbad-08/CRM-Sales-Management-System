const router = require('express').Router();
const c = require('../controllers/activity.controller');
const v = require('../validators/activity.validator');
const { idParams } = require('../validators/common');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.route('/').post(validate({ body: v.create }), c.create).get(validate({ query: v.query }), c.list);
router.route('/:id').get(validate({ params: idParams }), c.getById).patch(validate({ params: idParams, body: v.update }), c.update).delete(validate({ params: idParams }), c.remove);
router.patch('/:id/complete', validate({ params: idParams, body: v.complete }), c.complete);

module.exports = router;
