/**
 * Theme configuration and types.
 * 主题配置与类型。
 */

export type ThemeKey = 'forest' | 'night' | 'conversation' | 'learning'

export type ThemeColors = {
  bg: string; accent: string; gold: string; cream: string
  surface: string; border: string; danger: string; success: string
  warning: string; textPrimary: string; textSecondary: string; textMuted: string
}

export const themes: Record<ThemeKey, ThemeColors> = {
  forest: {
    bg: '#16211b',
    accent: '#315f48',
    gold: '#d6c486',
    cream: '#fffaf3',
    surface: '#1e2d24',
    border: '#2a3d30',
    danger: '#7c2f28',
    success: '#4caf7d',
    warning: '#c9a227',
    textPrimary: '#fffaf3',
    textSecondary: '#dbe8db',
    textMuted: '#8fa394',
  },
  night: {
    bg: '#0a0f1e',
    accent: '#3b82f6',
    gold: '#fbbf24',
    cream: '#ffffff',
    surface: '#111827',
    border: '#1e2d45',
    danger: '#f87171',
    success: '#34d399',
    warning: '#fbbf24',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    textMuted: '#4b5563',
  },
  conversation: {
    bg: '#0c0a14',
    accent: '#a78bfa',
    gold: '#f472b6',
    cream: '#f3f0ff',
    surface: '#1a1726',
    border: '#2d2844',
    danger: '#f87171',
    success: '#34d399',
    warning: '#fbbf24',
    textPrimary: '#f3f0ff',
    textSecondary: '#a5a0c4',
    textMuted: '#5c5780',
  },
  learning: {
    bg: '#fffdf7',
    accent: '#d97706',
    gold: '#d97706',
    cream: '#1c1917',
    surface: '#ffffff',
    border: '#fde68a',
    danger: '#dc2626',
    success: '#059669',
    warning: '#ea580c',
    textPrimary: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#a8a29e',
  },
} as const

export const themeLabels: Record<ThemeKey, { en: string; zh: string }> = {
  forest: { en: 'Forest', zh: '森林' },
  night: { en: 'Night', zh: '夜间' },
  conversation: { en: 'Conversation', zh: '对话' },
  learning: { en: 'Learning', zh: '学习' },
}

// 默认导出 forest 主题，供不支持 context 的地方使用
export const C = themes.forest
