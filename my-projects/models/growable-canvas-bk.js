
'use strict';

var Canvas = require('canvas'); //https://www.npmjs.com/package/canvas
var Image = Canvas.Image;

//for now, use a 2D canvas
//TODO: use a 3D canvas + fx


function GrowableCanvas(opts)
{
    if (!(this instanceof GrowableCanvas)) return makenew(GrowableCanvas, arguments);
    this.width = opts.w || opts.width || 0;
    this.height = opts.h || opts.height || 0;
}

GrowableCanvas.prototype.add = function(x, y, w, h)
{
    if (arguments.length == 1) { h = x.h || x.height || 1; w = x.w || x.width || 1; y = x.y || x.bottom || 0; x = x.x || x.left || 0; }
    this.width = Math.max(this.width, x + w);
    this.height = Math.max(this.height, y + h);
},


function SubCanvas(canvas, x, y, w, h)
{
    if (!(this instanceof SubCanvas)) return makenew(SubCanvas, arguments);
    this.canvas = canvas;
    this.rect = {x: x, y: y, w: w, h: h};
    this.
}
    getrect: function
    alloc: function()
    {
        this.canvas = new Canvas(this.width, this.height);
        this.ctx = this.canvas.getContext('2d');
    },
====
var myImageData = ctx.getImageData(0, 0, 10, 10); //left, top, width, height);
var buf = myImageData.data; //Uint8ClampedArray of RGBA values
console.log("w %d, h %d, len %d:", myImageData.width, myImageData.height, buf.length, buf);

    }
};
//var ctx = canvas.getContext('2d');
//module.exports.canvas = canvas;

function load_frame(filename)
{
    if (!filename) filename = path.join(__dirname, '/images/squid.png'); //demo image
    fs.readFile(filename, function(err, squid)
    {
        if (err) throw err;
        var img = new Image;
        img.src = squid;
        ctx.drawImage(img, 0, 0, img.width / 4, img.height / 4);
    });
}
function frame_data()
{
    return canvas.toBuffer();
}

