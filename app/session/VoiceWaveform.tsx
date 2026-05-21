'use client'

import type { CSSProperties, JSX } from 'react'

export type VoiceWaveformMode =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'paused'
  | 'ended'

type VoiceWaveformProps = {
  mode: VoiceWaveformMode
  level?: number
  label: string
  variant?: 'panel' | 'stage'
}

type WaveformTone = {
  color: string
  glow: string
  track: string
  animation: 'none' | 'breathe' | 'listen' | 'speak' | 'process'
  duration: string
  opacity: number
  baseScale: number
}

const BAR_COUNT = 18
const BAR_PATTERN = [0.32, 0.52, 0.74, 0.46, 0.9, 0.58, 0.38, 0.82, 0.64]

const MODE_TONES: Record<VoiceWaveformMode, WaveformTone> = {
  idle: {
    color: 'var(--theme-text-muted)',
    glow: 'color-mix(in srgb, var(--theme-text-muted) 18%, transparent)',
    track: 'color-mix(in srgb, var(--theme-text-muted) 10%, transparent)',
    animation: 'breathe',
    duration: '2.8s',
    opacity: 0.58,
    baseScale: 0.34,
  },
  listening: {
    color: 'var(--theme-success)',
    glow: 'color-mix(in srgb, var(--theme-success) 24%, transparent)',
    track: 'color-mix(in srgb, var(--theme-success) 10%, transparent)',
    animation: 'listen',
    duration: '820ms',
    opacity: 0.94,
    baseScale: 0.74,
  },
  transcribing: {
    color: 'var(--theme-accent)',
    glow: 'color-mix(in srgb, var(--theme-accent) 16%, transparent)',
    track: 'color-mix(in srgb, var(--theme-accent) 9%, transparent)',
    animation: 'process',
    duration: '1.8s',
    opacity: 0.7,
    baseScale: 0.42,
  },
  thinking: {
    color: 'var(--theme-warning)',
    glow: 'color-mix(in srgb, var(--theme-warning) 15%, transparent)',
    track: 'color-mix(in srgb, var(--theme-warning) 8%, transparent)',
    animation: 'process',
    duration: '2.2s',
    opacity: 0.66,
    baseScale: 0.38,
  },
  speaking: {
    color: 'var(--theme-accent-2)',
    glow: 'color-mix(in srgb, var(--theme-accent-2) 26%, transparent)',
    track: 'color-mix(in srgb, var(--theme-accent-2) 11%, transparent)',
    animation: 'speak',
    duration: '640ms',
    opacity: 0.96,
    baseScale: 0.82,
  },
  paused: {
    color: 'var(--theme-warning)',
    glow: 'color-mix(in srgb, var(--theme-warning) 12%, transparent)',
    track: 'color-mix(in srgb, var(--theme-warning) 8%, transparent)',
    animation: 'none',
    duration: '0s',
    opacity: 0.5,
    baseScale: 0.28,
  },
  ended: {
    color: 'var(--theme-text-muted)',
    glow: 'transparent',
    track: 'color-mix(in srgb, var(--theme-text-muted) 8%, transparent)',
    animation: 'none',
    duration: '0s',
    opacity: 0.42,
    baseScale: 0.2,
  },
}

function clampLevel(level: number | undefined) {
  if (typeof level !== 'number' || Number.isNaN(level)) {
    return undefined
  }

  return Math.min(1, Math.max(0, level))
}

