import React from 'react';
import { useApp } from '../context/AppContext';
import { Sun, Moon, Monitor } from 'lucide-react';

/**
 * Theme switch available BEFORE sign-in (login, signup, reset screens), so a student
 * can fix the look on a borrowed device without an account yet.
 */
export const AuthThemeToggle: React.FC = () => {
  const { settings, setTheme } = useApp();

  const cycle = () => {
    if (settings.theme === 'system') setTheme('light');
    else if (settings.theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  return (
    <button
      onClick={cycle}
      className="fixed top-3 right-3 z-20 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg glass glass-hover text-neutral-600 dark:text-neutral-300"
      aria-label={`Change theme (currently ${settings.theme})`}
      title={`Theme: ${settings.theme}`}
    >
      {settings.theme === 'light' ? (
        <Sun className="w-4 h-4" />
      ) : settings.theme === 'dark' ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Monitor className="w-4 h-4" />
      )}
    </button>
  );
};
