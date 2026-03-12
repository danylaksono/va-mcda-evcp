const fs = require('fs');
let code = fs.readFileSync('src/components/mcda/AHPComparison.tsx', 'utf8');

// The marker
const startMarker = "{/* View Content */}";
const slideMarker = "{/* Slider for selected pair (Only shown in Matrix view) */}";

// Split the file into three parts: up to viewContent, to slider, to end
const part1 = code.slice(0, code.indexOf(startMarker));
const middle = code.slice(code.indexOf(startMarker), code.indexOf(slideMarker));
const end = code.slice(code.indexOf(slideMarker));

// Now extract matrixTable and graphContainer from the middle part
// We know it looks like: {viewMode === 'matrix' ? ( <div class="overflow-x-auto"> ...table... </div> ) : ( <div class="flex..."> ...svg... </div> )}
const matrixStart = middle.indexOf('<div className="overflow-x-auto">');
const matrixEndStr = `          </table>\n        </div>`;
const matrixEnd = middle.indexOf(matrixEndStr) + matrixEndStr.length;

let matrixTable = middle.slice(matrixStart, matrixEnd);

const graphStart = middle.indexOf('<div \n          className="flex justify-center');
const graphEndStr = `Select another node to compare\n              </div>\n            )}\n            {!pendingNode && comparisons.length > 0 && (\n               <div className="text-[10px] text-slate-400 bg-white/80 px-2 py-1 rounded">\n                 Drag the blue puck to adjust weight\n               </div>\n            )}\n          </div>\n        </div>`;
const graphEnd = middle.indexOf(graphEndStr) + graphEndStr.length;

let graphContainer = middle.slice(graphStart, graphEnd);

// Modify Graph Container to support zoom
// wrap svg contents in <g transform={`scale(${zoom})`} style={{ transformOrigin: 'center' }}>
graphContainer = graphContainer.replace(
  '<svg \n            width="300" height="300" \n            className="overflow-visible"\n            onPointerMove={handleGraphPointerMove}\n            onPointerUp={handleGraphPointerUp}\n            onPointerLeave={handleGraphPointerUp}\n          >',
  `<svg \n            width="300" height="300" \n            className="overflow-visible"\n            onPointerMove={handleGraphPointerMove}\n            onPointerUp={handleGraphPointerUp}\n            onPointerLeave={handleGraphPointerUp}\n            onWheel={handleGraphWheel}\n          >\n            <g transform={\`scale(\${zoom})\`} style={{ transformOrigin: 'center' }}>`
);

graphContainer = graphContainer.replace(
  '</g>\n          </svg>',
  '</g>\n            </g>\n          </svg>'
);

// Inject alternatives (particles) into graphContainer right before </g>\n          </svg>
const particleCode = `
              <g id="particles">
                {particlePositions.map((alt, i) => (
                  <g key={i} transform={\`translate(\${alt.x}, \${alt.y})\`} className="transition-transform duration-500 ease-out pointer-events-none">
                    <circle r={4} fill={alt.color} stroke="#fff" strokeWidth={1.5} />
                    <text dy="-8" textAnchor="middle" className="text-[8px] font-bold fill-slate-600 shadow-sm">
                      {alt.name}
                    </text>
                  </g>
                ))}
              </g>
`;

graphContainer = graphContainer.replace('</g>\n            </g>\n          </svg>', particleCode + '</g>\n            </g>\n          </svg>');

let sliderContainer = end.replace('{/* Slider for selected pair (Only shown in Matrix view) */}\n      {viewMode === \'matrix\' && selectedPair && (', '{/* Slider for selected pair */}\n      {selectedPair && (');

const newMiddle = `
      {/* Graph View */}
${graphContainer}

      {/* Matrix View */}
${matrixTable}
`;

fs.writeFileSync('src/components/mcda/AHPComparison.tsx', part1 + newMiddle + '\\n      ' + sliderContainer);
console.log('PATCHED!');
