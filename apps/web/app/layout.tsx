/**
 * Root layout with ThemeProvider and LanguageProvider.
 * 根布局。
 */

import type { Metadata } from 'next'

import './globals.css'
import ActiveSessionBar from '@/components/ActiveSessionBar'
import AppFeedbackPresenter from '@/components/AppFeedbackPresenter'
import LanguageProvider from '@/components/LanguageProvider'
import Sidebar from '@/components/Sidebar'
import ThemeProvider from '@/components/ThemeProvider'
import VoiceSessionProvider from '@/components/VoiceSessionProvider'

export const metadata: Metadata = {
  title: 'MeteorVoice',
  description: 'Practice spoken English through voice conversation with an AI coach. Scenario-based learning with real-time corrections and accent adaptation.',
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="h-full">
        <ThemeProvider>
          <LanguageProvider>
            <VoiceSessionProvider>
              <div className="flex h-full">
                <Sidebar />
                <main className="flex-1 overflow-auto min-w-0 lg:pt-0">
                  <ActiveSessionBar />
                  {children}
                </main>
                <AppFeedbackPresenter />
              </div>
            </VoiceSessionProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
