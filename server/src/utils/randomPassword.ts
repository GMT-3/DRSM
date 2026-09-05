import crypto from 'crypto';

// Generates a temporary credential for accounts the system creates on
// someone else's behalf (field-personnel appointment by Ward/Municipality,
// gov-account creation by Central — Tech.md: "no self-registration" for
// those roles). Returned once in the API response so the appointing office
// can hand it to the appointee out-of-band; never stored or logged in
// plaintext anywhere.
const WORDS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTempPassword(length = 12): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += WORDS_ALPHABET[bytes[i] % WORDS_ALPHABET.length];
  }
  return out;
}
