//xpm image
'use strict';

const pnglib = require('pnglib');
const makenew = require('my-plugins/utils/makenew');

module.exports = XPM;


//xpm loader ctor:
function XPM(data)
{
	if (!(this instanceof XPM)) return makenew(XPM, arguments);

	var ofs = 0;
	var parts = data[ofs++].match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/);
	if (!parts || (parts.length != 4+1)) throw "bad xpm header line: " + data[--ofs];
	var w = parseInt(parts[1]), h = parseInt(parts[2]), numcolors = parseInt(parts[3]), chpp = parseInt(parts[4]);
	console.log("xpm: w %d, h %d, #c %d, chpp %d".blue, w, h, numcolors, chpp);
//	if (chpp != 1) throw "not implemented: " + chpp + " char/pixel";

//var colors = {}
	this.palette = {}; //RGB values
	var parse = new RegExp("^(.{" + chpp + "})\\s+c\\s+([^ ]+)\s*$", 'i');
	for (var i = 0; i < numcolors; ++i)
	{
		parts = data[ofs++].match(parse);
	        if (!parts || (parts.length != 2+1)) throw "xpm bad color[" + i + "/" + numcolors + "]: " + data[--ofs];
	        this.palette[parts[1]] = this.parsecolor(parts[2]);
	}
	var buf = '';
	for (var i in this.palette) buf += ', "' + i + '": 0x' + (this.palette[i] >>> 0).toString(16);
	console.log("xpm got %d colors: %s".blue, numcolors, '{' + buf.substr(2) + '}');

	this.colorinx = []; //color index for each pixel
	this.xofs = this.yofs = 0; //scroll offsets
	for (var y = 0; y < h; ++y, ++ofs)
	{
	        if (data[ofs].length != w * chpp) throw "xpm bad row[" + y + "]: has len " + data[ofs].length + " (expected " + (w * chpp) + ")";
//		var row = this.colorinx[y] = [];
//		this.colorinx.push(data[ofs]); //save color inx so palette can be changed independently
		var row = this.colorinx[y] = [];
		for (var x = 0; x < w; ++x)
		{
			var code = data[ofs].substr(chpp * x, chpp);
			if (!(code in this.palette)) throw "xpm: unknown color code '" + code + "' @(" + x + ", " + y + ")";
//			this.abgr[y * w + x] = this.palette[this.colorinx[y][x]]; //actual color; ABGR expected; use A for transparency
//			row.push(this.colors[data[ofs].charCodeAt(x)]); //actual color
			row.push(code); //indexed colors
//2x			row.push(code);
		}
	}
//	img.data.set(newdata); //putImageData(img, 0, 0, w, h); //new Uint8ClampedArray(buf);
//	setimgdata(this.image, newdata)
//    this.image = new Image(w, h);
//    var img = this.image.getImageData(0, 0, w, h); //kludge: this is needed in order to force image.data to be created
//    this.abgr = new Uint32Array(w * h); //img.data);
//console.log("img data len", /*img.data.length,*/ this.abgr.length, this.width, this.height);
	Object.defineProperties(this, //read-only; use image dimensions in case resized later
	{
		width: { get() { return this.colorinx[0].length; }, enumerable: true, },
		height: { get() { return this.colorinx.length; }, enumerable: true, },
	});
	if (ofs < data.length) throw "bad xpm: junk at end[" + ofs + "]: " + data[ofs];
	console.log("xpm loaded okay".cyan);
}


