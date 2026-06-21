import {
  expect,
  test,
} from '@playwright/test'

test.describe('MeteorVoice login page', () => {
  test('renders identifier and password inputs', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[placeholder]')).toHaveCount(2)
    await expect(page.locator('button[type="submit"]').first()).toBeVisible()
  })
})

test.describe('MeteorVoice navigation guard', () => {
  test('session page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/session')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('MeteorVoice home page scenarios', () => {
  test('renders scenario buttons after login redirect or direct access', async ({ page }) => {
    await page.goto('/')
    const scenarioButtons = page.locator('button.data-panel')
    const count = await scenarioButtons.count()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe('MeteorVoice API guard integration', () => {
  test('protected endpoints reject unauthenticated requests', async ({ request }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001'
    const headers = { 'x-meteorvoice-client': 'meteorvoice-web' }

    const summaryResponse = await request.post(`${baseUrl}/api/summary`, {
      headers,
      data: { sessionId: 'test', scenario: 'test', messages: [], turnNumber: 1 },
    })
    expect(summaryResponse.status()).toBe(401)

    const sessionResponse = await request.post(`${baseUrl}/api/session`, {
      headers,
      data: {},
    })
    expect(sessionResponse.status()).toBe(401)

    const historyResponse = await request.get(`${baseUrl}/api/history`, { headers })
    expect(historyResponse.status()).toBe(401)
  })

  test('endpoints reject requests without client header', async ({ request }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001'

    const scenariosResponse = await request.get(`${baseUrl}/api/scenarios`)
    expect(scenariosResponse.status()).toBe(403)

    const accentsResponse = await request.get(`${baseUrl}/api/accents`)
    expect(accentsResponse.status()).toBe(403)
  })

  test('public catalog endpoints accept valid client header', async ({ request }) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001'
    const headers = { 'x-meteorvoice-client': 'meteorvoice-web' }

    const scenariosResponse = await request.get(`${baseUrl}/api/scenarios`, { headers })
    expect(scenariosResponse.status()).toBe(200)
    const scenariosBody = await scenariosResponse.json()
    expect(scenariosBody.scenarios).toBeDefined()
    expect(Array.isArray(scenariosBody.scenarios)).toBe(true)

    const accentsResponse = await request.get(`${baseUrl}/api/accents`, { headers })
    expect(accentsResponse.status()).toBe(200)
    const accentsBody = await accentsResponse.json()
    expect(accentsBody.accents).toBeDefined()

    const providersResponse = await request.get(`${baseUrl}/api/asr/providers`, { headers })
    expect(providersResponse.status()).toBe(200)
  })
})
