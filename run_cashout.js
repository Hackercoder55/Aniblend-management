const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("Navigating to dashboard...");
    await page.goto('http://localhost:3000/manager', { waitUntil: 'networkidle' });
    
    // Wait for the main tabs to be visible
    console.log("Waiting for tabs...");
    await page.waitForSelector('button:has-text("Profit Tracker")', { timeout: 15000 });
    
    console.log("Clicking Profit Tracker tab...");
    await page.click('button:has-text("Profit Tracker")');
    
    // Wait for the Cash out button to appear
    console.log("Waiting for Cash out button...");
    await page.waitForSelector('button:has-text("Cash out")', { timeout: 15000 });
    
    console.log("Clicking Cash out button...");
    await page.click('button:has-text("Cash out")');
    
    // Wait for the modal and PIN input
    console.log("Waiting for PIN input...");
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    
    console.log("Typing PIN...");
    await page.fill('input[type="password"]', '1234');
    
    console.log("Clicking Confirm Cashout...");
    await page.click('button:has-text("Confirm Cashout")');
    
    // Wait a bit for the requests to finish and toast to appear
    console.log("Waiting for success toast...");
    await page.waitForTimeout(5000);
    
    console.log("Cashout process completed successfully.");
  } catch (err) {
    console.error("Error during cashout:", err);
  } finally {
    await browser.close();
  }
})();
