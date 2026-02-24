const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'manager', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update formatSec to use 'min' and 'sec' consistently
content = content.replace(
    /function formatSec\(sec: number\): string \{\s+if \(\!sec \|\| sec <= 0\) return '—'\s+if \(sec < 60\) return \`\$\{sec\}s\`\s+return \`\$\{Math\.floor\(sec \/ 60\)\}m \$\{sec \% 60\}s\`\s+\}/g,
    `function formatSec(sec: number): string {
  if (!sec || sec <= 0) return '—'
  if (sec < 60) return \`\${sec} sec\`
  return \`\${Math.floor(sec / 60)} min \${sec % 60} sec\`
}`
);

// 2. Replace instances in the UI where it does `.replace('m', ' min').replace('s', ' sec')` (since formatSec now handles it)
content = content.replace(/\.replace\('m', ' min'\)\.replace\('s', ' sec'\)/g, '');

// 3. Search for Math.round(parseDurationSec(...) / 60)
// For example:
// Math.round(parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID) / 60)
// Math.round(ch.totalDuration) min
// Math.round(ch.inProgressDuration) min
// Math.round(ch.completedDuration) min
// Math.round(durationThisMonthMins) min
// Math.round(lifetimeDurationMins) min

// Analytics duration replacements
content = content.replace(/\{Math\.round\(([^}]+Duration[^}]+)\)\} min/g, '{formatSec($1)}');
content = content.replace(/\{Math\.round\((durationThisMonthMins)\)\} min/g, '{formatSec($1)}');
content = content.replace(/\{Math\.round\((lifetimeDurationMins)\)\} min/g, '{formatSec($1)}');

// Fix parseDurationMins definition -> we need parseDurationMins to actually return seconds so the values inside it don't get / 60!
// AnalyticsTab defines parseDurationMins
content = content.replace(
    /const parseDurationMins = \(([^)]+)\): number => \{\s+(\s*.*?\s*.*?\s*.*?\s+.*?\s+.*?\s+.*?\s+.*?)return n \/ 60\s+\}/g,
    `const parseDurationMins = ($1): number => {
$2    return n
  }`
);
// It was calculating fraction-minutes, so now it calculates SECONDS.
// Let's rename it to parseDurationSecLocal to avoid confusion safely, OR just leave it as parseDurationMins but it returns seconds. I'll just change the name.
content = content.replace(/parseDurationMins/g, 'parseDurationSecLocal');

// Now, things like:
// {Math.round(parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID) / 60)}
content = content.replace(
    /Math\.round\(parseDurationSec\(([^)]+)\)[^/]*\/ 60\)/g,
    `formatSec(parseDurationSec($1))`
);
content = content.replace(
    /\{formatSec\(parseDurationSec\(([^)]+)\)\)\} min/g,
    `{formatSec(parseDurationSec($1))}`
);

// Any other stray "Math.round(parseDurationSec(...)/60).toString()" ?
content = content.replace(
    /Math\.round\(parseDurationSec\(([^)]+)\) \/ 60\)\.toString\(\)/g,
    `formatSec(parseDurationSec($1))`
);

content = content.replace(
    /const mins = formatSec\(parseDurationSec\(p\.Duration \|\| extractDuration\(p\.Project_ID\) \|\| '0', p\.Project_ID\)\)/g,
    `const mins = formatSec(parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID))`
)

fs.writeFileSync(filePath, content);
console.log('Done!');
