// Server entry point: connect to MongoDB, then start listening for HTTP requests.
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

async function start() {
  try {
    await connectDB();
    app.listen(env.PORT, () => console.log(`🚀 API running on http://localhost:${env.PORT}`));
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

// Log crashes from forgotten promise rejections instead of failing silently
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

start();
