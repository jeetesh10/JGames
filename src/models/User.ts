import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["ADMIN", "PLAYER", "SUPER_ADMIN"], required: true, default: "PLAYER", index: true },
    playerId: { type: Schema.Types.ObjectId, ref: "Player", index: true, sparse: true }
  },
  { timestamps: true }
);

export const UserModel = model("User", userSchema);
