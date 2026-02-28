/**
 * Admin authentication utility.
 *
 * Checks if a user is an admin by comparing their Supabase user ID
 * against the ADMIN_USER_IDS environment variable (comma-separated UUIDs).
 */

const getAdminIds = (): string[] => {
  const raw = process.env.ADMIN_USER_IDS || "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
};

/** Check if a given user ID is in the admin list */
export function isAdmin(userId: string): boolean {
  const adminIds = getAdminIds();
  return adminIds.includes(userId);
}

/** Check if admin IDs have been configured */
export function isAdminConfigured(): boolean {
  return getAdminIds().length > 0;
}
