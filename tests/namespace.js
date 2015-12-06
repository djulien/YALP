
'use strict';

function cls()
{
//NO    this.ns = {};
    this.ns =
    this.ns.x = 4;
    this.ns.f = function(x) { return x + 1; }
}

cls.prototype.ns = function() {}

cls.prototype.ns.f = function(x) { return x + 2; } //overwritten

cls.prototype.ns.f2 = function(x) { return x + 3; }


var a = new cls();
console.log(a.ns.x);
console.log(a.ns.f(10));
console.log(a.ns.f2(10));
var buf = '';
for (var i in a.ns)
    buf += ', ' + i + (a.hasOwnProperty(i)? '!': '*') + ' ' + typeof a.ns[i];
console.log("props:", buf.substr(2));

//eof