//minimal color parsing:
//only needs to handle RGB value or "none" for transparency
XPM.prototype.parsecolor = function parsecolor(color)
{
    if (typeof color == 'number') return color >>> 0; //already parsed; force to uint32
    color += ''; //convert to string
    if (!color.match(/^(none|#[0-9a-f]{6})$/i)) throw "xpm bad color: " + color;
//    return (color[0] == '#')? /*this.argb2abgr*/(/*this.swab*/(parseInt(color.substr(1), 16)) | 0xff000000): 0; //alpha 0 => transparent (none)
    return (color[0] == '#')? (parseInt(color.substr(1), 16) >>> 0) | 0xff000000: 0; //alpha 0 => transparent (none)
}


//make a copy of image:
//uses deep copy so image can be changed without affecting other copies
XPM.prototype.clone = function clone()
{
    var retval = new XPM(["1 1 1 1", "  c #000000", " "]); //1-pixel dummy image
    retval.palette = {};
    for (var color in this.palette) //deep copy
        retval.palette[color] = this.palette[color];
    retval.colorinx = [];
    for (var y = 0; y < this.height; ++y) //deep copy
        retval.colorinx.push(this.colorinx[y].slice());
//    retval.img = null; //stale image data
    return retval;
}


////////////////////////////////////////////////////////////////////////////////////
////
/// rendering
//

//render to HTML graphics context:
//other ways: http://stackoverflow.com/questions/7242006/html5-copy-a-canvas-to-image-and-back
//or https://hacks.mozilla.org/2011/12/faster-canvas-pixel-manipulation-with-typed-arrays/
//   http://jsfiddle.net/andrewjbaker/Fnx2w/
XPM.prototype.draw = function draw(ctx, dest, force)
{
    if (!dest) dest = {}; //dest = {x: 10, y: 10, w: 100, h: 100, scale: 20};
    var fade = (dest.fade || 255) / 255; //TODO
    var dx = dest.scale || 10, w = this.width * dx, x = dest.x || 10;
    var dy = dest.scale || 10, h = this.height * dy, y = dest.y || 10;
//see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
    ctx.imageSmoothingEnabled = false; //see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled
//    ctx.drawImage(this.image, dest.x || 10, dest.y || 10, w, h); //origin = top left
    if (!this.img) //generate image data
    {
        force = true;
        this.img = new Image(this.width, this.height);
        this.img.onload = function() //finish async
        {
            console.log("async img draw", this.img.width, this.img.height);
            ctx.drawImage(this.img, x, y, w, h); //this.width, this.height);
        }.bind(this);
        console.log("set up async draw".blue);
    }
    if (force)
    {
        if (dest.clear) ctx.clearRect(x, y, w, h);
        this.img.src = this.imgdata();
        console.log("img src: %s".blue, this.img.src);
    }
//    else { console.log("sync draw"); ctx.drawImage(this.img, dest.x || 10, dest.y || 10, w, h); } //this.width, this.height);
//    var svload = img.onload;
//    img.onload = function()
//    {
//        context.drawImage(this, 0, 0, canvas.width, canvas.height);
//        img.onload = svload;
//    }
//  context.drawImage(this, 0, 0, canvas.width, canvas.height);

/*
//    ctx.drawImage(img, dest.x || 10, dest.y || 10, w, h); //origin = top left
    var img = ctx.getImageData(dest.x || 0, dest.y || 0, w, h);
console.log("img data w h", w, h, dest.x, dest.y, img.data.length);
//    var buf = ArrayBuffer.transfer(img.data, img.data.length);
    var newdata = new Uint32Array(img.data);
console.log("img data len", img.data.length, newdata.length, this.width, this.height);
    for (var y = 0; y < this.height; ++y)
        for (var x = 0; x < this.width; ++x)
            newdata[y * this.width + x] = this.colors[this.colorinx[y][x]]; //actual color
    img.data.set(newdata); //new Uint8ClampedArray(buf));
    ctx.putImageData(img, dest.x || 0, dest.y || 0); //, w, h);
*/
    console.log("img %d x %d => %d x %d".cyan, this.width, this.height, w, h);
//            grid(ctx, dest, '#aaa');
    return this; //fluent
}


//overridable pixel geometry:
XPM.prototype.xy = function xy(x, y)
{
	if ((x < 0) || (x >= this.w) || (y < 0) || (y >= this.h)) return null;
	return y * this.w + x;
}


//generate image data that can be drawn on HTML graphics context:
//bmp: http://mrcoles.com/media/js/bitmap.js
XPM.prototype.imgdata = function imgdata()
{
    var png = new pnglib(this.width, this.height, 8);
    var bkg = png.color(0, 0, 0, 0);  //first color = bkg RGBA
    for (var y = 0; y < this.height; ++y)
        for (var x = 0; x < this.width; ++x)
        {
            var color = this.palette[this.colorinx[y][x]]; // * this.width + x]];
//            console.log("(" + x + ", " + y + ") isa " + typeof color);
            if (typeof color != 'number') color = bkg;
            else color = png.color((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, color >> 24);
            png.buffer[png.index(x, y)] = color;
        }
//    var svload = img.onload;
//    img.onload = function()
//    {
//        context.drawImage(this, 0, 0, canvas.width, canvas.height);
//        img.onload = svload;
//    }
//  context.drawImage(this, 0, 0, canvas.width, canvas.height);
//    img.src = "data:image/gif;base64,R0lGODlhDwAPAKECAAAAzMzM/////wAAACwAAAAADwAPAAACIISPeQHsrZ5ModrLlN48CXF8m2iQ3YmmKqVlRtW4MLwWACH+H09wdGltaXplZCBieSBVbGVhZCBTbWFydFNhdmVyIQAAOw==";
    return "data:image/png;base64," + png.getBase64();
}


//xpm ARGB => image data ABGR
/*
XPM.prototype.argb2abgr = function argb2abgr(argb)
{
    argb >>>= 0;
//    if ((argb & 0xffffff) && !(argb & 0xff000000)) argb |= 0xff000000; //caller probably meant opaque
    return ((argb & 0xff00ff00) | ((argb >> 16) & 0xff) | ((argb << 16) & 0xff0000)) >>> 0; //force to uint32
}
*/


//architecture-dependent byte swapping:
/*
XPM.prototype.swab = function swab(val32)
{
    val32 >>>= 0; //convert to uint32
    var swapped = needswap()? (val32 >> 24) | ((val32 >> 8) & 0xff00) | ((val32 << 8) & 0xff0000) | (val32 << 24): val32;
//    console.log("swab: from %s to %s", (val32 >>> 0).toString(16), "to", (swapped >>> 0).toString(16));
    console.log("swab: from %s to %s", val32.toString(16), swapped.toString(16));
    return swapped;

    function needswap()
    {
        if (typeof swab.needswap == 'undefined')
        {
            var buf = new ArrayBuffer(4);
            var buf32 = new Uint32Array(buf);
            var buf8 = new Uint8ClampedArray(buf);
            buf32[0] = 0x12345678;
            swab.needswap = (buf8[0] != 0x12) || (buf8[3] != 0x78);
//            console.log("need swap? %s: %s %s %s %s".blue, swab.needswap, (buf8[0] + 0).toString(16), (buf8[1] + 0).toString(16), (buf8[2] + 0).toString(16), (buf8[3] + 0).toString(16));
            console.log("need swap? %s: %s %s %s %s".blue, swab.needswap, buf8[0].toString(16), buf8[1].toString(16), buf8[2].toString(16), buf8[3].toString(16));
        }
        return swab.needswap;
    }
}
*/


////////////////////////////////////////////////////////////////////////////////////
////
/// manipulation
//

//replace color(s) in palette:
XPM.prototype.setpal = function setpal(newpal)
{
//    if (newpal.length != this.palette.length) throw "xpm setpal: wrong #colors (got " + newpal.length + ", expected " + this.palette.length + ")";
//    this.colors = {};
    for (var c in newpal)
    {
        if (!(c in this.palette)) throw "xpm: unknown color code '" + c + "' = " + newpal[c];
        this.palette[c] = this.parsecolor(newpal[c]);
    }
    this.img = null; //need to regenerate image data
//redraw image with new colors:
//    this.abgr = new Uint32Array(this.width * this.height); //img.data);
//    for (var y = 0; y < this.height; ++y)
//        for (var x = 0; x < this.width; ++x)
//            newdata[y * this.width + x] = this.palette[this.colorinx[y][x]]; //actual color; ABGR expected; use A for transparency
//    this.image.data.set(newdata); //putImageData(img, 0, 0, w, h); //new Uint8ClampedArray(buf);
    return this; //fluent
}


//change image size:
XPM.prototype.resize = function resize(w, h)
{
//NOTE: use distinct arrays on each row to allow pixels to be set differently later
    if (this.height > h) this.colorinx.splice(h, this.height - h); //shrink
    while (this.height < h) this.colorinx.push(new Array(w)); //grow
    var wadjust = w - this.width; //CAUTION: need to save this before altering first row
    for (var y = 0; y < this.height; ++y)
    {
        if (wadjust < 0) this.colorinx[y].splice(w, -wadjust); //shrink
        if (wadjust > 0) this.colorinx[y].splice(w - wadjust, new Array(wadjust)); //grow
    }
    this.img = null; //stale image data
    return this; //fluent
}


//scroll image up/down/left/right:
XPM.prototype.scroll = function scroll(xofs, yofs)
{
    this.colorinx.scroll(yofs, function(row) { row.fill(0); });
    for (var y = 0; y < this.height; ++y)
        this.colorinx[y].scroll(xofs, function(val, inx, ary) { ary[inx] = 0; });
    this.img = null; //stale image data
    return this; //fluent
}


//scroll 1 column up/down:
XPM.prototype.scroll1col = function scroll(x, yofs)
{
    if ((x >= 0) && (x < this.width))
    {
        if (yofs < 0)
            for (var y = 0; y < this.height; ++y)
                this.colorinx[y][x] = (y < this.height + yofs)? this.colorinx[y - yofs][x]: 0;
        if (yofs > 0)
            for (var y = this.height - 1; y >= 0; --y)
                this.colorinx[y][x] = (y >= yofs)? this.colorinx[y - yofs][x]: 0;
    }
    this.img = null; //stale image data
    return this; //fluent
}


////////////////////////////////////////////////////////////////////////////////////
////
/// misc helpers
//

//Array scrolling extension:
if (!Array.prototype.scroll)
Array.prototype.scroll = function scroll(ofs, newvals)
{
    if (!ofs) return null;
    var svlen = this.length;
    var removed = (ofs < 0)? this.splice(0, -ofs): this.splice(this.length - ofs, ofs);
    console.log("array.scroll: removed %d..+%d: %d".blue, (ofs < 0)? 0: svlen - ofs, (ofs < 0)? -ofs: ofs, removed.length);
    if (arguments.length > 1) removed.forEach(newvals); //function(y, row) { row.forEach(function(x) { row[x] = newval; }); }); //initialize moved values
    if (arguments.length > 1) console.log("array.scroll: init to %j".blue, newvals);
    svlen = this.length;
//wrong    this.splice((ofs < 0)? this.length: 0, 0, removed);
    removed.splice(0, 0, (ofs < 0)? this.length: 0, 0);
    this.splice.apply(this, removed);
    console.log("array.scroll: added %d..+%d: %d".blue, (ofs < 0)? svlen: 0, 0, removed.length);
    return removed;
}


//eof
