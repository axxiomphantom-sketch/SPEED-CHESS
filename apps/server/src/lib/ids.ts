import crypto from 'node:crypto';
export const id = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
export const shortCode = (len = 6) => crypto.randomBytes(len).toString('base64url').slice(0, len).toUpperCase();
export const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const slugify = (value: string) =>
  value.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