export function VoiceWaveform({ mode, level, label, variant = 'panel' }: VoiceWaveformProps): JSX.Element {
  const tone = MODE_TONES[mode]
  const normalizedLevel = clampLevel(level)
  const levelScale = normalizedLevel == null
    ? tone.baseScale
    : 0.18 + normalizedLevel * 0.82

  const rootStyle = {
    '--voice-waveform-color': tone.color,
    '--voice-waveform-glow': tone.glow,
    '--voice-waveform-track': tone.track,
    '--voice-waveform-duration': tone.duration,
    '--voice-waveform-opacity': tone.opacity,
  } as CSSProperties

  return (
    <div
      className={`voice-waveform flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 sm:px-4 ${
        variant === 'panel' ? 'border' : 'flex-col border-0'
      }`}
      data-mode={mode}
      data-variant={variant}
      style={{
        ...rootStyle,
        background: variant === 'panel' ? 'var(--theme-bg-card)' : 'transparent',
        borderColor: variant === 'panel' ? 'var(--theme-border)' : 'transparent',
      }}
      aria-label={label}
      role="img"
    >
      <div
        className="voice-waveform__bars flex h-12 w-28 shrink-0 items-center justify-center gap-1 overflow-hidden sm:w-36"
        aria-hidden="true"
      >
        {Array.from({ length: BAR_COUNT }, (_, index) => {
          const pattern = BAR_PATTERN[index % BAR_PATTERN.length]
          const height = Math.round(14 + pattern * levelScale * 34)
          const barStyle = {
            height,
            animationDelay: `${index * -74}ms`,
            animationDuration: tone.duration,
          } as CSSProperties

          return (
            <span
              className="voice-waveform__bar block w-1 rounded-full"
              data-animation={tone.animation}
              key={index}
              style={barStyle}
            />
          )
        })}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-5 text-[var(--theme-text-primary)]">
          {label}
        </p>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--voice-waveform-track)]">
          <span
            className="voice-waveform__meter block h-full rounded-full"
            style={{ width: `${Math.round(levelScale * 100)}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      <style jsx>{`
        .voice-waveform {
          box-shadow: 0 10px 30px -24px var(--voice-waveform-glow);
        }

        .voice-waveform[data-variant='stage'] {
          box-shadow: none;
        }

        .voice-waveform[data-variant='stage'] .voice-waveform__bars {
          width: min(82vw, 24rem);
          height: 7rem;
          gap: 0.375rem;
        }

        .voice-waveform[data-variant='stage'] .voice-waveform__bar {
          width: 0.375rem;
          min-height: 1.25rem;
        }

        .voice-waveform[data-variant='stage'] .voice-waveform__meter {
          display: none;
        }

        .voice-waveform[data-variant='stage'] > div:last-child {
          flex: none;
          width: min(70vw, 18rem);
          text-align: center;
        }

        .voice-waveform__bar {
          min-height: 0.75rem;
          background: var(--voice-waveform-color);
          opacity: var(--voice-waveform-opacity);
          transform-origin: center;
          transition:
            height 180ms ease,
            opacity 180ms ease,
            background-color 180ms ease;
        }

        .voice-waveform__bar[data-animation='breathe'] {
          animation: voice-waveform-breathe var(--voice-waveform-duration) ease-in-out infinite;
        }

        .voice-waveform__bar[data-animation='listen'] {
          animation: voice-waveform-listen var(--voice-waveform-duration) ease-in-out infinite;
        }

        .voice-waveform__bar[data-animation='speak'] {
          animation: voice-waveform-speak var(--voice-waveform-duration) cubic-bezier(0.35, 0, 0.25, 1) infinite;
        }

        .voice-waveform__bar[data-animation='process'] {
          animation: voice-waveform-process var(--voice-waveform-duration) ease-in-out infinite;
        }

        .voice-waveform__meter {
          background: linear-gradient(
            90deg,
            var(--voice-waveform-color),
            color-mix(in srgb, var(--voice-waveform-color) 54%, transparent)
          );
          opacity: 0.72;
          transition: width 180ms ease;
        }

        @keyframes voice-waveform-breathe {
          0%,
          100% {
            transform: scaleY(0.84);
          }
          50% {
            transform: scaleY(1.06);
          }
        }

        @keyframes voice-waveform-listen {
          0%,
          100% {
            transform: scaleY(0.72);
            opacity: 0.58;
          }
          45% {
            transform: scaleY(1.18);
            opacity: 1;
          }
          70% {
            transform: scaleY(0.9);
          }
        }

        @keyframes voice-waveform-speak {
          0%,
          100% {
            transform: scaleY(0.62);
            opacity: 0.62;
          }
          32% {
            transform: scaleY(1.28);
            opacity: 1;
          }
          58% {
            transform: scaleY(0.78);
          }
          76% {
            transform: scaleY(1.08);
          }
        }

        @keyframes voice-waveform-process {
          0%,
          100% {
            transform: scaleY(0.72);
            opacity: 0.42;
          }
          50% {
            transform: scaleY(1.04);
            opacity: 0.78;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .voice-waveform__bar {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
