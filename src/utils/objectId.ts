import { Types } from "mongoose";

export function asObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ObjectId: ${value}`);
  }

  return new Types.ObjectId(value);
}
