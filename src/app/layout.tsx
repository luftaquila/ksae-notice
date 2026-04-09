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
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <SessionProvider>
          <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
              <a href="/" className="font-bold text-lg text-gray-900 hover:text-blue-600 transition">
                KSAE 공지봇
              </a>
              <LoginButton />
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-gray-200 bg-white py-6">
            <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-400">
              KSAE 대학생 자작자동차대회 공지사항 알림봇 &bull; <a href="https://github.com/luftaquila/ksae-notice" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 transition">GitHub</a>
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
