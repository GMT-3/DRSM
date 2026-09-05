import QRCode from 'qrcode';

/**
 * Renders a QR code as a PNG data URL for a given payload (Tech.md: "QR
 * codes: server-side generation ... at household registration, printable
 * from the field app"). The payload is the Household's clientUuid, so a
 * scan resolves the same household whether the card was printed offline
 * (client-rendered) or after sync (server-rendered) — see models/Household.ts.
 */
export async function generateQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { margin: 1, width: 256 });
}
