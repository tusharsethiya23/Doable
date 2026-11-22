// Builds the Express app: security middleware, body/cookie parsing, API routes and error handling.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env, isProd } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.set('trust proxy', 1); // correct client IPs behind Render/Railway proxies (needed for rate limiting)
app.use(helmet()); // secure HTTP headers
app.use(cors({ origin: env.CLIENT_URL.split(','), credentials: true })); // allow our React app + cookies
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (!isProd) app.use(morgan('dev')); // log each request in development

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
