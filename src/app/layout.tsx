import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import SessionProvider from '@/components/SessionProvider';
import LoginButton from '@/components/LoginButton';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'KSAE 공지봇',
  description: 'KSAE 대학생 자작자동차대회 공지사항 및 규정 알림 봇',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()` }} />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <SessionProvider>
          <header className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800 sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
              <a href="/" className="font-bold text-lg text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded transition">
                KSAE 공지봇
              </a>
              <LoginButton />
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-6">
            <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-400 dark:text-gray-500">
              KSAE 대학생 자작자동차대회 공지사항 알림봇
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
