import { expect, type Page, test } from "@playwright/test";

const TRIGGER_SELECTOR = '[data-slot="trigger"]';
const CONTENT_SELECTOR = '[data-slot="content"]';

async function expectTriggerFixedToBottomRight(page: Page) {
	const trigger = page.locator(TRIGGER_SELECTOR).first();

	await expect(trigger).toBeVisible();
	await expect(trigger).toHaveCSS("position", "fixed");

	const rect = await trigger.boundingBox();
	const viewport = page.viewportSize();

	expect(rect).not.toBeNull();
	expect(viewport).not.toBeNull();

	if (!(rect && viewport)) {
		return;
	}

	expect(
		Math.abs(viewport.width - (rect.x + rect.width) - 16)
	).toBeLessThanOrEqual(2);
	expect(
		Math.abs(viewport.height - (rect.y + rect.height) - 16)
	).toBeLessThanOrEqual(2);
}

async function expectContentWithinViewport(page: Page) {
	const content = page.locator(CONTENT_SELECTOR).first();

	await expect(content).toBeVisible();
	await page.waitForFunction((selector) => {
		const element = document.querySelector(selector);
		if (!element) {
			return false;
		}

		const rect = element.getBoundingClientRect();
		return (
			rect.width > 0 &&
			rect.height > 0 &&
			rect.left >= -1 &&
			rect.top >= -1 &&
			rect.right <= window.innerWidth + 1 &&
			rect.bottom <= window.innerHeight + 1
		);
	}, CONTENT_SELECTOR);
}

async function expectMobileContentFullscreen(page: Page) {
	const content = page.locator(CONTENT_SELECTOR).first();

	await expect(content).toBeVisible();
	await expect(content).toHaveCSS("position", "fixed");
	await page.waitForFunction((selector) => {
		const element = document.querySelector(selector);
		if (!element) {
			return false;
		}

		const rect = element.getBoundingClientRect();
		return (
			Math.abs(rect.left) <= 1 &&
			Math.abs(rect.top) <= 1 &&
			Math.abs(rect.width - window.innerWidth) <= 1 &&
			Math.abs(rect.height - window.innerHeight) <= 1
		);
	}, CONTENT_SELECTOR);
}

test("keeps the default support trigger fixed while the page scrolls", async ({
	page,
}) => {
	await page.goto("/");

	await expectTriggerFixedToBottomRight(page);

	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

	await expectTriggerFixedToBottomRight(page);
});

test("opens the desktop support panel inside the viewport", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto("/");

	await page.locator(TRIGGER_SELECTOR).first().click();

	await expectContentWithinViewport(page);
});

test("opens the mobile support panel fullscreen", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");

	await page.locator(TRIGGER_SELECTOR).first().click();

	await expectMobileContentFullscreen(page);
});

test("renders a custom Support.Page route in the widget", async ({ page }) => {
	await page.goto("/custom-page");

	await page.locator(TRIGGER_SELECTOR).first().click();

	await expect(
		page.getByText("Custom route rendered through Support.Page.")
	).toBeVisible();
});
