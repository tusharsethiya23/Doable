// Server entry point: connect to MongoDB, start the HTTP server and the background scheduler.
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { startScheduler, stopScheduler } from './services/schedulerService.js';

async function start() {
  try {
    await connectDB();
    const server = app.listen(env.PORT, () => console.log(`🚀 API running on http://localhost:${env.PORT}`));
    startScheduler(); // runs due reminders and scheduled tasks

    // Graceful shutdown (e.g. when the host restarts the app): stop taking work, then exit
    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down…`);
      stopScheduler();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10000).unref(); // don't wait forever for open streams
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

// Log crashes from forgotten promise rejections instead of failing silently
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

start();
