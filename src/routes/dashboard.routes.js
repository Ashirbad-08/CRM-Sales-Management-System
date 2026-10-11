const router = require('express').Router();
const c = require('../controllers/dashboard.controller');
const v = require('../validators/misc.validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

router.use(authenticate);
router.get('/stats', validate({ query: v.dashboardQuery }), c.stats);
router.get('/pipeline', validate({ query: v.dashboardQuery }), c.pipeline);
router.get('/team-performance', authorize(ROLES.ADMIN, ROLES.MANAGER), validate({ query: v.teamQuery }), c.teamPerformance);
router.get('/reports/sales', authorize(ROLES.ADMIN), validate({ query: v.reportQuery }), c.salesReport);

module.exports = router;
