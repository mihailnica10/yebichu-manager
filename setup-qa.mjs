import { chromium } from "playwright";

const BASE = "http://localhost:3556";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Collect console errors
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  try {
    // ── 1. Open setup page ──
    console.log("\n[1/8] Opening /setup...");
    await page.goto(`${BASE}/setup`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Should show "Setup Wizard" title
    const title = await page.textContent("h1");
    console.log(`  Title: ${title}`);
    if (!title?.includes("Setup Wizard")) throw new Error("Expected Setup Wizard title");

    // ── 2. Create account ──
    console.log("\n[2/8] Creating admin account...");
    const stepLabel = await page.textContent('[class*="StepIndicator"]');
    console.log(`  Current step: ${stepLabel}`);

    // Fill form
    await page.fill('input[type="email"]', "admin@mt5.local");
    await page.fill('input[placeholder="Your name"]', "misu");
    await page.fill('input[type="password"]', "admin123");

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success toast
    await page.waitForTimeout(2000);
    const toast = await page.textContent("body");
    console.log(`  Toast appears: ${toast?.includes("Account created") ? "yes" : "no"}`);

    // ── 3. Wait for step transition ──
    console.log("\n[3/8] Waiting for Docker check step...");
    await page.waitForTimeout(1000);

    // Since Docker + image exist, it should auto-skip step 2 and go to step 3
    const step2Text = await page.textContent("body");
    console.log(`  Docker step: ${step2Text?.includes("Docker") ? "visible" : "auto-skipped"}`);

    // Check if we moved to step 3 (management instance)
    const mgmtButton = page.locator('button:has-text("Create & Start")');
    const mgmtIdle = await mgmtButton.isVisible().catch(() => false);
    console.log(`  Management instance button: ${mgmtIdle ? "visible" : "not visible (maybe already past)"}`);

    // ── 4. Create management instance ──
    console.log("\n[4/8] Creating management instance...");
    if (mgmtIdle) {
      await mgmtButton.click();
    } else {
      // Maybe step 2 is showing (if Docker isn't auto-skipped)
      const nextBtn = page.locator('button:has-text("Next Step")');
      const nextVisible = await nextBtn.isVisible().catch(() => false);
      if (nextVisible) {
        await nextBtn.click();
        await page.waitForTimeout(500);
        const createBtn = page.locator('button:has-text("Create & Start")');
        await createBtn.waitFor({ state: "visible", timeout: 5000 });
        await createBtn.click();
      } else {
        // Check if already at ready step or another step
        console.log("  Could not find Create & Start button - checking current state...");
        const bodyText = await page.textContent("body");
        console.log(`  Body text: ${bodyText?.substring(0, 200)}`);
        throw new Error("Could not find Create & Start button");
      }
    }

    // Wait for creation and port detection
    console.log("  Waiting for container to start and ports to be detected...");
    const maxWait = 60000; // 60s timeout
    const pollInterval = 2000;
    let waited = 0;
    let portDetected = false;

    while (waited < maxWait) {
      await page.waitForTimeout(pollInterval);
      waited += pollInterval;
      const bodyText = await page.textContent("body");
      if (bodyText?.includes("Setup complete") || bodyText?.includes("Management instance is running")) {
        console.log(`  Management instance ready after ${waited / 1000}s`);
        portDetected = true;
        break;
      }
      console.log(`  Waiting... (${waited / 1000}s)`);
    }

    if (!portDetected) throw new Error("Management instance did not become ready within 60s");

    // ── 5. Complete setup ──
    console.log("\n[5/8] Completing setup...");
    const goBtn = page.locator('button:has-text("Go to Dashboard")');
    await goBtn.waitFor({ state: "visible", timeout: 5000 });
    await goBtn.click();

    // Wait for redirect to /instances
    await page.waitForURL("**/instances", { timeout: 15000 });
    console.log("  Redirected to /instances dashboard");

    // ── 6. Verify setup state ──
    console.log("\n[6/8] Verifying setup completion via API...");
    const statusRes = await page.evaluate(() =>
      fetch("/api/setup/status").then((r) => r.json())
    );
    console.log(`  completed: ${statusRes.completed}`);
    console.log(`  hasUsers: ${statusRes.hasUsers}`);
    console.log(`  hasManagementInstance: ${statusRes.hasManagementInstance}`);
    if (!statusRes.completed) throw new Error("Setup not marked as completed in DB");
    if (!statusRes.hasManagementInstance) throw new Error("Management instance not found in DB");

    // ── 7. Check settings page ──
    console.log("\n[7/8] Verifying settings page (VNC)...");
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Check that VNC panel shows or at least detects connection
    const settingsBody = await page.textContent("body");
    const vncConnected = settingsBody?.includes("VNC"); // Might show "Detecting VNC port…" initially
    console.log(`  Settings page loaded: yes`);
    console.log(`  VNC panel visible: ${vncConnected ? "yes" : "checking..."}`);

    // Wait a bit for VNC port detection
    await page.waitForTimeout(5000);
    const bodyAfter = await page.textContent("body");
    if (bodyAfter?.includes("Detecting VNC port")) {
      console.log("  VNC port detection in progress - showing spinner");
    } else if (bodyAfter?.includes("Management Instance")) {
      console.log("  VNC panel showing management instance state");
    } else {
      console.log("  Settings page content available");
    }

    // ── 8. Verify management instance container ──
    console.log("\n[8/8] Verifying container running...");
    const containerRes = await page.evaluate(() =>
      fetch("/api/instances/mt5-mgmt").then((r) => r.json())
    );
    console.log(`  Container running: ${containerRes.containerRunning}`);
    console.log(`  wsPort: ${containerRes.wsPort}`);
    console.log(`  vncPort: ${containerRes.vncPort}`);
    console.log(`  bridgePort: ${containerRes.bridgePort}`);

    if (!containerRes.containerRunning) throw new Error("Management container not running");
    if (!containerRes.wsPort) throw new Error("WebSocket port not detected");
    if (!containerRes.vncPort) throw new Error("VNC port not detected");
    if (!containerRes.bridgePort) throw new Error("Bridge port not detected");

    console.log("\n✅ All checks passed!");
  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    const screenshot = `/tmp/setup-qa-failure.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`  Screenshot saved: ${screenshot}`);
    if (errors.length) {
      console.log("\n  Console errors:");
      errors.forEach((e) => console.log(`    - ${e}`));
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
