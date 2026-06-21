import {
  expect,
  test,
} from '@playwright/test'

test.describe('MeteorVoice session smoke', () => {
  test('runs one mocked voice turn and renders reply plus correction', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-meteorvoice-e2e': '1' })
    await page.addInitScript(() => {
      window.__METEORVOICE_E2E_TRANSCRIPT__ = 'I goes to school yesterday.'
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          cancel() {},
          paused: false,
          resume() {},
          speak(utterance: SpeechSynthesisUtterance) {
            window.setTimeout(() => utterance.onend?.(new Event('end') as SpeechSynthesisEvent), 0)
          },
        },
      })
    })
    await page.route('**/api/preferences', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ tts_provider: 'mock', tts_speed: 1, tts_voice_id: null }),
    }))
    await page.route('**/api/semantic-endpoint', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ judgment: 'done' }),
    }))
    await page.route('**/api/chat', async route => {
      const body = route.request().postDataJSON() as { messages?: Array<{ role: string; content: string }> }
      expect(body.messages?.some(message => message.role === 'user' && message.content.includes('I goes to school'))).toBe(true)
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          text: 'Good effort. Say it as: I went to school yesterday.',
          corrections: [{
            type: 'grammar',
            originalText: 'I goes to school yesterday.',
            suggestedText: 'I went to school yesterday.',
            explanation: 'Use past tense for yesterday and use go without third-person s after I.',
            severity: 'minor',
          }],
          suggestedReply: 'I went to school yesterday.',
        }),
      })
    })

    await page.goto('/session')
    await expect(page.getByRole('button', { name: 'Start Session' })).toBeEnabled()
    await page.getByRole('button', { name: 'Start Session' }).click()

    await expect(page.locator(':visible', { hasText: 'I goes to school yesterday.' }).first()).toBeVisible()
    await expect(page.locator(':visible', { hasText: 'Good effort. Say it as: I went to school yesterday.' }).first()).toBeVisible()
    await expect(page.locator(':visible', { hasText: 'I went to school yesterday.' }).first()).toBeVisible()
  })
})
