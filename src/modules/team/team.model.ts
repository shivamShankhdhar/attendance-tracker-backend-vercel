import { Schema, model, Document, Types } from 'mongoose';

export interface ITeam extends Document {
  _id: Types.ObjectId;
  workplaceId: Types.ObjectId;
  name: string;
  description?: string;
  color?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>(
  {
    workplaceId: { type: Schema.Types.ObjectId, ref: 'Workplace', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 300 },
    color: { type: String, default: '#5B692D' },
    isDefault: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Unique team name within the same workplace
teamSchema.index({ workplaceId: 1, name: 1 }, { unique: true });

export const TeamModel = model<ITeam>('Team', teamSchema);
