const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'manager', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix formatSec bug where decimals show up, and 50s isn't "50 sec"
// The old formatSec:
// function formatSec(sec: number): string {
//   if (!sec || sec <= 0) return '—'
//   if (sec < 60) return `${sec} sec`
//   return `${Math.floor(sec / 60)} min ${sec % 60} sec`
// }
content = content.replace(
    /function formatSec\(sec: number\): string \{\s+if \(\!sec \|\| sec <= 0\) return '—'\s+if \(sec < 60\) return \`\$\{sec\} sec\`\s+return \`\$\{Math\.floor\(sec \/ 60\)\} min \$\{sec \% 60\} sec\`\s+\}/g,
    `function formatSec(sec: number): string {
  if (!sec || sec <= 0) return '—'
  sec = Math.round(sec)
  if (sec < 60) return \`\${sec} sec\`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (s === 0) return \`\${m} min\`
  return \`\${m} min \${s} sec\`
}`
);

// 2. BudgetTrackerTab (Progress Tracker) sumMinutes -> sumSeconds
content = content.replace(
    /const sumMinutes = \(list: Project\[\]\) => \{\s+return list\.reduce\(\(total, p\) => \{\s+\/\/ Assuming format "XXX sec" or "XXX mins" -- reusing parseDurationSec handles extraction and gives seconds\.\s+\/\/ The user requested duration in mins, so we convert from seconds\.\s+\/\/ \`extractDuration\` natively extracts from project ID or existing string as seconds\.\s+const seconds = parseDurationSec\(p\.Duration, p\.Project_ID\)\s+return total \+ Math\.floor\(seconds \/ 60\)\s+\}, 0\)\s+\}/g,
    `const sumSeconds = (list: Project[]) => {
    return list.reduce((total, p) => total + parseDurationSec(p.Duration, p.Project_ID), 0)
  }`
);

// Replacing variables in BudgetTrackerTab
content = content.replace(/const stageMinutes = sumMinutes\(stageProjects\)/g, 'const stageSecs = sumSeconds(stageProjects)');
content = content.replace(/\{stageMinutes\} min/g, '{formatSec(stageSecs)}');

// BudgetTrackerTab ProjectCard
content = content.replace(/const mins = Math\.floor\(parseDurationSec\(project\.Duration, project\.Project_ID\) \/ 60\)/g, 'const durStr = formatSec(parseDurationSec(project.Duration, project.Project_ID))');
content = content.replace(/⏱ \{mins\} min/g, '⏱ {durStr}');

// BudgetTrackerTab Modal Report Table
content = content.replace(/\{Math\.floor\(parseDurationSec\(p\.Duration, p\.Project_ID\) \/ 60\)\} min/g, '{formatSec(parseDurationSec(p.Duration, p.Project_ID))}');

// Is there an Animator Card fixing needed?
// Search for "min" next to parseDurationSec
content = content.replace(/\{Math\.floor\(parseDurationSec\(p\.Duration, p\.Project_ID\) \/ 60\)\} min/g, '{formatSec(parseDurationSec(p.Duration, p.Project_ID))}');

// Also Animator individual tab could be AnimatorsTab -> look for `{animator['Total video'] || 0} Projects` or something 
// There's a parseDurationSec in `AnimatorsTab`
content = content.replace(/\{formatSec\(durationSec\).replace\('m', ' min'\).replace\('s', ' sec'\)\}/g, '{formatSec(durationSec)}');
content = content.replace(/\{durationSec > 0 \? formatSec\(durationSec\)\.replace\('m', ' min'\)\.replace\('s', ' sec'\) : '0 min 0 sec'\}/g, '{durationSec > 0 ? formatSec(durationSec) : "—"}');

fs.writeFileSync(filePath, content);
console.log('Fixed exact time formatting');
