/**
 * Shorten a full name to "First Last" — drop 3rd+ names (grandfather etc).
 * "Bethelehem Tenkir Gebresenbet" → "Bethelehem Tenkir"
 * "Petros Mulugeta Yigzaw" → "Petros Mulugeta"
 * "Seble" → "Seble" (single word unchanged)
 */
export function shortName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(0, 2).join(" ");
}
