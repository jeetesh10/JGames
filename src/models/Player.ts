import { Schema, model } from "mongoose";

const playerSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true, sparse: true },
    externalId: { type: String, trim: true, index: true, sparse: true },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const PlayerModel = model("Player", playerSchema);
