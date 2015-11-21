
'use strict';

//TODO var empty = require('my-projects/playlists/empty');
var Canvas = require('my-projects/models/growable-canvas');

var canvas = new Canvas();

var mod1 = new Rect2D({x: 0, y: 0, w: 3, h: 10}).enlarge(canvas);
var mod2 = new Rect2D({y: 0}).enlarge(canvas);
var mod3 = new Rect2D({w: 4, y: 0}).enlarge(canvas);
var mod4 = new Rect2D({x: 10}).enlarge(canvas);

console.log("canvas", canvas);
console.log("model4", mod4);

mod4.fill(red);
mod3.fill(

canvas.add
var ctx = canvas.getContext('2d');

//fs.readFile(__dirname + '/images/squid.png', function(err, squid)
//{
//  if (err) throw err;
//  img = new Image;
//  img.src = squid;
//  ctx.drawImage(img, 0, 0, img.width / 4, img.height / 4);
//});

/*
ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
ctx.fillRect(0, 0, 200, 200);

ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
ctx.beginPath();
ctx.lineTo(50, 102);
ctx.lineTo(50 + te.width, 102);
ctx.stroke();
*/

//ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
//ctx.fillRect(0, 0, 200, 200);
//    ctx.strokeStyle = "rgba(0, 0, 200, 0.5)";
//    ctx.moveTo(0, 0);
//    ctx.lineTo(100, 0);
//    ctx.stroke();
    ctx.strokeStyle = "rgb(200, 100, 50)";
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 100);
    ctx.stroke();

//var myImageData = ctx.createImageData(10, 10); //w, h
var myImageData = ctx.getImageData(0, 0, 10, 10); //left, top, width, height);
var buf = myImageData.data; //Uint8ClampedArray of RGBA values
console.log("w %d, h %d, len %d:", myImageData.width, myImageData.height, buf.length, buf);

ctx.putImageData(myImageData, x, y); //paint image data back into context

//no worky var buf = canvas.toBuffer();
//console.log(buf);


//example from https://www.npmjs.com/package/canvas
//var fs = require('fs')
//  , out = fs.createWriteStream(__dirname + '/text.png')
//  , stream = canvas.pngStream();
//stream.on('data', function(chunk) { out.write(chunk); });
//stream.on('end', function() { console.log('saved png'); });

//eof
/*
    console.clear();
    var canvas = new GrowableCanvas('tutorial'); //document.getElementById('tutorial');
//        if (canvas.getContext){
//    var ctx = canvas.getContext('2d');


// var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas
//var Image = canvas.Image;

//for now, use a 2D canvas
//TODO: use a 3D canvas + fx

function makenew(type, args)
{
    return new (type.bind.apply(type, [null].concat(Array.from(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
}

function isdef(thing)
{
    return typeof thing !== 'undefined';
}

function GrowableCanvas(opts)
{
    if (!(this instanceof GrowableCanvas)) return makenew(GrowableCanvas, arguments);
    opts = (typeof opts === 'string')? {id: opts}: opts || {};
    if (opts.id) this.canvas = document.getElementById(opts.id);
    this.width = opts.w || opts.width || (this.canvas || {}).width || 0;
    this.height = opts.h || opts.height || (this.canvas || {}).height || 0;
    var m_canvas, m_ctx;
    Object.defineProperties(this,
    {
        canvas: { get: function() { if (!m_canvas) m_canvas = new Canvas(this.width || 1, this.height || 1); return m_canvas; }},
        ctx: { get: function() { if (!m_ctx) m_ctx = this.canvas.getContext('2d'); return m_ctx; }},
    });
    this.imgdata = function(x, y, w, h, data)
    {
        if (arguments.length == 2) { data = y; y = undefined; }
        if (typeof x === 'object') { h = x.h || x.height; w = x.w || x.width; y = x.y || x.bottom; x = x.x || x.left; }
        if (typeof data === 'undefined') return m_ctx? this.ctx.getImageData(x || this.x, y , w, h).data: null;
        this.ctx.putImage(data, x, y, w, h);
        return this; //fluent
    };
}

GrowableCanvas.prototype.add = function(x, y, w, h)
{
    if (arguments.length == 1) { h = x.h || x.height || 1; w = x.w || x.width || 1; y = x.y || x.bottom || 0; x = x.x || x.left || 0; }
    var savew = this.width, saveh = this.height;
    this.width = Math.max(this.width, x + w);
    this.height = Math.max(this.height, y + h);
    if (this.ctx)
    {
        if ((this.width != savew) || (this.height != saveh))
            console.log("Canvas being enlarged from (%d, %d) to (%d, %d)", savew, saveh, this.width, this.height);
        var newcanvas = new Canvas(this.width, this.height);
        var data = this.imgdata();
        var newctx = newcanvas.getContext('2d');

        var damyImageData = ctx.getImageData(0, 0, 10, 10); //left, top, width, height);
        
    }
    return this; //fluent
},

function Model(opts)
{
    if (!(this instanceof Rect2D)) return makenew(Rect2D, arguments);
    opts = (typeof opts === 'string')? {name: opts}: opts || {};
}

Model.prototype.enlarge = function(canvas)
{
    canvas.add(this);
    this.canvas = canvas;
    return this; //fluent
}

Model.prototype.fill = function(color)
{
    this.can
}

function Rect2D(opts)
{
    if (!(this instanceof Rect2D)) return makenew(Rect2D, arguments);
    opts = (typeof opts === 'string')? {name: opts}: opts || {};
    Model.apply(this, arguments);
    Rect2D.prevw = this.w = opts.w || opts.width || Rect2D.prevw || 0;
    Rect2D.prevh = this.h = opts.h || opts.height || Rect2D.prevh || 0;
    this.x = opts.x || opts.left || Rect2D.prevx + Rect2D.prevw;
    this.y = opts.y || opts.bottom || Rect2D.prevy + Rect2D.prevh;
}
Rect2D.prototype.enlarge = Model.prototype.enlarge;
Rect2D.prototype.fill = Model.prototype.fill;


var mod1 = new Rect2D({x: 0, y: 0, w: 3, h: 10}).enlarge(canvas);
var mod2 = new Rect2D({y: 0}).enlarge(canvas);
var mod3 = new Rect2D({w: 4, y: 0}).enlarge(canvas);
var mod4 = new Rect2D({x: 10}).enlarge(canvas);

console.log("canvas", canvas);
console.log("model4", mod4);

mod4.fill(red);
mod3.fill(


//     ctx.strokeStyle = "rgb(200, 100, 50)";
//    ctx.moveTo(0, 0);
//    ctx.lineTo(0, 100);
//    ctx.stroke();
//    ctx.fillStyle = "rgb(200, 100, 50)";
//    ctx.clearRect(50, 50, 100, 100);

//var myImageData = ctx.createImageData(10, 10); //w, h
//var myImageData = ctx.getImageData(0, 0, 10, 10); //left, top, width, height);
//var buf = myImageData.data; //Uint8ClampedArray of RGBA values
//console.log("w %d, h %d, len %d:", myImageData.width, myImageData.height, buf.length, buf);

//eof
*/