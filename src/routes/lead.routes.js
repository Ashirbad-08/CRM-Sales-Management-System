const router = require('express').Router();
const c = require('../controllers/lead.controller');
const activityC = require('../controllers/activity.controller');
const timelineC = require('../controllers/timeline.controller');
const v = require('../validators/lead.validator');
const av = require('../validators/activity.validator');
const mv = require('../validators/misc.validator');
const { idParams } = require('../validators/common');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

const { ADMIN, MANAGER } = ROLES;
router.use(authenticate);

router.route('/').post(validate({ body: v.create }), c.create).get(validate({ query: v.query }), c.list);
router.route('/:id').get(validate({ params: idParams }), c.getById).patch(validate({ params: idParams, body: v.update }), c.update).delete(authorize(ADMIN, MANAGER), validate({ params: idParams }), c.remove);
router.patch('/:id/status', validate({ params: idParams, body: v.status }), c.updateStatus);
router.patch('/:id/assign', authorize(ADMIN, MANAGER), validate({ params: idParams, body: v.assign }), c.assign);
router.post('/:id/convert', validate({ params: idParams, body: v.convert }), c.convert);
router.get('/:id/timeline', validate({ params: idParams, query: mv.timelineQuery }), timelineC.forEntity('Lead'));
router.get('/:id/activities', validate({ params: idParams, query: av.query }), activityC.forEntity('Lead'));

module.exports = router;
