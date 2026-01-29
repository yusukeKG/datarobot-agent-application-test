import { Bell, Settings, User } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Header() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [alertCount] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-gray-800">
          予知保全監視システム
        </h1>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span className="text-sm font-medium text-gray-600">正常稼働中</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-sm text-gray-600">
          最終更新: {currentTime.toLocaleTimeString('ja-JP')}
        </div>

        <button className="relative rounded-lg p-2 hover:bg-gray-100">
          <Bell className="h-5 w-5 text-gray-600" />
          {alertCount > 0 && (
            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {alertCount}
            </span>
          )}
        </button>

        <button className="rounded-lg p-2 hover:bg-gray-100">
          <Settings className="h-5 w-5 text-gray-600" />
        </button>

        <button className="rounded-lg p-2 hover:bg-gray-100">
          <User className="h-5 w-5 text-gray-600" />
        </button>
      </div>
    </header>
  );
}
