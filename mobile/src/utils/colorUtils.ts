export const SYSTEM_COLORS = {
  SELF: '#4F46E5', // Indigo
  SOS: '#EF4444', // Red
  OFFLINE: '#9CA3AF', // Grey
  OTHERS: [
    '#10B981', // Green
    '#8B5CF6', // Purple
    '#F59E0B', // Orange
    '#14B8A6', // Teal
    '#EAB308', // Yellow
    '#3B82F6', // Blue
  ]
};

/**
 * Deterministically assigns a color based on a userId UUID string.
 */
export const getUserColor = (userId: string, isSelf: boolean = false, isSOS: boolean = false, isOffline: boolean = false): string => {
  if (isSOS) return SYSTEM_COLORS.SOS;
  if (isOffline) return SYSTEM_COLORS.OFFLINE;
  if (isSelf) return SYSTEM_COLORS.SELF;

  if (!userId) return SYSTEM_COLORS.OTHERS[0];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % SYSTEM_COLORS.OTHERS.length;
  return SYSTEM_COLORS.OTHERS[index];
};
