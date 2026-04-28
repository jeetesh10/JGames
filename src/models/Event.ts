import { Schema, model } from "mongoose";

const eventSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    eventDate: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    sponsor: { type: String, trim: true },
    status: {
      type: String,
      enum: ["DRAFT", "LIVE", "CLOSED"],
      default: "DRAFT"
    },
    scoringAuthority: {
      type: String,
      enum: ["ADMIN_ONLY", "PLAYER_SELF", "HYBRID"],
      default: "ADMIN_ONLY"
    },
    startsAt: { type: Date },
    endsAt: { type: Date },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const EventModel = model("Event", eventSchema);
