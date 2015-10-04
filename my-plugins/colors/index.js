//common RGB colors:
'use strict';

//define only getters so they are read-only:
module.exports =
{
    RGB: //RGB is more efficient for hardware I/O
    {
        get black() { return {/*r: 0, g: 0, b: 0,*/ a: 255}; },
        get red() { return {r: 255, /*g: 0, b: 0,*/ a: 255}; },
        get green() { return {/*r: 0,*/ g: 255, /*b: 0,*/ a: 255}; },
        get blue() { return {/*r: 0, g: 0,*/ b: 255, a: 255}; },
        get yellow() { return {r: 255, g: 255, /*b: 0,*/ a: 255}; },
        get magenta() { return {r: 255, /*g: 0,*/ b: 255, a: 255}; },
        get cyan() { return {/*r: 0,*/ g: 255, b: 255, a: 255}; },
        get white() { return {r: 255, g: 255, b: 255, a: 255}; },
        get transparent() { return {/*r: 0, g: 0, b: 0,*/ a: 0}; },
    },
    HSV: //HSV is more efficient for computation/blending
    {
        get black() { return {h: 0, s: 0.0, v: 0.0, a: 255}; },
        get red() { return {h: 0, s: 100.0, v: 100.0, a: 255}; },
        get green() { return {h: 120, s: 100.0, v: 100.0, a: 255}; },
        get blue() { return {h: 240, s: 100.0, v: 100.0, a: 255}; },
        get yellow() { return {h: 60, s: 100.0, v: 100.0, a: 255}; },
        get magenta() { return {h: 300, s: 100.0, v: 100.0, a: 255}; },
        get cyan() { return {h: 180, s: 100.0, v: 100.0, a: 255}; },
        get white() { return {h: 0, s: 0.0, v: 100.0, a: 255}; },
        get transparent() { return {/*h: 0, s: 0.0, v: 0.0,*/ a: 0}; },
    },
};

//eof
