const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'manager', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/\{Math\.round\(ch\.totalDuration\)\} min/g, '{formatSec(ch.totalDuration)}');
content = content.replace(/\{Math\.round\(ch\.inProgressDuration\)\} min/g, '{formatSec(ch.inProgressDuration)}');
content = content.replace(/\{Math\.round\(ch\.completedDuration\)\} min/g, '{formatSec(ch.completedDuration)}');

content = content.replace(/\{durMins\} min/g, '{formatSec(durMins)}'); // Just in case

fs.writeFileSync(filePath, content);
console.log('Fixed channel analytics formatting');
