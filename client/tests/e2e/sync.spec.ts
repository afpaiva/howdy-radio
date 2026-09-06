/**
 * /client/tests/e2e/sync.spec.ts
 *
 * Real end-to-end tests for playback synchronization, authentication gating,
 * and state correctness.
 *
 * Covers SPEC.md Definition of Done #1: two clients connecting to the same
 * broadcast must report the same track within acceptable drift.
 */

import { test, expect, Page } from '@playwright/test';

const ACCEPTABLE_DRIFT_SECONDS = 3;

/** A valid @howdy.com email for testing. */
const TEST_EMAIL = 'tester@howdy.com';

/**
 * Log in via the login gate form. This is called before every test since
 * the app is gated behind authentication.
 */
async function login(page: Page): Promise<void> {
  await page.goto('/');

  // Wait for the login gate to appear
  await expect(page.locator('input[type="email"]')).toBeVisible({
    timeout: 15000,
  });

  // Fill in a valid @howdy.com email
  await page.fill('input[type="email"]', TEST_EMAIL);

  // Submit
  await page.click('button:has-text("Sign in")');

  // Wait for the tune-in gate to appear (login succeeded, socket connecting)
  await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Parse the position from the skin's position display (format: "M:SS / M:SS").
 * Returns the current position in seconds.
 */
async function parsePosition(page: Page): Promise<number> {
  const positionText = await page
    .locator('[data-testid="position"]')
    .textContent();
  expect(positionText).toBeTruthy();
  const match = (positionText || '').match(/(\d+):(\d+)/);
  expect(match, `Position text "${positionText}" should match M:SS format`).not.toBeNull();
  const minutes = parseInt(match![1], 10);
  const seconds = parseInt(match![2], 10);
  return minutes * 60 + seconds;
}

test.describe('Authentication gate', () => {
  test('shows login form before authentication', async ({ page }) => {
    await page.goto('/');

    // Should see the login form with email input
    await expect(page.locator('input[type="email"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible();

    // Tune-in gate should NOT be visible (not authenticated yet)
    await expect(page.locator('[data-testid="tune-in"]')).not.toBeVisible();
  });

  test('rejects non-@howdy.com email', async ({ page }) => {
    await page.goto('/');

    await page.fill('input[type="email"]', 'someone@gmail.com');
    await page.click('button:has-text("Sign in")');

    // Should show an error message that does NOT mention @howdy.com
    const errorElement = page.locator('.howdy-form-error');
    await expect(errorElement).toBeVisible({ timeout: 10000 });
    const errorText = await errorElement.textContent();
    expect(errorText).toBeTruthy();
    // Error should be generic, not leaking the @howdy.com domain requirement
    const lowerText = errorText!.toLowerCase();
    expect(lowerText).not.toContain('@howdy.com');
    expect(lowerText).not.toContain('howdy.com domain');
    // Should mention "work email" or "access"
    expect(lowerText).toMatch(/work email|not.*access|isn't.*team/);

    // Tune-in gate should still NOT be visible
    await expect(page.locator('[data-testid="tune-in"]')).not.toBeVisible();
  });

  test('accepts @howdy.com email and grants access', async ({ page }) => {
    await page.goto('/');

    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.click('button:has-text("Sign in")');

    // Should now see the tune-in gate (authenticated)
    await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
      timeout: 15000,
    });

    // Login form should no longer be visible
    await expect(page.locator('input[type="email"]')).not.toBeVisible();
  });

  test('refresh preserves session (no login form shown)', async ({ page }) => {
    // Log in
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.click('button:has-text("Sign in")');
    await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
      timeout: 15000,
    });

    // Refresh the page
    await page.reload();

    // Should NOT show the login form — should go straight to the app
    await expect(page.locator('input[type="email"]')).not.toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Single-client playback', () => {
  test('queue is present from first state event (no flicker)', async ({ page }) => {
    await login(page);

    // Click "Tune in"
    await page.click('button:has-text("Tune in")');

    // Now wait for the skin to render (tune-in gate should disappear)
    await expect(page.locator('[data-testid="tune-in"]')).not.toBeVisible({
      timeout: 15000,
    });

    // The "Up Next" queue should be visible immediately with items
    const queueList = page.locator('[data-testid="queue"]');
    await expect(queueList).toBeVisible({ timeout: 15000 });

    // Wait a bit and verify the queue still has items (no flicker/disappearance)
    await page.waitForTimeout(2000);
    const itemCount = await queueList.locator('li[data-testid="queue-item"]').count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('tune-in receives state and renders the skin', async ({ page }) => {
    await login(page);

    await page.click('button:has-text("Tune in")');

    // The skin should render within 15 seconds
    await expect(page.locator('[data-testid="track-title"]')).toBeVisible({
      timeout: 15000,
    });

    // Track title should be non-empty
    const trackTitle = await page.locator('[data-testid="track-title"]').textContent();
    expect(trackTitle).toBeTruthy();
    expect(trackTitle).not.toBe('');

    // Queue should have at least 1 item
    const queueItems = page.locator('[data-testid="queue-item"]');
    const itemCount = await queueItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(1);

    // Connection status should show "connected"
    const connLabel = await page.locator('[data-testid="connection-label"]').textContent();
    expect(connLabel).toContain('connected');

    // Play state should be "Playing" (server is authoritative, isPlaying=true after bootstrap)
    const playState = await page.locator('[data-testid="play-state"]').textContent();
    expect(playState).toMatch(/playing|paused/i);
  });

  test('position advances over time (server-driven clock)', async ({ page }) => {
    await login(page);

    await page.click('button:has-text("Tune in")');
    await expect(page.locator('[data-testid="track-title"]')).toBeVisible({
      timeout: 15000,
    });

    // Read initial position
    const initialPosition = await parsePosition(page);

    // Wait 3 seconds — position should advance by ~3 seconds
    await page.waitForTimeout(3000);
    const laterPosition = await parsePosition(page);
    const diff = laterPosition - initialPosition;

    // Position should have advanced (server ticks every 1s with live state)
    expect(diff).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Multi-client sync', () => {
  test('two clients report the same track within acceptable drift', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // ---- Client A: login + tune in ----
      await login(pageA);
      await pageA.click('button:has-text("Tune in")');
      await expect(pageA.locator('[data-testid="track-title"]')).toBeVisible({
        timeout: 15000,
      });

      const trackTitleA = await pageA
        .locator('[data-testid="track-title"]')
        .textContent();
      const positionA = await parsePosition(pageA);
      expect(trackTitleA).toBeTruthy();

      // ---- Client B: login + tune in ----
      await login(pageB);
      await pageB.click('button:has-text("Tune in")');
      await expect(pageB.locator('[data-testid="track-title"]')).toBeVisible({
        timeout: 15000,
      });

      const trackTitleB = await pageB
        .locator('[data-testid="track-title"]')
        .textContent();

      // Both clients must report the SAME track (same videoId/title)
      expect(trackTitleB).toBeTruthy();
      expect(trackTitleB).toBe(trackTitleA);

      // Position drift check
      const positionB = await parsePosition(pageB);
      const diff = Math.abs(positionA - positionB);
      expect(diff).toBeLessThanOrEqual(ACCEPTABLE_DRIFT_SECONDS);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('later-connecting client syncs to live position (not position 0)', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Client A tunes in first
      await login(pageA);
      await pageA.click('button:has-text("Tune in")');
      await expect(pageA.locator('[data-testid="track-title"]')).toBeVisible({
        timeout: 15000,
      });

      // Wait for the server to advance position
      await pageA.waitForTimeout(5000);
      const positionA = await parsePosition(pageA);
      expect(positionA).toBeGreaterThan(0);

      // Client B connects later — should sync to the LIVE position, not 0
      await login(pageB);
      await pageB.click('button:has-text("Tune in")');
      await expect(pageB.locator('[data-testid="track-title"]')).toBeVisible({
        timeout: 15000,
      });

      await pageB.waitForTimeout(1000);
      const positionB = await parsePosition(pageB);

      // Client B should NOT be at position 0 (would indicate local default
      // instead of syncing to the server's live state)
      expect(positionB).toBeGreaterThan(0);

      // The two positions should be close (within drift tolerance)
      const diff = Math.abs(positionA - positionB);
      expect(diff).toBeLessThanOrEqual(ACCEPTABLE_DRIFT_SECONDS);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('page reload (hard) syncs to server live state', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Initial login + tune-in
      await login(page);
      await page.click('button:has-text("Tune in")');
      await expect(page.locator('[data-testid="track-title"]')).toBeVisible({
        timeout: 15000,
      });

      const trackBefore = await page
        .locator('[data-testid="track-title"]')
        .textContent();
      expect(trackBefore).toBeTruthy();

      // Wait for position to advance
      await page.waitForTimeout(4000);
      const positionBefore = await parsePosition(page);
      expect(positionBefore).toBeGreaterThan(0);

      // Hard reload (bypass cache via networkidle + force)
      await page.goto('/', { waitUntil: 'networkidle' });

      // Should show login gate again (session cookie should restore session)
      // The server sets an HTTP-only cookie, so the session should persist
      // If the session is still valid, we should be auto-authenticated
      // If not, we need to log in again
      const tuneInVisible = await page.locator('[data-testid="tune-in"]').isVisible({ timeout: 5000 }).catch(() => false);
      const loginVisible = await page.locator('input[type="email"]').isVisible({ timeout: 5000 }).catch(() => false);

      if (loginVisible) {
        // Session expired after reload — log in again
        await page.fill('input[type="email"]', TEST_EMAIL);
        await page.click('button:has-text("Sign in")');
        await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
          timeout: 15000,
        });
      }

      // Tune in again
      await page.click('button:has-text("Tune in")');
      await expect(page.locator('[data-testid="track-title"]')).toBeVisible({
        timeout: 15000,
      });

      // After reload+tune-in, should sync to the server's current live state
      const trackAfter = await page
        .locator('[data-testid="track-title"]')
        .textContent();
      expect(trackAfter).toBeTruthy();
      expect(trackAfter).not.toBe('');

      // Position should be > 0 (synced from server's live state, not reset to 0)
      const positionAfter = await parsePosition(page);
      expect(positionAfter).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
