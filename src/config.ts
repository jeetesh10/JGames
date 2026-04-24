import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? process.env.port ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? process.env.mongodb_uri ?? "mongodb://127.0.0.1:27017/jgames",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? process.env.public_base_url ?? "http://localhost:4000",
  jwtSecret: process.env.JWT_SECRET ?? process.env.jwt_secret ?? "change-this-in-production"
};
