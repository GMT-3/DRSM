import { Request, Response } from 'express';
import { Route } from '../models/Route';
import { ApiError } from '../utils/ApiError';

const GOV_ROLES = ['central', 'district_cdo', 'municipality_ward'];
const CONDITION_REPORTER_ROLES = [...GOV_ROLES, 'volunteer', 'police', 'army'];

export async function createRoute(req: Request, res: Response) {
  const auth = req.auth!;
  if (!GOV_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to register a route');

  const { name, fromLocation, toLocation } = req.body as { name: string; fromLocation: string; toLocation: string };
  if (!name || !fromLocation || !toLocation) throw ApiError.badRequest('name, fromLocation, and toLocation are required');

  const route = await Route.create({ name, fromLocation, toLocation, currentCondition: 'open' });

  res.locals.auditTarget = { targetId: route._id, afterState: route.toObject() };
  res.status(201).json({ route });
}

// Routes are shared operational information (Modules.md "Routes: the
// transport network available for delivery") — every logged-in role can
// view them, including organizations aligning their own transport plans.
export async function listRoutes(req: Request, res: Response) {
  const { condition } = req.query as { condition?: string };
  const query: Record<string, unknown> = {};
  if (condition) query.currentCondition = condition;
  const routes = await Route.find(query).sort({ name: 1 });
  res.json({ routes });
}

/**
 * Field roles can report route conditions from the field (Roles.md:
 * "confirms deliveries and reports site/route conditions from the
 * field"), not just government roles managing the network.
 */
export async function updateRouteCondition(req: Request, res: Response) {
  const auth = req.auth!;
  if (!CONDITION_REPORTER_ROLES.includes(auth.role)) throw ApiError.forbidden('Not permitted to report route conditions');

  const route = await Route.findById(req.params.id);
  if (!route) throw ApiError.notFound('Route not found');

  const { currentCondition, conditionNote } = req.body as { currentCondition: string; conditionNote?: string };
  if (!['open', 'degraded', 'blocked'].includes(currentCondition)) throw ApiError.badRequest('Invalid condition');

  route.currentCondition = currentCondition as never;
  route.conditionNote = conditionNote;
  route.conditionUpdatedAt = new Date();
  route.conditionUpdatedByUserId = auth.userId as never;
  await route.save();

  res.locals.auditTarget = { targetId: route._id, afterState: route.toObject() };
  res.json({ route });
}
