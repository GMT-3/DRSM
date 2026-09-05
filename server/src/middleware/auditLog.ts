import { Request, Response, NextFunction } from 'express';
import { AuditLog, AuditAction } from '../models/AuditLog';
import { Role } from '../types/roles';
import { Types } from 'mongoose';
import { emitEvent } from '../realtime/io';

interface WriteAuditLogArgs {
  actorUserId?: Types.ObjectId | string | null;
  actorRole: Role | 'system';
  action: AuditAction;
  targetType: string;
  targetId?: Types.ObjectId | string | null;
  beforeState?: unknown;
  afterState?: unknown;
  req?: Request;
}

// The single write path for AuditLog (Rule.md: "immutable AuditLog...
// write-only from the application layer"). Never expose an update/delete
// route for this collection — see routes/auditLogRoutes.ts, which is
// read-only by construction.
export async function writeAuditLog(args: WriteAuditLogArgs): Promise<void> {
  try {
    await AuditLog.create({
      actorUserId: args.actorUserId ?? null,
      actorRole: args.actorRole,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId ?? null,
      beforeState: args.beforeState ?? null,
      afterState: args.afterState ?? null,
      requestMeta: args.req
        ? { method: args.req.method, path: args.req.originalUrl, ip: args.req.ip }
        : undefined,
      timestamp: new Date(),
    });

    // Real-time layer (Phase 9, Tech.md): every audited mutation is also
    // broadcast live so connected dashboards can update without a manual
    // refresh, reusing the AuditLog write as the single point every
    // mutation already passes through rather than adding per-route
    // socket.emit calls scattered across every controller.
    emitEvent('audit-event', {
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId ?? null,
      actorRole: args.actorRole,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Audit logging must never take down the primary request; log and move on.
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write audit log entry', err);
  }
}

/**
 * Express middleware factory: wraps a mutating route handler so that a
 * successful response (2xx) automatically produces an AuditLog entry.
 * `describe` extracts the action/targetType/targetId/before-after state
 * from the request/response so each route only declares what it means,
 * not how logging happens.
 */
export function auditMutation(
  action: AuditAction,
  describe: (req: Request, res: Response) => {
    targetType: string;
    targetId?: Types.ObjectId | string | null;
    beforeState?: unknown;
    afterState?: unknown;
  },
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const meta = describe(req, res);
        void writeAuditLog({
          actorUserId: req.auth?.userId ?? null,
          actorRole: req.auth?.role ?? 'system',
          action,
          targetType: meta.targetType,
          targetId: meta.targetId,
          beforeState: meta.beforeState,
          afterState: meta.afterState,
          req,
        });
      }
      return originalJson(body);
    };
    next();
  };
}
