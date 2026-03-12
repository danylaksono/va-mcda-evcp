import re

with open("src/components/mcda/AHPComparison.tsx", "r") as f:
    content = f.read()

# Replace the conditional render
content = re.sub(
    r'\{\/\* View Content \*\/\}\s*\{viewMode === \'matrix\' \? \(\s*<div className="overflow-x-auto">',
    " {/* View Content: Graph */}\n      <div\n        className=\"flex justify-center items-center py-4 bg-slate-50 rounded-lg border border-slate-200 relative min-h-[300px] overflow-hidden\"\n      >\n        <svg\n          width=\"300\" height=\"300\"\n          className=\"overflow-visible\"\n          onPointerMove={handleGraphPointerMove}\n          onPointerUp={handleGraphPointerUp}\n          onPointerLeave={handleGraphPointerUp}\n          onWheel={handleGraphWheel}\n        >\n          <g transform={`scale(${zoom})`} style={{ transformOrigin: 'center' }}>",
    content,
    flags=re.DOTALL
)

with open("out.tmp", "w") as f:
    f.write(content)
