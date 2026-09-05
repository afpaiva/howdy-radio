import { test, expect } from '@playwright/test';

test.describe('Queue and State Synchronization', () => {
  test('queue is present from first state event (no flicker)', async ({ page }) => {
    await page.goto('/');

    // Wait for the tune-in gate to appear (socket connected, awaiting user gesture)
    await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
      timeout: 15000,
    });

    // Before clicking tune-in, there should be no queue rendered
    // (we're on the tune-in gate, not the skin)
    await expect(page.locator('[data-testid="queue"]')).not.toBeVisible();

    // Click "Tune in"
    await page.click('button:has-text("Tune in")');

    // Now wait for the skin to render (tune-in gate should disappear)
    await expect(page.locator('[data-testid="tune-in"]')).not.toBeVisible({
      timeout: 15000,
    });

    // The "Up Next" queue should be visible (Winamp uses data-testid="queue")
    const queueList = page.locator('[data-testid="queue"]');
    await expect(queueList).toBeVisible({ timeout: 15000 });

    // Wait a bit and verify the queue still has items (no flicker/disappearance)
    await page.waitForTimeout(2000);
    const itemCount = await queueList.locator('li[data-testid="queue-item"]').count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('page reload syncs to live server state (not a local default)', async ({ page }) => {
    // First visit — connect and tune in
    await page.goto('/');
    await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
      timeout: 15000,
    });
    await page.click('button:has-text("Tune in")');

    // Wait for skin to render
    await expect(page.locator('[data-testid="queue"]')).toBeVisible({
      timeout: 15000,
    });

    // Capture the current track title
    const trackTitleBefore = await page
      .locator('[data-testid="track-title"]')
      .textContent();
    expect(trackTitleBefore).toBeTruthy();
    expect(trackTitleBefore).not.toBe('');

    // Wait a couple seconds for server state to advance
    await page.waitForTimeout(3000);

    // Hard reload (disable cache) — simulates F5/Ctrl+R with cache disabled
    await page.goto('/', { waitUntil: 'networkidle' });

    // Should reconnect and show tune-in gate
    await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
      timeout: 15000,
    });

    // Tune in again
    await page.click('button:has-text("Tune in")');

    // Wait for skin to render with server state
    await expect(page.locator('[data-testid="queue"]')).toBeVisible({
      timeout: 15000,
    });

    // The current track should be non-null (synced from server, not a local default)
    const trackTitleAfter = await page
      .locator('[data-testid="track-title"]')
      .textContent();
    expect(trackTitleAfter).toBeTruthy();
    expect(trackTitleAfter).not.toBe('');

    // Verify we're synced to the server's live state — position should be > 0
    // (server has been playing, so position should have advanced)
    const positionText = await page
      .locator('[data-testid="position"]')
      .textContent();
    expect(positionText).toBeTruthy();
    // Position format is "M:SS / M:SS" — parse the first number
    const positionMatch = positionText!.match(/(\d+):(\d+)/);
    expect(positionMatch).not.toBeNull();
    const positionSeconds =
      parseInt(positionMatch![1], 10) * 60 + parseInt(positionMatch![2], 10);
    // Server should have advanced position by now (grace period resume or live playback)
    expect(positionSeconds).toBeGreaterThan(0);
  });

  test('tune-in emits join-broadcast event (autoplay policy) and receives state', async ({ page }) => {
    // Verify that after "Tune in", the skin renders with state
    // (currentTrack is non-null, queue has items). This confirms the
    // "join-broadcast" event was sent and the server responded with state
    // via broadcastState().
    await page.goto('/');
    await expect(page.locator('[data-testid="tune-in"]')).toBeVisible({
      timeout: 15000,
    });
    await page.click('button:has-text("Tune in")');

    // The skin should render within 15 seconds (server responds to join-broadcast)
    await expect(page.locator('[data-testid="track-title"]')).toBeVisible({
      timeout: 15000,
    });

    // Queue should have at least 1 item
    const queueItems = page.locator('[data-testid="queue-item"]');
    const itemCount = await queueItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(1);

    // Track title should be non-empty
    const trackTitle = await page.locator('[data-testid="track-title"]').textContent();
    expect(trackTitle).toBeTruthy();
    expect(trackTitle).not.toBe('');

    // Connection status should show "connected"
    const connLabel = await page.locator('[data-testid="connection-label"]').textContent();
    expect(connLabel).toContain('connected');
  });
});
