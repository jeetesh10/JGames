import process from "node:process";

import mongoose from "mongoose";

import { hashPassword } from "../auth.js";
import { config } from "../config.js";
import { connectToDatabase } from "../db.js";
import { UserModel } from "../models/User.js";

function readCliArgs(): { email: string; password: string } {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    throw new Error("Usage: npm run create:admin -- <email> <password>");
  }

  return {
    email: email.toLowerCase().trim(),
    password
  };
}

async function createAdmin(): Promise<void> {
  const { email, password } = readCliArgs();

  await connectToDatabase(config.mongoUri);

  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw new Error(`User already exists for ${email}`);
  }

  const passwordHash = await hashPassword(password);
  await UserModel.create({
    email,
    passwordHash,
    role: "ADMIN"
  });

  // eslint-disable-next-line no-console
  console.log(`Admin user created for ${email}`);
}

createAdmin()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("Failed to create admin", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });