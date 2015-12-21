
'use strict';

//const ROWS = 51, COLS = 42;
const ROWS = 110, COLS = 82;

function T2B(y) { return ROWS - y - 1; }

console.log("<html><body><table border=\"1\" spacing=\"0\" style=\"font-size: 8pt;\">");
for (var y = 0; y < ROWS; ++y)
{
    var buf = [T2B(y) + ': '];
    for (var x = 0; x < COLS; ++x)
        buf.push(/*T2B*/(y) * COLS + x); //NOTE: graphics context is inverted, so don't use T2B here
    console.log("<tr><td>" + buf.join('</td><td>') + "</td></tr>");
}
console.log("</table></body></html>");
console.warn("# %d x %d grid", COLS, ROWS);

//eof
