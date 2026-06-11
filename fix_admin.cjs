const fs = require('fs');
let code = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// 1. Remove Postal Card state
code = code.replace(/\/\/ Postal Card Customizable state[\s\S]*?\/\/ State hooks/, '// State hooks');

// 2. Remove POSTAL CARD STUDIO FUNCTIONS
code = code.replace(/\/\/ -------- POSTAL CARD STUDIO FUNCTIONS --------[\s\S]*?\/\/ ----------------------------------------------/, '');

// 3. Remove Postal Card JSX block
const jsxStart = '\n      {/* COMPACT & GORGEOUS WEDDING POSTAL CARD / QR PRINT DESIGN STUDIO */}';
const jsxEndOffset = '      )}\n';
const startIndex = code.indexOf(jsxStart);
if (startIndex !== -1) {
  const EndSequence = '      )}\n\n    </div>\n  );\n}';
  const endIndex = code.indexOf(EndSequence, startIndex);
  if (endIndex !== -1) {
     code = code.slice(0, startIndex) + '\n' + code.slice(endIndex + 9);
  }
}

fs.writeFileSync('src/components/AdminPanel.tsx', code);
