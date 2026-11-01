/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/screens/AuthScreen';
import { ResetPasswordScreen } from './components/screens/ResetPasswordScreen';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SidebarNav } from './components/SidebarNav';
import { HomeScreen } from './components/screens/HomeScreen';
import { ClassesScreen } from './components/screens/ClassesScreen';
import { VaultScreen } from './components/screens/VaultScreen';
import { AdomAIScreen } from './components/screens/AdomAIScreen';
import { NoticesScreen } from './components/screens/NoticesScreen';
import { ProfileModal } from './components/screens/ProfileModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AuthThemeToggle } from './components/AuthThemeToggle';
import { AmbientBackground } from './components/AmbientBackground';
import { Footer } from './components/Footer';

const AppContent: React.FC = () => {
  const { currentTab } = useApp();
  const { user, isLoading } = useAuth();
  const [showReset, setShowReset] = useState(false);

  const renderScreen = () => {
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-sm text-neutral-500">Loading…</p>
        </div>
      );
    }

    if (showReset) {
      return (
        <>
          <AuthThemeToggle />
          <ResetPasswordScreen onDone={() => setShowReset(false)} />
        </>
      );
    }

    // No account: only the shared sign-in / sign-up screen is reachable.
    if (!user) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-4">
          <AuthThemeToggle />
          <AuthScreen />
          <button
            type="button"
            onClick={() => setShowReset(true)}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            I have a reset code
          </button>
          <Footer className="mt-2" />
        </div>
      );
    }

    // Signed in. The account panel is the role-aware home until the class features land.
    return (
      <div className="min-h-screen text-neutral-900 dark:text-neutral-100 flex flex-col antialiased transition-colors">
        <Header />

        <div className="flex-1 flex max-w-7xl w-full mx-auto">
          <SidebarNav />

          <main className="flex-1 min-w-0 px-4 py-5 md:px-8 md:py-6 max-w-5xl mx-auto w-full">
            {currentTab === 'home' && <HomeScreen />}
            {currentTab === 'classes' && <ClassesScreen />}
            {currentTab === 'vault' && <VaultScreen />}
            {currentTab === 'adom-ai' && <AdomAIScreen />}
            {currentTab === 'notices' && <NoticesScreen />}
          </main>
        </div>

        <div className="pb-20 md:pb-4 pt-2 px-4">
          <Footer />
        </div>

        <BottomNav />

        <ProfileModal />
        <OfflineIndicator />
      </div>
    );
  };

  return (
    <div className="relative isolate min-h-screen">
      <AmbientBackground />
      {renderScreen()}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
}
