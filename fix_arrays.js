const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/manager/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace p.output_history.forEach with safe array check
content = content.replace(/p\.output_history\.forEach/g, "(Array.isArray(p.output_history) ? p.output_history : []).forEach");
content = content.replace(/p\.output_history\.filter/g, "(Array.isArray(p.output_history) ? p.output_history : []).filter");

// Also replace p.output_history.length > 0 to be safe
content = content.replace(/p\.output_history && p\.output_history\.length > 0/g, "Array.isArray(p.output_history) && p.output_history.length > 0");

// Also replace Animator split just in case
content = content.replace(/\(p\.Animator \|\| ''\)\.split/g, "(String(p.Animator || '')).split");
content = content.replace(/\(p\.Animator \|\| ''\)\.toLowerCase\(\)/g, "(String(p.Animator || '')).toLowerCase()");
content = content.replace(/\(p\.Lead \|\| ''\)\.toLowerCase\(\)/g, "(String(p.Lead || '')).toLowerCase()");
content = content.replace(/\(p\.Lighting_Artist \|\| ''\)\.toLowerCase\(\)/g, "(String(p.Lighting_Artist || '')).toLowerCase()");

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Fixed potential array/string TypeErrors in page.tsx');
