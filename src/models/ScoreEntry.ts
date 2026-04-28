import { Schema, model } from "mongoose";

const scoreEntrySchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    eventGameId: { type: Schema.Types.ObjectId, ref: "EventGame", required: true, index: true },
    gameId: { type: Schema.Types.ObjectId, ref: "Game", required: true, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: "Player", required: true, index: true },
    points: { type: Number, required: true },
    roundNumber: { type: Number },
    source: {
      type: String,
      enum: ["MANUAL", "AUTO", "SELF"],
      default: "MANUAL"
    }
  },
  { timestamps: true }
);

scoreEntrySchema.index({ eventGameId: 1, playerId: 1, createdAt: -1 });
scoreEntrySchema.index({ eventGameId: 1, playerId: 1, roundNumber: 1 });
scoreEntrySchema.index({ locationId: 1, playerId: 1, createdAt: -1 });
scoreEntrySchema.index({ eventId: 1, playerId: 1, createdAt: -1 });

export const ScoreEntryModel = model("ScoreEntry", scoreEntrySchema);
