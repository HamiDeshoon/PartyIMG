const fs = require('fs');
let code = fs.readFileSync('db.ts', 'utf8');
code = code.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('db.ts', code);
console.log('Fixed escapes in db.ts');
