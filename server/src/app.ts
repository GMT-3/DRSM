import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import geoRoutes from './routes/geoRoutes';
import auditLogRoutes from './routes/auditLogRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import organizationRoutes from './routes/organizationRoutes';
import userRoutes from './routes/userRoutes';
import householdRoutes from './routes/householdRoutes';
import demographicRoutes from './routes/demographicRoutes';
import requirementRoutes from './routes/requirementRoutes';
import storageLocationRoutes from './routes/storageLocationRoutes';
import resourceRoutes from './routes/resourceRoutes';
import categoryRoutes from './routes/categoryRoutes';
import resourceContributionRoutes from './routes/resourceContributionRoutes';
import cashDonationRoutes from './routes/cashDonationRoutes';
import inventoryMovementRoutes from './routes/inventoryMovementRoutes';
import allocationRoutes from './routes/allocationRoutes';
import supplyAssistanceRoutes from './routes/supplyAssistanceRoutes';
import vehicleRoutes from './routes/vehicleRoutes';
import routeRoutes from './routes/routeRoutes';
import transportRoutes from './routes/transportRoutes';
import distributionRoutes from './routes/distributionRoutes';
import situationRoutes from './routes/situationRoutes';
import fieldReportRoutes from './routes/fieldReportRoutes';
import priorityCaseRoutes from './routes/priorityCaseRoutes';
import noticeRoutes from './routes/noticeRoutes';
import reportsRoutes from './routes/reportsRoutes';
import adminRoutes from './routes/adminRoutes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json());
  if (!env.isTest) {
    app.use(morgan('dev'));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'drms-server', env: env.nodeEnv });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/geo', geoRoutes);
  app.use('/api/audit-logs', auditLogRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/organizations', organizationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/households', householdRoutes);
  app.use('/api/demographic', demographicRoutes);
  app.use('/api/requirements', requirementRoutes);
  app.use('/api/storage-locations', storageLocationRoutes);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/resource-contributions', resourceContributionRoutes);
  app.use('/api/donations', cashDonationRoutes);
  app.use('/api/inventory-movements', inventoryMovementRoutes);
  app.use('/api/allocations', allocationRoutes);
  app.use('/api/supply-assistance', supplyAssistanceRoutes);
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/routes', routeRoutes);
  app.use('/api/transport', transportRoutes);
  app.use('/api/distributions', distributionRoutes);
  app.use('/api/situation', situationRoutes);
  app.use('/api/field-reports', fieldReportRoutes);
  app.use('/api/priority-cases', priorityCaseRoutes);
  app.use('/api/notices', noticeRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
