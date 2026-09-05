import { Role } from './roles';

export interface AuthTokenPayload {
  userId: string;
  role: Role;
  scope: {
    provinceId?: string | null;
    districtId?: string | null;
    municipalityId?: string | null;
    wardId?: string | null;
    organizationId?: string | null;
  };
  tokenVersion?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export {};
