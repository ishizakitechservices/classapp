import React from 'react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';
import { Home, BookOpen, FolderArchive, Sparkles, Bell } from 'lucide-react';

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

export const BottomNav: React.FC = () => {
  const { currentTab, setCurrentTab, unreadNoticesCount, setActiveSubjectId } = useApp();

  const handleTabClick = (tabId: TabType) => {
    if (tabId === 'classes' && currentTab === 'classes') {
      // Tapping classes when already in classes resets to subject list
      setActiveSubjectId(null);
    }
    setCurrentTab(tabId);
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-nav border-t border-white/50 dark:border-white/10 pb-safe transition-colors"
      aria-label="Bottom Navigation"
    >
      <div className="grid grid-cols-5 h-15">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center relative transition-colors ${
                isActive
                  ? 'text-neutral-900 dark:text-white font-semibold'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 font-normal'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-105 stroke-[2.2]' : 'stroke-[1.6]'
                  }`}
                />
                {item.id === 'notices' && unreadNoticesCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-neutral-900 dark:bg-white ring-2 ring-white dark:ring-neutral-900" />
                )}
              </div>
              <span className="text-[11px] tracking-tight mt-1 leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
