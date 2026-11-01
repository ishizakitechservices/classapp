import React from 'react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';
import { Home, BookOpen, FolderArchive, Sparkles, Bell, Settings, GraduationCap } from 'lucide-react';

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'classes', label: 'Classes', icon: BookOpen },
  { id: 'vault', label: 'Vault', icon: FolderArchive },
  { id: 'adom-ai', label: 'Adom AI', icon: Sparkles },
  { id: 'notices', label: 'Notices', icon: Bell },
];

export const SidebarNav: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    unreadNoticesCount,
    setActiveSubjectId,
    setIsProfileOpen,
    userProfile,
  } = useApp();

  const handleTabClick = (tabId: TabType) => {
    if (tabId === 'classes' && currentTab === 'classes') {
      setActiveSubjectId(null);
    }
    setCurrentTab(tabId);
  };

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-64 border-r border-white/60 dark:border-white/10 glass-nav p-4 shrink-0 transition-colors">
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-2 py-3 mb-6 border-b border-neutral-500/10 dark:border-white/10">
        <div className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center font-bold text-sm">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-base tracking-tight text-neutral-900 dark:text-white block leading-tight">
            ClassApp
          </span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block">
            Academic Suite
          </span>
        </div>
      </div>

      {/* Nav destinations */}
      <nav className="flex-1 space-y-1" aria-label="Main Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                isActive
                  ? 'bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-900 dark:text-white font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-500/10 font-normal'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'stroke-[2.2] text-neutral-900 dark:text-white' : 'stroke-[1.6]'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.id === 'notices' && unreadNoticesCount > 0 && (
                <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900">
                  {unreadNoticesCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User profile / settings quick trigger at bottom of sidebar */}
      <div className="pt-4 border-t border-neutral-500/10 dark:border-white/10">
        <button
          onClick={() => setIsProfileOpen(true)}
          className="w-full min-h-[44px] flex items-center justify-between p-2 rounded-lg hover:bg-neutral-500/10 text-left transition-colors"
        >
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-8 h-8 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-semibold shrink-0">
              {userProfile.avatarInitials}
            </div>
            <div className="truncate">
              <span className="block text-xs font-semibold text-neutral-900 dark:text-white truncate">
                {userProfile.name}
              </span>
              <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                {userProfile.role === 'admin'
                  ? 'Admin'
                  : userProfile.role === 'prefect'
                  ? 'Class Prefect'
                  : 'Student'}
              </span>
            </div>
          </div>
          <Settings className="w-4 h-4 text-neutral-400 shrink-0" />
        </button>
      </div>
    </aside>
  );
};
