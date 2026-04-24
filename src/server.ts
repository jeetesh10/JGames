import { app } from "./app.js";
import { config } from "./config.js";
import { connectToDatabase } from "./db.js";

async function start(): Promise<void> {
  await connectToDatabase(config.mongoUri);

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`JGames API running on port ${config.port}`);
  });
}

start().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start API", error);
  process.exit(1);
});
