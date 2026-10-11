const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const config = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

// Swagger UI needs inline scripts, so it gets its own relaxed CSP; everything else gets helmet defaults.
if (config.enableDocs) {
  const spec = require('./docs/openapi');
  app.use('/api-docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'CRM Sales API' }));
  app.get('/api-docs.json', (req, res) => res.json(spec));
}

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

if (!config.isProd) app.use(morgan('dev'));
else app.use(morgan(':method :url :status :res[content-length] - :response-time ms')); // no bodies, no query secrets

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $-operators / dotted keys (NoSQL injection)

app.use(
  '/api',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many requests, please try again later' } })
);

app.get('/health', (req, res) => res.json({ success: true, message: 'OK', data: { uptime: process.uptime() } }));
app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
