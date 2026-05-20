const { chromium } = require('playwright');
require('dotenv').config({ path: '.env.local' });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log('Navigating to manager dashboard...');
  await page.goto('http://localhost:3000/manager');
  
  // Wait for login or dashboard
  await page.waitForTimeout(3000);
  const text = await page.textContent('body');
  
  if (text.includes('Sign In')) {
      console.log('Logging in...');
      await page.fill('input[type="password"]', 'TFA_Hacker');
      await page.click('button:has-text("Login")');
      await page.waitForTimeout(3000);
  }

  console.log('Clicking Animators tab...');
  // Find the button with text 'Animators'
  const buttons = await page.$$('button');
  for (const btn of buttons) {
      const btnText = await btn.textContent();
      if (btnText && btnText.includes('Animators')) {
          await btn.click();
          break;
      }
  }

  await page.waitForTimeout(3000);
  console.log('Done.');
  await browser.close();
})();
