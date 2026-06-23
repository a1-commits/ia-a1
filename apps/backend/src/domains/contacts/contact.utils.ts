export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw.trim();
  if (digits.length >= 12 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return raw.trim();
}
