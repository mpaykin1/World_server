const { test, expect } = require("@playwright/test");

const baseURL = process.env.ONBOARDING_BASE_URL || "http://127.0.0.1:3000";

async function completeThree(page) {
  const overlay = page.locator(".iw-po-overlay");
  await expect(overlay).toBeVisible();
  for (let i=0;i<2;i++) {
    await overlay.locator(".iw-po-input").fill(i===0 ? "Ночной город в тумане" : "Одинокий персонаж");
    await overlay.getByRole("button",{name:"Дальше"}).click();
  }
  await overlay.locator(".iw-po-input").fill("Найти свет");
  await overlay.getByRole("button",{name:"Показать мир"}).click();
  await expect(overlay.getByText(/Первый слепок готов/i)).toBeVisible();
  await expect(overlay.getByRole("button",{name:"Войти сейчас"})).toBeVisible();
}

test("create: first visual reward after three answers", async ({ page }) => {
  await page.goto(baseURL);
  const create = page.getByRole("button",{name:/созда/i}).or(page.getByRole("link",{name:/созда/i})).first();
  await expect(create).toBeVisible();
  await create.click();
  await completeThree(page);
});

test("skip works and does not block snapshot", async ({ page }) => {
  await page.goto(baseURL);
  await page.getByRole("button",{name:/созда/i}).or(page.getByRole("link",{name:/созда/i})).first().click();
  for (let i=0;i<3;i++) await page.getByRole("button",{name:"Пропустить"}).click();
  await expect(page.getByText(/Первый слепок готов/i)).toBeVisible();
});

test("mobile touch flow", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(baseURL);
  await page.getByRole("button",{name:/созда/i}).or(page.getByRole("link",{name:/созда/i})).first().click();
  const buttons=page.locator(".iw-po-overlay button");
  const count=await buttons.count();
  for(let i=0;i<count;i++){
    const box=await buttons.nth(i).boundingBox();
    if(box) expect(Math.min(box.width,box.height)).toBeGreaterThanOrEqual(44);
  }
  await completeThree(page);
});

test("deep questionnaire is not required before reward", async ({ page }) => {
  await page.goto(baseURL);
  await page.getByRole("button",{name:/созда/i}).or(page.getByRole("link",{name:/созда/i})).first().click();
  await completeThree(page);
  await expect(page.locator(".iw-po-overlay")).toContainText("27%");
});
