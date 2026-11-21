'use client';

import React, { useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useMailDesk } from '@/context/MailDeskContext';
import { toast } from 'sonner';

function OAuthHandler() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { connectRealAccount } = useMailDesk();
  const processedRef = useRef<string | null>(null);

  useEffect(() => {
    const status = searchParams.get('status');
    const email = searchParams.get('email');
    const name = searchParams.get('name');
    const userId = searchParams.get('user_id');
    const error = searchParams.get('error');

    if (status === 'connected' && email) {
      const key = `connected:${email}:${userId || ''}`;
      if (processedRef.current !== key) {
        processedRef.current = key;
        connectRealAccount(email, name || undefined, userId || undefined);
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', pathname);
        }
      }
    } else if (error) {
      if (processedRef.current !== error) {
        processedRef.current = error;
        toast.error(`Google OAuth error: ${error}`);
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', pathname);
        }
      }
    }
  }, [searchParams, pathname, connectRealAccount]);

  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';

  return (
    <>
      <Suspense fallback={null}>
        <OAuthHandler />
      </Suspense>
      {isLandingPage ? (
        children
      ) : (
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      )}
    </>
  );
}
