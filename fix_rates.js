const fs = require('fs');
let content = fs.readFileSync('app/manager/page.tsx', 'utf8');

// 1. line 294
content = content.replace(
  /const rate = p\.Lighting_Artist \? 3000 : 5000\s+amount \+= \(sec \/ 60\) \* rate/,
  `const isA = (animator.Employee_ID || '').toUpperCase().includes('A')\n          const rate = isA ? 3000 : (p.Lighting_Artist ? 3000 : 5000)\n          amount += (sec / 60) * rate`
);

// 2. line 3074
content = content.replace(
  /const rate = p\.Lighting_Artist \? 3000 : 5000;\s+const earn = rawSec \* \(rate \/ 60\);/,
  `const isA = (animator.Employee_ID || '').toUpperCase().includes('A');\n      const rate = isA ? 3000 : (p.Lighting_Artist ? 3000 : 5000);\n      const earn = rawSec * (rate / 60);`
);

// 3. line 7555
content = content.replace(
  /const rate = p\.Lighting_Artist \? 3000 : 5000\s+calculatedGross \+= projSec \* \(rate \/ 60\)/,
  `const isA = (eid || '').toUpperCase().includes('A')\n          const rate = isA ? 3000 : (p.Lighting_Artist ? 3000 : 5000)\n          calculatedGross += projSec * (rate / 60)`
);

// 4. line 7561
content = content.replace(
  /let baseGross = calculatedGross > 0 \? calculatedGross : currentMins \* 5000;/,
  `const fallbackRate = (eid || '').toUpperCase().includes('A') ? 3000 : 5000;\n      let baseGross = calculatedGross > 0 ? calculatedGross : currentMins * fallbackRate;`
);

// 5 & 6. line 8761 and 8852
content = content.replace(
  /const rate = p\.Lighting_Artist \? 3000 : 5000;\s+projEarn \+= projSec \* \(rate \/ 60\);/g,
  `const isA = (eid || '').toUpperCase().includes('A');\n                     const rate = isA ? 3000 : (p.Lighting_Artist ? 3000 : 5000);\n                     projEarn += projSec * (rate / 60);`
);

// 7, 8, 9. lines 8917, 8932, 8998
content = content.replace(
  /const rate = isLighting \? 2000 : \(p\.Lighting_Artist \? 3000 : 5000\);/g,
  `const isA = (user.employee_id || '').toUpperCase().includes('A');\n                    const rate = isLighting ? 2000 : (isA ? 3000 : (p.Lighting_Artist ? 3000 : 5000));`
);

fs.writeFileSync('app/manager/page.tsx', content, 'utf8');
console.log("Replaced successfully!");
