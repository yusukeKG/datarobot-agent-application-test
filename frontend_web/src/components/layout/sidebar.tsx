import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  AlertTriangle,
  History,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  badge?: number;
}

function SidebarItem({ icon, label, href, badge }: SidebarItemProps) {
  const location = useLocation();
  const isActive = location.pathname === href;

  return (
    <Link
      to={href}
      className={cn(
        'flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors',
        isActive
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-700 hover:bg-gray-100'
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-800">PMSystem</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        <SidebarItem
          icon={<LayoutDashboard className="h-5 w-5" />}
          label="ダッシュボード"
          href="/"
        />
        <SidebarItem
          icon={<Activity className="h-5 w-5" />}
          label="センサー監視"
          href="/sensors"
        />
        <SidebarItem
          icon={<AlertTriangle className="h-5 w-5" />}
          label="アラート"
          href="/alerts"
          badge={3}
        />
        <SidebarItem
          icon={<History className="h-5 w-5" />}
          label="保全履歴"
          href="/maintenance"
        />
        <SidebarItem
          icon={<Settings className="h-5 w-5" />}
          label="設定"
          href="/settings"
        />
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="rounded-lg bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-900">
            DataRobot Agent
          </p>
          <p className="mt-1 text-xs text-blue-700">AI分析エンジン稼働中</p>
        </div>
      </div>
    </aside>
  );
}
