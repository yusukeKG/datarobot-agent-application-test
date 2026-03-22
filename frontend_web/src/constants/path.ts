export const PATHS = {
  DASHBOARD: '/',
  SENSORS: '/sensors',
  ANALYSIS_HISTORY: '/analysis-history',
  ANALYSIS_DETAIL: '/analysis-history/:uuid',
  ALERTS: '/alerts',
  MAINTENANCE: '/maintenance',
  CHAT_PAGE: '/chat',
  OAUTH_CB: '/oauth/callback',
  SETTINGS: {
    ROOT: '/settings',
    GENERAL: '/settings/general',
    SOURCES: '/settings/sources',
  },
} as const;
