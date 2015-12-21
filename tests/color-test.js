
'use strict';

//var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas; needs cairo as well; see https://www.npmjs.com/package/canvas
var Canvas = require('my-projects/models/my-canvas');
const Color = require('tinycolor2'); //'onecolor').color;
const dim = require('my-projects/models/color-fx').dim;
const hex = require('my-projects/models/color-fx').hex;


var canv = new Canvas(2, 2);
var ctx = canv.getContext('2d');
ctx.fillStyle = '#112233'; ctx.fillRect(0, 0, 2, 2);
ctx.fillStyle = '#445566'; ctx.fillRect(0, 0, 1, 1);
var data = ctx.getImageData(0, 0, 2, 2);
console.log(data);
process.exit(0);

var canv = new Canvas(10, 10);
var ctx = canv.getContext('2d');

ctx.fillStyle = '#112233'; //NOTE: only accepts RGB
console.log("style = ", ctx.fillStyle); //#rrggbb
ctx.fillStyle = 'rgba(10, 20, 30, .5)';
console.log("style = ", ctx.fillStyle); //rgba(10, 20, 30, .5)
ctx.fillStyle = 'rgb(10, 20, 30)';
console.log("style = ", ctx.fillStyle); //#rrggbb

ctx.fillRect(0, 0, 4, 4);
var data = ctx.getImageData(0, 0, 2, 2); //RGBA array
console.log(data);

var c = Color('#FF112233'); //wants #aarrggbb
console.log(c);
c = Color('red');
console.log(c);
c = Color("rgb(10, 20, 30)");
console.log(c);
c = Color("rgba( 10, 20, 30, 128)"); //wants rgba()
console.log(c);

c = dim('#ff55aaff', 128); //wants #rgb or #argb, gives back argb
console.log(hex(c, 8));

ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, 2, 2);
var readback = ctx.getImageData(0, 0, 2, 2).data;
for (var i = 0; i < readback.length; i += 4)
    if ('#' + hex(readback.readUInt32BE(i) >>> 8, 6) != ctx.fillStyle) throw "fill failed '" + i + ": #" + hex(readback.readUInt32BE(i), 8) + " should be #" + ctx.fillStyle;
console.log("%d nodes set to %s", readback.length / 4, ctx.fillStyle);


//eof
