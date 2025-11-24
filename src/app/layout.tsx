import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FirebaseClientProvider } from '@/firebase';
import {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"

export const metadata: Metadata = {
  title: 'StockTracker',
  description: 'A personal dashboard for tracking stocks.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="zinc"
            themes={['theme-zinc', 'theme-slate', 'theme-rose', 'theme-indigo']}
          >
             <SidebarProvider>
                <Sidebar>
                    <AppSidebar />
                </Sidebar>
                <SidebarInset>
                    <header className="p-4 md:p-8 md:pb-0">
                      <SidebarTrigger />
                    </header>
                    {children}
                </SidebarInset>
             </SidebarProvider>
              <Toaster />
          </ThemeProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
