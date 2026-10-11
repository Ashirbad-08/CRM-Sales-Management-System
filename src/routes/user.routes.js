const router = require('express').Router();
const c = require('../controllers/user.controller');
const v = require('../validators/user.validator');
const { idParams } = require('../validators/common');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

router.use(authenticate);
// Managers need the list of executives they can assign work to.
router.get('/assignable', authorize(ROLES.ADMIN, ROLES.MANAGER), c.assignable);

router.use(authorize(ROLES.ADMIN));
router.route('/').post(validate({ body: v.create }), c.create).get(validate({ query: v.query }), c.list);
router.route('/:id').get(validate({ params: idParams }), c.getById).patch(validate({ params: idParams, body: v.update }), c.update).delete(validate({ params: idParams }), c.remove);
router.patch('/:id/status', validate({ params: idParams, body: v.status }), c.setStatus);

module.exports = router;
