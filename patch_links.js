const fs = require('fs');
let code = fs.readFileSync('src/components/mcda/AHPComparison.tsx', 'utf8');

// Change map target
code = code.replace(
  '{comparisons.map((comp, idx) => {',
  '{allPairs.map((pair, idx) => {\n                const comp = comparisons.find(c => (c.criterion1 === pair.c1 && c.criterion2 === pair.c2) || (c.criterion1 === pair.c2 && c.criterion2 === pair.c1)) || { criterion1: pair.c1, criterion2: pair.c2, ratio: 1 }'
);

fs.writeFileSync('src/components/mcda/AHPComparison.tsx', code);
console.log('Done');
