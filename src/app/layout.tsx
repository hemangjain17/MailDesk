import type { Metadata } from 'next';
import './globals.css';
import { MailDeskProvider } from '@/context/MailDeskContext';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'MailDesk — Personal Job Outreach & Email Scheduling',
  description: 'Fast, spreadsheet-style personal job cold-emailing dashboard with Gmail integration and durable scheduling.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-background text-foreground antialiased font-sans">
        <MailDeskProvider>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="bottom-right" />
        </MailDeskProvider>
      </body>
    </html>
  );
}
