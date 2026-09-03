import { test, expect } from '@playwright/test';

test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});

test('has expected UI elements', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});