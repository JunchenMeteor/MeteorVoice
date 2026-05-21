import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { createMeteorVoiceApiClient, MeteorVoiceApiError, type HistorySession } from '@meteorvoice/api-client'
import { createInitialSnapshot, transition, type WorkflowSnapshot } from '@meteorvoice/session-core'
import { accentProfiles, scenarios, type ConversationMessage, type ConversationResponse } from '@meteorvoice/shared'

import { useMobileAuth } from './mobileAuth'
import { useNativeSessionAudio } from './nativeAudio'

const defaultApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000'
type SessionTab = 'corrections' | 'transcript'

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl)
  const [input, setInput] = useState('Hello, I want to practice small talk.')
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [correctionHistory, setCorrectionHistory] = useState<ConversationResponse['corrections']>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [status, setStatus] = useState('Ready')
  const [summary, setSummary] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([])
  const [selectedHistory, setSelectedHistory] = useState<HistorySession | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [ttsProvider, setTtsProvider] = useState('mock')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['mock'])
  const [ttsSpeed, setTtsSpeed] = useState(1)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot>(() => createInitialSnapshot('mobile-probe'))
  const [activeTab, setActiveTab] = useState<SessionTab>('corrections')
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [apiSessionId, setApiSessionId] = useState<string | null>(null)
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('small-talk')
  const [selectedAccentKey, setSelectedAccentKey] = useState('american')
  const audio = useNativeSessionAudio(audioUrl)
  const auth = useMobileAuth()

  const scenario = scenarios.find(item => item.key === selectedScenarioKey) ?? scenarios[0]
  const accent = accentProfiles.find(item => item.key === selectedAccentKey) ?? accentProfiles[0]
  const api = useMemo(() => createMeteorVoiceApiClient({
    baseUrl: apiBaseUrl.trim(),
    headers: auth.getAuthHeaders,
  }), [apiBaseUrl, auth.getAuthHeaders])
  const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')
  const latestAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant')

  function startSession() {
    const nextSessionId = apiSessionId ?? `mobile-${Date.now()}`
    const nextSnapshot = transition(createInitialSnapshot(nextSessionId), 'listening')
    setSnapshot(nextSnapshot)
    setMessages([])
    setCorrectionHistory([])
    setAudioUrl(null)
    setSummary(null)
    setIsSessionActive(true)
    setStatus('Listening')
  }

  async function runTurn() {
    const transcript = input.trim()
    if (!transcript || busy || audio.isRecording || !isSessionActive || snapshot.state === 'session_ended') return

    const userMessage: ConversationMessage = { role: 'user', content: transcript }
    const nextMessages = [...messages, userMessage]
    let nextSnapshot = transition(snapshot, snapshot.state === 'listening' ? 'transcribing' : 'listening', {
      lastTranscript: transcript,
      messages: nextMessages,
    })
    if (nextSnapshot.state === 'listening') {
      nextSnapshot = transition(nextSnapshot, 'transcribing', {
        lastTranscript: transcript,
        messages: nextMessages,
      })
    }
    setSnapshot(nextSnapshot)
    setMessages(nextMessages)
    setAudioUrl(null)
    setBusy(true)

    try {
      setStatus('Requesting coach reply')
      nextSnapshot = transition(nextSnapshot, 'thinking')
      setSnapshot(nextSnapshot)
      const coachReply = await api.generateCoachReply({
        messages: nextMessages,
        context: {
          scenario: { name: scenario.name, description: scenario.description },
          accentProfile: { name: accent.name, region: accent.region },
          sessionId: nextSnapshot.sessionId,
          turnNumber: nextMessages.filter(message => message.role === 'user').length,
        },
      })
      const messagesWithReply: ConversationMessage[] = [...nextMessages, { role: 'assistant', content: coachReply.text }]
      setMessages(messagesWithReply)
      setCorrectionHistory(previous => [...previous, ...coachReply.corrections])
      nextSnapshot = transition(nextSnapshot, 'speaking', {
        lastResponse: coachReply.text,
        lastCorrections: coachReply.corrections,
        messages: messagesWithReply,
      })
      setSnapshot(nextSnapshot)

      setStatus('Requesting coach voice')
      const speech = await api.synthesizeSpeech({
        text: coachReply.text,
        accent: accent.name,
        provider: ttsProvider,
        speed: ttsSpeed,
      })

      if (speech.audioUrl) {
        setStatus('Playing coach reply')
        setAudioUrl(speech.audioUrl)
      } else {
        setStatus('Coach reply received without audio')
      }
      const finalSnapshot = transition(nextSnapshot, 'correcting')
      setSnapshot(finalSnapshot)
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error
          ? error.message
          : 'Request failed'
      setStatus(message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleRecording() {
    if (audio.isRecording) {
      const recordingUri = await audio.stopRecording()
      setStatus(recordingUri ? 'Native recording saved' : 'Recording stopped')
      return
    }

    const started = await audio.startRecording()
    setStatus(started ? 'Native recording in progress' : 'Recording unavailable')
  }

  async function submitAuth() {
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password || auth.state === 'loading') return

    const success = await auth.submit(authMode, normalizedEmail, password)
    if (success) {
      setStatus(authMode === 'sign-in' ? 'Mobile session signed in' : 'Mobile account submitted')
      setPassword('')
    }
  }

  async function createApiSession() {
    if (auth.state !== 'signed-in' || busy) return

    setBusy(true)
    try {
      setStatus('Creating mobile API session')
      const session = await api.createSession()
      const nextSessionId = typeof session.id === 'string' ? session.id : null
      setApiSessionId(nextSessionId)
      setStatus(nextSessionId ? 'Mobile API session ready' : 'Mobile API session created')
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error
          ? error.message
          : 'Session request failed'
      setStatus(message)
    } finally {
      setBusy(false)
    }
  }

  async function loadHistory() {
    if (historyLoading) return

    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await api.listHistory()
      setHistorySessions(result.sessions)
      setSelectedHistory(result.sessions[0] ?? null)
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error
          ? error.message
          : 'History request failed'
      setHistoryError(message)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadPreferences() {
    if (settingsLoading) return

    setSettingsLoading(true)
    setSettingsMessage(null)
    try {
      const preferences = await api.getPreferences()
      setTtsProvider(preferences.tts_provider ?? 'mock')
      setAvailableProviders(preferences.available_providers?.length ? preferences.available_providers : ['mock'])
      setSettingsMessage('Preferences loaded')
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error
          ? error.message
          : 'Preferences request failed'
      setSettingsMessage(message)
    } finally {
      setSettingsLoading(false)
    }
  }

  async function saveProvider(provider: string) {
    setTtsProvider(provider)
    setSettingsLoading(true)
    setSettingsMessage(null)
    try {
      const result = await api.updatePreferences({ tts_provider: provider })
      setTtsProvider(result.tts_provider)
      setSettingsMessage('Preferences saved')
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error
          ? error.message
          : 'Preferences save failed'
      setSettingsMessage(message)
    } finally {
      setSettingsLoading(false)
    }
  }

  function adjustSpeed(delta: number) {
    setTtsSpeed(previous => Math.min(1.3, Math.max(0.7, Number((previous + delta).toFixed(1)))))
  }

  async function continueSession() {
    if (!isSessionActive || snapshot.state === 'session_ended') return
    const nextSnapshot = snapshot.state === 'correcting' || snapshot.state === 'idle'
      ? transition(snapshot, 'listening')
      : snapshot
    setSnapshot(nextSnapshot)
    setStatus('Listening')
  }

  async function endSession() {
    if (!isSessionActive || busy) return

    setBusy(true)
    try {
      setStatus('Generating summary')
      const userTurns = messages.filter(message => message.role === 'user').length
      const result = await api.generateSummary({
        sessionId: snapshot.sessionId,
        scenario: scenario.name,
        messages,
        turnNumber: userTurns,
      })
      setSummary(result.summary)

      await api.syncSession({
        session_id: snapshot.sessionId,
        scenario: scenario.name,
        accent: accent.name,
        turns: userTurns,
        messages,
        corrections: correctionHistory,
      }).catch(() => undefined)

      setSnapshot(transition(snapshot, 'session_ended'))
      setIsSessionActive(false)
      setStatus('Session ended')
    } catch (error) {
      const message = error instanceof MeteorVoiceApiError
        ? `${error.message} (${error.status})`
        : error instanceof Error
          ? error.message
          : 'Summary request failed'
      setStatus(message)
    } finally {
      setBusy(false)
    }
  }

  function selectScenario(key: string) {
    setSelectedScenarioKey(key)
    setMessages([])
    setCorrectionHistory([])
    setAudioUrl(null)
    setSummary(null)
    setSnapshot(createInitialSnapshot('mobile-probe'))
    setIsSessionActive(false)
    setStatus('Scenario selected')
  }

  function selectAccent(key: string) {
    setSelectedAccentKey(key)
    setAudioUrl(null)
    setStatus('Accent selected')
  }

  return (
    <SafeAreaView style={styles.shell}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MeteorVoice Mobile Probe</Text>
          <Text style={styles.title}>Session Architecture Check</Text>
          <Text style={styles.subtitle}>
            Uses shared types and API client against the existing MeteorVoice backend.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>API base URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            onChangeText={setApiBaseUrl}
            placeholder="http://localhost:3000"
            style={styles.input}
            value={apiBaseUrl}
          />
        </View>

        <View style={styles.selectorPanel}>
          <View style={styles.selectorHeader}>
            <View>
              <Text style={styles.label}>Practice setup</Text>
              <Text style={styles.authHint}>{scenario.name} · {accent.name}</Text>
            </View>
          </View>

          <Text style={styles.metaLabel}>Scenario</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
            {scenarios.map(item => {
              const active = item.key === scenario.key
              return (
                <Pressable
                  key={item.key}
                  onPress={() => selectScenario(item.key)}
                  style={[styles.optionCard, active && styles.optionCardActive]}
                >
                  <Text style={styles.optionIcon}>{item.icon}</Text>
                  <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{item.name}</Text>
                  <Text style={[styles.optionMeta, active && styles.optionMetaActive]}>{item.difficulty}</Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <Text style={styles.metaLabel}>Accent</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
            {accentProfiles.map(item => {
              const active = item.key === accent.key
              return (
                <Pressable
                  key={item.key}
                  onPress={() => selectAccent(item.key)}
                  style={[styles.accentChip, active && styles.optionCardActive]}
                >
                  <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{item.name}</Text>
                  <Text style={[styles.optionMeta, active && styles.optionMetaActive]}>{item.region}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        <View style={styles.authPanel}>
          <View style={styles.authHeader}>
            <View>
              <Text style={styles.label}>Mobile API session</Text>
              <Text style={styles.authHint}>
                {auth.user?.email ?? auth.message ?? auth.state}
              </Text>
            </View>
            {auth.state === 'signed-in' ? (
              <View style={styles.signedInActions}>
                <Pressable disabled={busy} onPress={createApiSession} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>Create session</Text>
                </Pressable>
                <Pressable onPress={() => void auth.signOut()} style={styles.smallButtonMuted}>
                  <Text style={styles.smallButtonMutedText}>Sign out</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.modeSwitch}>
                <Pressable onPress={() => setAuthMode('sign-in')} style={[
                  styles.modeButton,
                  authMode === 'sign-in' && styles.modeButtonActive,
                ]}>
                  <Text style={[styles.modeButtonText, authMode === 'sign-in' && styles.modeButtonTextActive]}>
                    Sign in
                  </Text>
                </Pressable>
                <Pressable onPress={() => setAuthMode('sign-up')} style={[
                  styles.modeButton,
                  authMode === 'sign-up' && styles.modeButtonActive,
                ]}>
                  <Text style={[styles.modeButtonText, authMode === 'sign-up' && styles.modeButtonTextActive]}>
                    Sign up
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {auth.state !== 'signed-in' && (
            <View style={styles.authForm}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="email"
                onChangeText={setEmail}
                placeholder="email@example.com"
                style={styles.input}
                value={email}
              />
              <TextInput
                autoCapitalize="none"
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
                style={styles.input}
                value={password}
              />
              <Pressable
                disabled={auth.state === 'loading'}
                onPress={submitAuth}
                style={({ pressed }) => [
                  styles.smallButton,
                  auth.state === 'loading' && styles.buttonDisabled,
                  pressed && auth.state !== 'loading' && styles.buttonPressed,
                ]}
              >
                <Text style={styles.smallButtonText}>
                  {auth.state === 'loading' ? 'Loading...' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}
                </Text>
              </Pressable>
            </View>
          )}
          {apiSessionId && (
            <Text style={styles.authHint} numberOfLines={1}>
              API session: {apiSessionId}
            </Text>
          )}
        </View>

        <View style={styles.historyPanel}>
          <View style={styles.authHeader}>
            <View>
              <Text style={styles.label}>History and review</Text>
              <Text style={styles.authHint}>
                {selectedHistory ? `${selectedHistory.scenario} · ${selectedHistory.date}` : 'Load synced sessions'}
              </Text>
            </View>
            <Pressable disabled={historyLoading} onPress={loadHistory} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>{historyLoading ? 'Loading...' : 'Load'}</Text>
            </Pressable>
          </View>
          {historyError && <Text style={styles.audioError}>{historyError}</Text>}
          {historySessions.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
              {historySessions.map(item => {
                const active = item.id === selectedHistory?.id
                return (
                  <Pressable
                    key={String(item.id)}
                    onPress={() => setSelectedHistory(item)}
                    style={[styles.historyCard, active && styles.optionCardActive]}
                  >
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{item.scenario}</Text>
                    <Text style={[styles.optionMeta, active && styles.optionMetaActive]}>{item.accent}</Text>
                    <Text style={[styles.optionMeta, active && styles.optionMetaActive]}>{item.date}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : (
            <Text style={styles.empty}>No synced sessions loaded.</Text>
          )}
          {selectedHistory && (
            <View style={styles.summaryBox}>
              <Text style={styles.correctionType}>Review</Text>
              <Text style={styles.correctionHint}>
                {selectedHistory.summary ?? 'No summary saved for this session yet.'}
              </Text>
              <Text style={styles.optionMeta}>
                Status: {String(selectedHistory.status)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.settingsPanel}>
          <View style={styles.authHeader}>
            <View>
              <Text style={styles.label}>Settings</Text>
              <Text style={styles.authHint}>
                Voice {ttsProvider} · Speed {ttsSpeed.toFixed(1)}x · Default {scenario.name}
              </Text>
            </View>
            <Pressable disabled={settingsLoading} onPress={loadPreferences} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>{settingsLoading ? 'Loading...' : 'Load'}</Text>
            </Pressable>
          </View>
          <Text style={styles.metaLabel}>TTS provider</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
            {availableProviders.map(provider => {
              const active = provider === ttsProvider
              return (
                <Pressable
                  disabled={settingsLoading}
                  key={provider}
                  onPress={() => void saveProvider(provider)}
                  style={[styles.providerChip, active && styles.optionCardActive]}
                >
                  <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{provider}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
          <View style={styles.speedRow}>
            <Pressable onPress={() => adjustSpeed(-0.1)} style={styles.smallButtonMuted}>
              <Text style={styles.smallButtonMutedText}>Slower</Text>
            </Pressable>
            <Text style={styles.speedValue}>{ttsSpeed.toFixed(1)}x</Text>
            <Pressable onPress={() => adjustSpeed(0.1)} style={styles.smallButtonMuted}>
              <Text style={styles.smallButtonMutedText}>Faster</Text>
            </Pressable>
          </View>
          {settingsMessage && <Text style={styles.authHint}>{settingsMessage}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Your line</Text>
          <View style={styles.sessionControls}>
            {!isSessionActive && snapshot.state !== 'session_ended' ? (
              <Pressable onPress={startSession} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Start session</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  disabled={busy || snapshot.state === 'session_ended'}
                  onPress={continueSession}
                  style={[styles.smallButton, (busy || snapshot.state === 'session_ended') && styles.buttonDisabled]}
                >
                  <Text style={styles.smallButtonText}>Continue</Text>
                </Pressable>
                <Pressable
                  disabled={busy || snapshot.state === 'session_ended'}
                  onPress={endSession}
                  style={[styles.smallButtonMuted, (busy || snapshot.state === 'session_ended') && styles.buttonDisabled]}
                >
                  <Text style={styles.smallButtonMutedText}>End</Text>
                </Pressable>
              </>
            )}
          </View>
          <TextInput
            multiline
            onChangeText={setInput}
            style={[styles.input, styles.textarea]}
            value={input}
          />
          <Pressable disabled={busy || audio.isRecording || !isSessionActive} onPress={runTurn} style={({ pressed }) => [
            styles.button,
            (busy || audio.isRecording || !isSessionActive) && styles.buttonDisabled,
            pressed && !busy && !audio.isRecording && isSessionActive && styles.buttonPressed,
          ]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send turn</Text>}
          </Pressable>
        </View>

        <View style={styles.stage}>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.audioState}>Session: {snapshot.state} · Turn {snapshot.turnNumber}</Text>
          <Text style={styles.audioState}>
            Audio: {audio.phase} · Mic: {audio.permission} · {Math.round(audio.durationMillis / 1000)}s
          </Text>
          <Text style={styles.speaker}>Coach</Text>
          <Text style={styles.reply}>
            {latestAssistantMessage?.content ?? 'The coach reply will appear here.'}
          </Text>
          <Text style={styles.speaker}>You</Text>
          <Text style={styles.userSubtitle}>
            {latestUserMessage?.content ?? 'Start the session, then send your first line.'}
          </Text>
          <View style={styles.stageActions}>
            <Pressable
              disabled={audio.isPlaying}
              onPress={toggleRecording}
              style={({ pressed }) => [
                styles.secondaryButton,
                audio.isRecording && styles.recordingButton,
                audio.isPlaying && styles.buttonDisabled,
                pressed && !audio.isPlaying && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {audio.isRecording ? 'Stop recording' : 'Test native mic'}
              </Text>
            </Pressable>
            {audioUrl && (
              <Pressable onPress={() => void audio.playReply()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Replay voice</Text>
              </Pressable>
            )}
          </View>
          {audio.lastRecordingUri && (
            <Text style={styles.recordingUri} numberOfLines={1}>
              Recording: {audio.lastRecordingUri}
            </Text>
          )}
          {audio.errorMessage && (
            <Text style={styles.audioError}>{audio.errorMessage}</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.tabs}>
            <Pressable
              onPress={() => setActiveTab('corrections')}
              style={[styles.tabButton, activeTab === 'corrections' && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, activeTab === 'corrections' && styles.tabTextActive]}>
                Corrections
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('transcript')}
              style={[styles.tabButton, activeTab === 'transcript' && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, activeTab === 'transcript' && styles.tabTextActive]}>
                Transcript
              </Text>
            </Pressable>
          </View>

          {activeTab === 'corrections' ? (
            correctionHistory.length ? correctionHistory.map((correction, index) => (
              <View key={`${correction.type}-${index}`} style={styles.correction}>
                <Text style={styles.correctionType}>{correction.type}</Text>
                <Text style={styles.correctionText}>{correction.originalText} {'->'} {correction.suggestedText}</Text>
                <Text style={styles.correctionHint}>{correction.explanation}</Text>
              </View>
            )) : (
              <Text style={styles.empty}>No corrections yet.</Text>
            )
          ) : (
            messages.length ? messages.map((message, index) => (
              <View key={`${message.role}-${index}`} style={styles.transcriptItem}>
                <Text style={styles.correctionType}>{message.role === 'user' ? 'You' : 'Coach'}</Text>
                <Text style={styles.correctionHint}>{message.content}</Text>
              </View>
            )) : (
              <Text style={styles.empty}>No transcript yet.</Text>
            )
          )}

          {summary && (
            <View style={styles.summaryBox}>
              <Text style={styles.correctionType}>Summary</Text>
              <Text style={styles.correctionHint}>{summary}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#f6f3ef',
  },
  content: {
    gap: 18,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
    paddingTop: 12,
  },
  eyebrow: {
    color: '#6f7f70',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: '#17211b',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#5f6b62',
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    gap: 10,
  },
  label: {
    color: '#253128',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    borderColor: '#d8d0c5',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17211b',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fffaf3',
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  sessionControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#315f48',
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    backgroundColor: '#fffaf3',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 12,
  },
  metaLabel: {
    color: '#79857b',
    fontSize: 12,
    fontWeight: '700',
  },
  metaValue: {
    color: '#17211b',
    fontSize: 15,
    fontWeight: '700',
  },
  selectorPanel: {
    backgroundColor: '#fffaf3',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  selectorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionRow: {
    gap: 10,
    paddingRight: 4,
  },
  optionCard: {
    backgroundColor: '#f6f0e7',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    minHeight: 92,
    padding: 12,
    width: 144,
  },
  accentChip: {
    backgroundColor: '#f6f0e7',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    minHeight: 68,
    padding: 12,
    width: 154,
  },
  historyCard: {
    backgroundColor: '#f6f0e7',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    minHeight: 94,
    padding: 12,
    width: 168,
  },
  providerChip: {
    alignItems: 'center',
    backgroundColor: '#f6f0e7',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionCardActive: {
    backgroundColor: '#315f48',
    borderColor: '#315f48',
  },
  optionIcon: {
    fontSize: 20,
  },
  optionTitle: {
    color: '#17211b',
    fontSize: 14,
    fontWeight: '800',
  },
  optionTitleActive: {
    color: '#fff',
  },
  optionMeta: {
    color: '#6f7f70',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  optionMetaActive: {
    color: '#dbe8db',
  },
  authPanel: {
    backgroundColor: '#fffaf3',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  historyPanel: {
    backgroundColor: '#fffaf3',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  settingsPanel: {
    backgroundColor: '#fffaf3',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  authHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  authHint: {
    color: '#6f7f70',
    fontSize: 12,
    marginTop: 3,
  },
  authForm: {
    gap: 10,
  },
  modeSwitch: {
    backgroundColor: '#eee6da',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 3,
  },
  modeButton: {
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  modeButtonActive: {
    backgroundColor: '#315f48',
  },
  modeButtonText: {
    color: '#253128',
    fontSize: 12,
    fontWeight: '800',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  smallButton: {
    alignItems: 'center',
    backgroundColor: '#315f48',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  smallButtonMuted: {
    alignItems: 'center',
    backgroundColor: '#e4dacc',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  smallButtonMutedText: {
    color: '#253128',
    fontSize: 13,
    fontWeight: '800',
  },
  signedInActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  speedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  speedValue: {
    color: '#17211b',
    fontSize: 16,
    fontWeight: '800',
    minWidth: 52,
    textAlign: 'center',
  },
  stage: {
    alignItems: 'center',
    backgroundColor: '#16211b',
    borderRadius: 10,
    gap: 12,
    padding: 22,
  },
  status: {
    color: '#b7c5b9',
    fontSize: 13,
    fontWeight: '700',
  },
  audioState: {
    color: '#8fa394',
    fontSize: 12,
    fontWeight: '700',
  },
  speaker: {
    color: '#d6c486',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  reply: {
    color: '#fffaf3',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
    textAlign: 'center',
  },
  userSubtitle: {
    color: '#dbe8db',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    textAlign: 'center',
  },
  secondaryButton: {
    borderColor: '#d6c486',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#fffaf3',
    fontWeight: '800',
  },
  stageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  recordingButton: {
    backgroundColor: '#7c2f28',
    borderColor: '#d8a097',
  },
  recordingUri: {
    color: '#b7c5b9',
    fontSize: 12,
    maxWidth: '100%',
  },
  audioError: {
    color: '#ffb8ac',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  tabs: {
    backgroundColor: '#eee6da',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 3,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#315f48',
  },
  tabText: {
    color: '#253128',
    fontSize: 13,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#fff',
  },
  correction: {
    backgroundColor: '#fffaf3',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  correctionType: {
    color: '#8b6f28',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  correctionText: {
    color: '#17211b',
    fontSize: 14,
    fontWeight: '700',
  },
  correctionHint: {
    color: '#5f6b62',
    fontSize: 13,
    lineHeight: 19,
  },
  empty: {
    color: '#6f7f70',
    fontSize: 14,
  },
  transcriptItem: {
    backgroundColor: '#fffaf3',
    borderColor: '#e1d8cb',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  summaryBox: {
    backgroundColor: '#eef5ef',
    borderColor: '#c7d9ca',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
})
