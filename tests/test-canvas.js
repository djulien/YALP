'use strict';

require('my-plugins/utils/make-global');
make_global(require('my-plugins/colors')); //.RGB); //common colors

//var transport = require('my-plugins/hw/serial')({/*max: 2000,*/ port: '/dev/ttyUSB0', baud: 242500, config: '8N1', fps: 20});
var transport = require('my-plugins/hw/console'){length: 242500 / (1 + 8 + 1) / 20});

//var encoder = require('my-plugins/protocol/RenXT')(transport); //require('my-plugins/protocol/none')(transport);
var encoder = transport; //pass-thru, no encoding

var ndarray = require('ndarray'); //https://github.com/scijs/ndarray

//logical channel map (views):
//allows models to be overlapped, whole-house, etc
var chpool = new ArrayBuffer(32 * 1024); //32K channel pool
var skip = new NullProp(56);
var rect = require('my-plugins/models/2d-matrix')({chvals: new ndarray(chpool,
var arches =
[
    new ArchFan_8seg("AF1", {startch: 300}),
    new ArchFan_8seg("AF2", {startch: 316}),
    new ArchFan("AF3", {startch: 300, numch: 16, stride: 0}),
    new ArchFan("AF4", {startch: 300, numch: 16, stride: 0}),
];

function render(desc)
{
    encoder.clear();
    encoder.out(rect);
    encoder.out(arch[4]);
    encoder.send(desc,
}


container.add(new RectRGB(16, 16)


var rect = ;
rect.all(black);
encoder.flush();

//simple chase-fill quarter-sec
setTimeout(function() { next(0, red); }, 1000);
setTimeout(function() { next(0, black); }, 1250);

function next(node, color)
{
//    if (typeof node !== 'undefined') next.node = node;
    rect.node(node, color);
    encoder.flush();
    if (++node < rect.length) setTimeout(function() { next(node, color); }, 250);
}

function Gradient(from, to, steps)
{

}

//gradient fill:
setTimeout(function() { fill(0, Gradient(red, green, 100)); }, 1000);
function fill(step, grad)
{
    rect.all(grad.color);
    encoder.flush();
    if (++step < grad.length) setTimeout(function() { fill(step, grad); }, 100);
}

//eof
