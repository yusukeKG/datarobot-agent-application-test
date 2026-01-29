import { PATHS } from '@/constants/path.ts';
import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { SettingsSources } from './pages/SettingSources.tsx';
import { SettingsLayout } from './pages/SettingsLayout';
import { ChatPage } from './pages/Chat.tsx';
import { DashboardPage } from './pages/dashboard-page';
import { SensorsPage } from './pages/sensors-page';
import { AlertsPage } from './pages/alerts-page';
import { MaintenancePage } from './pages/maintenance-page';
import { MainLayout } from './components/layout/main-layout';
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));

export const appRoutes = [
  { path: PATHS.OAUTH_CB, element: <OAuthCallback /> },
  {
    path: '/',
    element: <MainLayout><Navigate to={PATHS.DASHBOARD} replace /></MainLayout>,
  },
  { 
    path: PATHS.DASHBOARD, 
    element: <MainLayout><DashboardPage /></MainLayout>,
  },
  { 
    path: PATHS.SENSORS, 
    element: <MainLayout><SensorsPage /></MainLayout>,
  },
  { 
    path: PATHS.ALERTS, 
    element: <MainLayout><AlertsPage /></MainLayout>,
  },
  { 
    path: PATHS.MAINTENANCE, 
    element: <MainLayout><MaintenancePage /></MainLayout>,
  },
  { path: PATHS.CHAT_PAGE, element: <ChatPage /> },
  {
    path: PATHS.SETTINGS.ROOT,
    element: <SettingsLayout />,
    children: [
      { index: true, element: <Navigate to="sources" replace /> },
      { path: 'sources', element: <SettingsSources /> },
    ],
  },
  { path: '*', element: <Navigate to={PATHS.DASHBOARD} replace /> },
];
