import request from 'supertest';
import { createApp } from '../../src/app';

describe('GET /api/health', () => {
  it('responds ok without needing a database connection', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
