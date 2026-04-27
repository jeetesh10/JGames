import { app } from "./app.js";
import { config } from "./config.js";
import { connectToDatabase } from "./db.js";

const DB_RETRY_DELAY_MS = 5000;

async function connectDatabaseWithRetry(): Promise<void> {
  try {
    await connectToDatabase(config.mongoUri);
    // eslint-disable-next-line no-console
    console.log("Connected to MongoDB");
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to MongoDB. Retrying...", error);

    setTimeout(() => {
      void connectDatabaseWithRetry();
    }, DB_RETRY_DELAY_MS);
  }
}

function start(): void {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`JGames API running on port ${config.port}`);
  });

  void connectDatabaseWithRetry();
}

start();
