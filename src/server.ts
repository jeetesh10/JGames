import { app } from "./app.js";
import { hashPassword } from "./auth.js";
import { config } from "./config.js";
import { connectToDatabase } from "./db.js";
import { UserModel } from "./models/User.js";

const DB_RETRY_DELAY_MS = 5000;

async function ensureSuperAdminUser(): Promise<void> {
  const existing = await UserModel.findOne({ email: config.superAdminEmail }).lean();
  if (existing) {
    return;
  }

  const passwordHash = await hashPassword(config.superAdminInitialPassword);
  await UserModel.create({
    email: config.superAdminEmail,
    passwordHash,
    role: "SUPER_ADMIN"
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded super admin account: ${config.superAdminEmail}`);
}

async function connectDatabaseWithRetry(): Promise<void> {
  try {
    await connectToDatabase(config.mongoUri);
    await ensureSuperAdminUser();
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
