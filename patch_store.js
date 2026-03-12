const fs = require('fs');
let code = fs.readFileSync('src/store/mcda-store.ts', 'utf8');

const updateComparisonBlock = `  updateComparison: (criterion1, criterion2, ratio) => {
    set({
      comparisons: get().comparisons.map((c) => {
        if (c.criterion1 === criterion1 && c.criterion2 === criterion2) {
          return { ...c, ratio }
        }
        if (c.criterion1 === criterion2 && c.criterion2 === criterion1) {
          return { ...c, ratio: 1 / ratio }
        }
        return c
      }),
    })
  },`;

const newUpdateComparisonBlock = `  updateComparison: (criterion1, criterion2, ratio) => {
    const state = get()
    const exists = state.comparisons.find(
      (c) =>
        (c.criterion1 === criterion1 && c.criterion2 === criterion2) ||
        (c.criterion1 === criterion2 && c.criterion2 === criterion1)
    )

    if (exists) {
      set({
        comparisons: state.comparisons.map((c) => {
          if (c.criterion1 === criterion1 && c.criterion2 === criterion2) return { ...c, ratio }
          if (c.criterion1 === criterion2 && c.criterion2 === criterion1) return { ...c, ratio: 1 / ratio }
          return c
        }),
      })
    } else {
      set({
        comparisons: [...state.comparisons, { criterion1, criterion2, ratio }],
      })
    }
  },`;

code = code.replace(updateComparisonBlock, newUpdateComparisonBlock);

fs.writeFileSync('src/store/mcda-store.ts', code);
console.log('Store patched!');
