// Builds the Express app: security middleware, body/cookie parsing, API routes, error handling — and in production
// it also serves the built React app (client/dist), so the whole product runs as ONE service on ONE domain
// (first-party cookies, no CORS, streaming not cut by a proxy).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env, isProd } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

app.set('trust proxy', 1); // correct client IPs behind Render/Railway proxies (needed for rate limiting)
app.use(helmet()); // secure HTTP headers (incl. a strict Content-Security-Policy for the served React app)
app.use(cors({ origin: env.CLIENT_URL.split(','), credentials: true })); // only matters if the client is on another domain
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(isProd ? 'tiny' : 'dev')); // request log (method, path, status, time — never bodies or headers)

app.use('/api', routes);

// Production: serve the React build + send index.html for client-side routes like /chat/123
if (isProd && fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        // Vite puts content-hashed files in /assets → safe to cache for a year
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache').sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
