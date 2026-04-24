import { Schema, model } from "mongoose";

const eventGameSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    gameId: { type: Schema.Types.ObjectId, ref: "Game", required: true, index: true },
    title: { type: String, trim: true },
    joinToken: { type: String, required: true, unique: true, index: true },
    adminToken: { type: String, unique: true, sparse: true, index: true },
    settings: {
      allowNegativeScores: { type: Boolean, default: false },
      maxEntriesPerPlayer: { type: Number }
    }
  },
  { timestamps: true }
);

eventGameSchema.index({ eventId: 1, locationId: 1, gameId: 1 }, { unique: true });

export const EventGameModel = model("EventGame", eventGameSchema);
