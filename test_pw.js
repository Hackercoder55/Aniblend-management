const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQ FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:3000/manager');
  
  // Wait for login or directly into dashboard
  await new Promise(r => setTimeout(r, 5000));
  
  // See if "Animators" tab exists
  try {
    const tabs = await page.$$('button, a, div');
    for (const tab of tabs) {
      const text = await page.evaluate(el => el.textContent, tab);
      if (text && text.trim() === 'Animators') {
        console.log("Clicking Animators tab");
        await tab.click();
        break;
      }
    }
  } catch(e) {
    console.log("Error finding tab", e);
  }
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
