import { generateQrDataUrl } from '../../src/utils/qr';

describe('generateQrDataUrl', () => {
  it('renders a PNG data URL for a given payload', async () => {
    const dataUrl = await generateQrDataUrl('household-uuid-123');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(100);
  });

  it('renders different content for different payloads', async () => {
    const a = await generateQrDataUrl('uuid-a');
    const b = await generateQrDataUrl('uuid-b');
    expect(a).not.toEqual(b);
  });
});
