export function validate(base64: string): boolean {
  return /^[A-Za-z0-9\-_]+$/.test(base64);
}
