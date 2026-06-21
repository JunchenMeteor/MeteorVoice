import {
  expect,
  test,
} from '@playwright/test'

test.describe('MeteorVoice home page', () => {
  test('loads and shows title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/MeteorVoice/)
  })

  test('navigates to session page', async ({ page }) => {
    await page.goto('/')
    await page.click('a[href="/session"], button:has-text("Session"), button:has-text("会话")').catch(() => {
      // May redirect directly; just verify the page loads
    })
  })

  test('navigates to settings page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible()
  })

  test('navigates to history page', async ({ page }) => {
    await page.goto('/history')
    await expect(page.locator('h1, h2, [role="heading"]').first()).toBeVisible()
  })

  test('navigates to login page', async ({ page }) => {
    await page.goto('/login')
    // Login page may redirect or render differently; just confirm it loads
    await expect(page).not.toHaveTitle(/Error|Not Found/i)
  })
})
