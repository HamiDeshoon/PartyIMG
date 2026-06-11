const fs = require('fs');
let code = fs.readFileSync('src/components/GuestPanel.tsx', 'utf8');
code = code.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('src/components/GuestPanel.tsx', code);
console.log('Fixed escapes in GuestPanel.tsx');
