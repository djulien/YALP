
'use strict';

require('colors');
const path = require('path');
const inherits = require('inherits');
const stack = require('my-plugins/utils/caller').stack;
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
const YalpRef = require('my-plugins/utils/YalpRef').YalpRef;
const Revivable = require('my-plugins/my-extensions/json-revival').Revivable;


var data =
{
    num: 13, ary: ['a', 'b', 'c'], hash: {d: 1, e: 2, f: 3}, str: "hello", //these should all come + go as-is
    buf: new Buffer([10, 11, 12, 13]), //this will become an array unless bufferJSON is used; for root cause see: https://github.com/nodejs/node-v0.x-archive/issues/5110
    func: function(x) { console.log("x = " + x); }, //functions are not valid JSON so this will be dropped
    fromJSON: function(key, val) { console.log("revive key, val:", key, val); return val; }, //this one should be preserved
};
console.log("test data:".blue, data);
console.log("stringify:".red, JSON.stringify(data)); //buf converted to array
//console.log("stringify: %j".red, JSON.stringify(data).replace(/"/g, "'"));
console.log("round trip as-is:".red, JSON.parse(JSON.stringify(data)));
console.log("round trip with buf reviver:".green, JSON.parse(JSON.stringify(data), bufferJSON.reviver));
console.log("buf only:".red, data.buf.toJSON()); //this adds spaces for better readability, but buf still becomes array
console.log("buf only as-is:".red, JSON.stringify(data.buf)); //serialized as array; NOTE: this is easier for debugging than base64 format
console.log("buf only base64:".yellow, JSON.stringify(data.buf, bufferJSON.replacer)); //buf serialized as base64
//process.exit(0);


function Aclass(val)
{
    this.val = val;
//    Revivable.call(this); //base class
}
//inherits(Aclass, Revivable); //allows auto-revival after serialize/deserialize
module.exports.Aclass = Aclass;

Aclass.prototype.func = function(val)
{
    return val + this.val;
}

Aclass.prototype.fromJSON = function(props)
{
    var retval = new Aclass(props.val);
//    console.log("fromJSON".cyan, props, retval);
    return retval;
}

console.log("------------");
var test = new Aclass(5), test_copy;
Revivable(test);
console.log("object:".blue, test);
console.log("stringify:".blue, JSON.stringify(test));
console.log("round trip:".blue, test_copy = JSON.parse(JSON.stringify(test)));
console.log("live test: ".red, test_copy.func(7));
//console.log("round trip live-2:".cyan, test_copy = JSON.parse(JSON.stringify(test), function(key, val) { return val; }));
//console.log("live test: ".green, test_copy.func(7));
process.exit(0);


console.log("============");
var wrapped = new YalpRef(data);
console.log("data:".blue, wrapped);
console.log("stringify:".blue, JSON.stringify(wrapped));
console.log("round trip:", JSON.parse(JSON.stringify(wrapped), YalpRef.reviver));
process.exit(0);
//console.log("round trip with reviver:", JSON.parse(JSON.stringify(wrapped), bufferJSON.reviver));
console.log("deref:", YalpRef.all[wrapped.key]);
//console.log("store:\n", YalpRef.all);


/*
// https://github.com/nodejs/node-v0.x-archive/issues/5110
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
function replacer(key, value)
{
  if (typeof value === "string") {
    return undefined;
  }
  return value;
}

var foo = {foundation: "Mozilla", model: "box", week: 45, transport: "car", month: 7};
var jsonString = JSON.stringify(foo, replacer);
*/


//eof
