import { Schema, model } from "mongoose";

const participationSchema = new Schema(
  {
    eventGameId: { type: Schema.Types.ObjectId, ref: "EventGame", required: true, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: "Player", required: true, index: true }
  },
  { timestamps: true }
);

participationSchema.index({ eventGameId: 1, playerId: 1 }, { unique: true });

export const ParticipationModel = model("Participation", participationSchema);
