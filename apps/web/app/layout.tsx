import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import ThemeProvider from '@/components/ThemeProvider'
import LanguageProvider from '@/components/LanguageProvider'
import VoiceSessionProvider from '@/components/VoiceSessionProvider'
import ActiveSessionBar from '@/components/ActiveSessionBar'

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
                <main className="flex-1 overflow-auto min-w-0 pt-14 lg:pt-0">
                  {children}
                </main>
                <ActiveSessionBar />
              </div>
            </VoiceSessionProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
