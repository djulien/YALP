'use strict';

require('colors');


//easier access to first + last elements in array:
if (!Array.prototype.first)
{
    Object.defineProperty(Array.prototype, 'first',
    {
        get() { return this.length? this[0]: null; },
        enumerable: true,
    });
    console.log("extended Array prototype with first".blue);
}

if (!Array.prototype.last)
{
    Object.defineProperty(Array.prototype, 'last',
    {
        get() { return this.length? this[this.length - 1]: null; },
        enumerable: true,
    });
    console.log("extended Array prototype with last".blue);
}


//force numeric sort:
if (!Array.prototype.numsort)
{
    Array.prototype.numsort = function numsort(lhs, rhs) { return 1 * lhs - 1 * rhs; };
    console.log("extended Array prototype with numsort".blue);
}

//eof
