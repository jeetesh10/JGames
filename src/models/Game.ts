import { Schema, model } from "mongoose";

const gameSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, lowercase: true, unique: true },
    scoringMode: {
      type: String,
      enum: ["INDIVIDUAL", "CUMULATIVE"],
      default: "INDIVIDUAL"
    },
    scoreUnit: { type: String, default: "points", trim: true },
    rules: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const GameModel = model("Game", gameSchema);
