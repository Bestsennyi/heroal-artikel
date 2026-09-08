const { test, expect } = require("@playwright/test");

const PIN = "1111";
const ARTICLE_NR = "1371";
const ARTICLE_NAME = "Blende FMR HC oben";

async function jpegBufferFromPage(page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#003a79";
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(8, 8, 16, 16);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob"))),
        "image/jpeg",
        0.9,
      );
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function waitForServiceWorkerControl(page) {
  await page.waitForFunction(
    () =>
      !!(
        navigator.serviceWorker &&
        navigator.serviceWorker.controller &&
        navigator.serviceWorker.controller.state !== "redundant"
      ),
    { timeout: 25_000 },
  );
}

async function openApp(page) {
  await page.goto("./index.html", { waitUntil: "domcontentloaded" });
  await waitForServiceWorkerControl(page);
  await page.waitForSelector("#input-login-nr, html.authed");
}

async function loginWithPin(page, pin) {
  const overlay = page.locator("#login-overlay");
  if (await overlay.isVisible()) {
    await page.locator("#input-login-nr").click();
    await page.evaluate((value) => {
      const input = document.getElementById("input-login-nr");
      if (!input) return;
      input.value = value;
    }, pin);
    await page.locator("#btn-login-submit").click();
  }
  await expect(page.locator("html")).toHaveClass(/authed/);
  await expect(page.locator("#login-overlay")).toBeHidden();
  await expect(page.locator("#find-prof")).toBeVisible();
}

async function readPhotoQueue(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("heroal_warehouse_db");
        req.onerror = () => reject(req.error || new Error("idb open failed"));
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("photoQueue")) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction("photoQueue", "readonly");
          const getAll = tx.objectStore("photoQueue").getAll();
          getAll.onerror = () => {
            db.close();
            reject(getAll.error);
          };
          getAll.onsuccess = () => {
            const rows = getAll.result || [];
            db.close();
            resolve(
              rows.map((row) => ({
                id: row.id,
                status: row.status,
                recordId: String(row.recordId || ""),
                target: row.target,
              })),
            );
          };
        };
      }),
  );
}

test.describe.configure({ mode: "serial" });

test.describe("heroal warehouse PWA", () => {
  test("PIN login opens the catalog and shows the active user", async ({
    page,
  }) => {
    await openApp(page);
    await loginWithPin(page, PIN);

    const header = page.locator("#hdr-user");
    await expect(header).toBeVisible();
    const headerText = (
      (await page.locator("#hdr-user-name").textContent()) +
      " " +
      (await page.locator("#hdr-user-role").textContent())
    ).trim();

    expect(
      /Maksym Beztsinnyi|Admin heroal|Administrator|Администратор|Admin/i.test(
        headerText,
      ),
    ).toBeTruthy();
    await expect(page.locator("#view-suche")).toBeVisible();
  });

  test("search works after a full offline reload from the service worker", async ({
    page,
    context,
  }) => {
    await openApp(page);
    await loginWithPin(page, PIN);
    await waitForServiceWorkerControl(page);

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForServiceWorkerControl(page);

    const controlled = await page.evaluate(
      () => !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    );
    expect(controlled).toBeTruthy();

    await expect(page.locator("html")).toHaveClass(/authed/);
    await expect(page.locator("#find-prof")).toBeVisible();

    await page.locator("#find-prof").fill(ARTICLE_NR);
    await expect(page.locator("#prof-list")).toContainText(ARTICLE_NAME, {
      timeout: 10_000,
    });
  });

  test("offline photo attach writes a pending photoQueue row", async ({
    page,
    context,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await openApp(page);
    await loginWithPin(page, PIN);
    await waitForServiceWorkerControl(page);
    await context.setOffline(true);

    await page.locator("#btnPhotoCapture").click();
    await expect(page.locator("#photo-dialog")).toHaveClass(/active/);

    await page.locator("#photo-id").fill(ARTICLE_NR);
    await expect(page.locator("#photo-match")).toContainText(ARTICLE_NAME);

    await page.locator("#photo-input-gallery").setInputFiles({
      name: "artikel-1371.jpg",
      mimeType: "image/jpeg",
      buffer: await jpegBufferFromPage(page),
    });
    await expect(page.locator("#photo-preview-wrap")).toHaveClass(/is-on/);
    await expect(page.locator("#photo-save")).toBeEnabled();
    await page.locator("#photo-save").click();

    await expect
      .poll(async () => readPhotoQueue(page), { timeout: 10_000 })
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "pending",
            recordId: ARTICLE_NR,
            target: "artikel",
          }),
        ]),
      );

    const queue = await readPhotoQueue(page);
    expect(queue).toHaveLength(1);
    expect(pageErrors).toEqual([]);
  });
});
