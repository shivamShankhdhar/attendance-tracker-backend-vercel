import { Schema, model, Document, Types } from 'mongoose';

export type AuditAction =
  | 'ATTENDANCE_APPROVED'
  | 'ATTENDANCE_REJECTED'
  | 'ATTENDANCE_MODIFIED'
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_DISABLED'
  | 'EMPLOYEE_ACTIVATED'
  | 'ATTENDANCE_SESSION_OPENED'
  | 'ATTENDANCE_SESSION_CLOSED'
  | 'INVITATION_CREATED'
  | 'INVITATION_CLAIMED'
  | 'JOIN_REQUEST_SUBMITTED'
  | 'JOIN_REQUEST_APPROVED'
  | 'JOIN_REQUEST_REJECTED';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  workplaceId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: AuditAction;
  entityId: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    workplaceId: { type: Schema.Types.ObjectId, ref: 'Workplace', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: {
      type: String,
      enum: [
        'ATTENDANCE_APPROVED',
        'ATTENDANCE_REJECTED',
        'ATTENDANCE_MODIFIED',
        'EMPLOYEE_CREATED',
        'EMPLOYEE_DISABLED',
        'EMPLOYEE_ACTIVATED',
        'ATTENDANCE_SESSION_OPENED',
        'ATTENDANCE_SESSION_CLOSED',
        'INVITATION_CREATED',
        'INVITATION_CLAIMED',
        'JOIN_REQUEST_SUBMITTED',
        'JOIN_REQUEST_APPROVED',
        'JOIN_REQUEST_REJECTED',
      ],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ workplaceId: 1, createdAt: -1 });

export const AuditLogModel = model<IAuditLog>('AuditLog', auditLogSchema);
