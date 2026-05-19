'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getUserDisplayName, getUserInitial } from '@/lib/auth/display'
import { useT } from '@/components/LanguageProvider'

export default function Sidebar() {
  const pathname = usePathname()
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    function updateUser(user: Parameters<typeof getUserDisplayName>[0]) {
      if (user) {
        setUserDisplayName(getUserDisplayName(user))
        setIsLoggedIn(true)
      } else {
        setUserDisplayName(null)
        setIsLoggedIn(false)
      }
    }
    supabase.auth.getUser().then(({ data: { user } }) => updateUser(user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      updateUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const navItems = [
    { href: '/',       label: t('nav.home'),      icon: HomeIcon },
    { href: '/session', label: t('nav.practice'),  icon: MicIcon },
    { href: '/review',  label: t('nav.review'),    icon: BookIcon },
    { href: '/history', label: t('nav.history'),   icon: ClockIcon },
    { href: '/settings', label: t('nav.settings'), icon: GearIcon },
  ]

  const sidebar = (isMobile: boolean) => (
    <aside
      className={`flex flex-col h-full border-r transition-all duration-200 shrink-0 ${isMobile ? 'fixed left-0 top-0 z-50 shadow-xl' : ''}`}
      style={{
        width: collapsed && !isMobile ? '3.5rem' : '14rem',
        background: 'var(--theme-bg-sidebar)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {/* Header: branding */}
      <div className="flex items-center gap-2 h-12 px-3 shrink-0">
        <span className="text-lg shrink-0">🗣️</span>
        {!collapsed && <span className="font-semibold text-sm text-[var(--theme-text-primary)]">MeteorVoice</span>}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1 rounded text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]"
            aria-label="Close menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" />
              <line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 space-y-1 mt-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => isMobile && setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: active ? 'var(--theme-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--theme-text-secondary)',
              }}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: user area */}
      <div className="px-2 pb-1">
        {isLoggedIn ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: 'var(--theme-accent)' }}
            >
              {getUserInitial(userDisplayName ?? t('nav.account'))}
            </div>
            {!collapsed && (
              <span className="text-sm font-medium text-[var(--theme-text-primary)] truncate">
                {userDisplayName ?? t('nav.account')}
              </span>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            onClick={() => isMobile && setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--theme-surface)] transition-colors"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--theme-surface)', color: 'var(--theme-text-muted)' }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M15 7a5 5 0 11-10 0 5 5 0 0110 0z" />
                <path d="M1.5 17.5c1.5-2.5 5-4 8.5-4s7 1.5 8.5 4" />
              </svg>
            </div>
            {!collapsed && (
              <span className="text-xs text-[var(--theme-text-secondary)]">{t('nav.login')}</span>
            )}
          </Link>
        )}
      </div>

      {/* Collapse toggle at bottom right */}
      {!isMobile && (
        <div className="flex justify-end px-2 pb-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-secondary)] transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.2" />
              <line x1="6" y1="1" x2="6" y2="17" stroke="currentColor" strokeWidth="1.2" />
              {collapsed ? (
                <path d="M10 6.5l2.5 2.5-2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M12.5 6.5L10 9l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>
      )}
    </aside>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 p-2 rounded-lg"
        style={{ background: 'var(--theme-bg-card)', border: '1px solid var(--theme-border)' }}
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--theme-text-primary)" strokeWidth="1.5" strokeLinecap="round">
          <line x1="3" y1="5" x2="15" y2="5" />
          <line x1="3" y1="9" x2="15" y2="9" />
          <line x1="3" y1="13" x2="15" y2="13" />
        </svg>
      </button>

      <div className="hidden lg:block h-full">{sidebar(false)}</div>

      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40"
            style={{ background: 'var(--theme-overlay)' }}
            onClick={() => setMobileOpen(false)}
          />
          {sidebar(true)}
        </>
      )}
    </>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8l7-5 7 5v9a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" />
      <path d="M8 18V11h4v7" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="6" height="10" rx="3" />
      <path d="M4 10a6 6 0 0012 0" />
      <line x1="10" y1="16" x2="10" y2="19" />
      <line x1="7" y1="19" x2="13" y2="19" />
    </svg>
  )
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6v11a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2z" />
      <path d="M6 1v6l2-2 2 2V1" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4l3 2" />
    </svg>
  )
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1.5V4M10 16v2.5M18.5 10H16M4 10H1.5M16.01 3.99l-1.77 1.77M5.76 14.24l-1.77 1.77M16.01 16.01l-1.77-1.77M5.76 5.76L3.99 3.99" />
    </svg>
  )
}
