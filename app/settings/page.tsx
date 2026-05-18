'use client'

import { useTheme, themes } from '@/components/ThemeProvider'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--theme-text-secondary)] mt-1">
          Customize your practice environment.
        </p>
      </div>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose a visual theme for the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {themes.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTheme(t.key)}
                className={`chip-action ${t.key === theme ? 'is-active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Provider mode */}
      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>Current mode and model configuration.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--theme-text-secondary)]">Mode</span>
              <span className="chip-action is-active">Mock</span>
            </div>
            <p className="text-xs text-[var(--theme-text-muted)]">
              Add DEEPSEEK_API_KEY to .env.local to switch to the real AI provider. The app uses mock STT/TTS/AI by default.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--theme-text-secondary)]">
            English Conversation Coach v0.1.0 — Phase 1 MVP.<br />
            Built with Next.js, Supabase, Vercel AI SDK, LangGraph, and shadcn/ui.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
