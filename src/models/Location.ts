import { Schema, model } from "mongoose";

const locationSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    venue: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

locationSchema.index({ eventId: 1, name: 1 }, { unique: true });

export const LocationModel = model("Location", locationSchema);
