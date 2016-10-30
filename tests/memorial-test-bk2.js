'use strict';
//cat /proc/interrupts   before and after to check irq occurrences

//const NUMLEDS = 256, NUMNULL = 1; //gift
const NUMLEDS = 768, NUMNULL = 1; //gdoor

/* XPM */
/* XPM */
const USflag = new xpm(
[
"24 13 4 2",
"  	c #000000",
". 	c #F80000",
"# 	c #0000F8",
"& 	c #F8F8F8",
"# # # # # # # # # . . . . . . . . . . . . . . . ",
"# & # & # & # & # & & & & & & & & & & & & & & & ",
"# # & # & # & # # . . . . . . . . . . . . . . . ",
"# & # & # & # & # & & & & & & & & & & & & & & & ",
"# # & # & # & # # . . . . . . . . . . . . . . . ",
"# & # & # & # & # & & & & & & & & & & & & & & & ",
"# # # # # # # # # . . . . . . . . . . . . . . . ",
"& & & & & & & & & & & & & & & & & & & & & & & & ",
". . . . . . . . . . . . . . . . . . . . . . . . ",
"& & & & & & & & & & & & & & & & & & & & & & & & ",
". . . . . . . . . . . . . . . . . . . . . . . . ",
"& & & & & & & & & & & & & & & & & & & & & & & & ",
". . . . . . . . . . . . . . . . . . . . . . . . ",
]);

USflag.resize(USflag.width, USflag.height + 2);
USflag.scroll(0, +1);

const USflag_up = USflag.clone(), USflag_down = USflag.clone();
for (var x = 0; x < USflag.width; ++x)
{
    if (!(Math.floor(x / 4) & 1)) continue;
    USflag_up.scroll1col(x, -1);
    USflag_down.scroll1col(x, +1);
}

//example from https://github.com/jperkin/node-rpio
//https://mikaelleven.wordpress.com/2015/12/10/troubleshooting-spi-on-raspberry-pi-nodejs/
//for explanation of 3x bit rate with NRZ, see https://github.com/jgarff/rpi_ws281x

chkroot();
var rpio = require('rpio');
init();
console.log("sleep 10 sec ...");
rpio.msleep(10 * 1000);
//test1();
//test2();
//scope_test();
//test3();
//var img = xpm(Easter_Rainbow_Cross24x16_xpm);
//var img = xpm(USflag24x13_xpm);
//img.xy = xy_gdoor;
USflag.xy = USflag_up.xy = USflag_down.xy = xy_gdoor;
//console.log("ONE ONLY");
for (;;)
//for (var retry = 0; retry < 10; ++retry)
{
	rpio.setall(0);
	for (var ofs = -12; ofs < 48-12; ++ofs)
	{
ofs = 12; //24;
		var img = USflag;
		switch (ofs % 3)
		{
			case 1: img = USflag_up; break;
			case 3: img = USflag_down; break;
		}
		image(img, ofs);
//break;
		rpio.msleep(500);
	}
//break;
}


function chkroot()
{
//	if (process.getuid) console.log(`Current uid: ${process.getuid()}`);
//	else console.log("can't check uid");
	var uid = parseInt("0" + process.env.SUDO_UID);
//	if (uid) process.setuid(uid);
//	console.log("uid", uid);
	if (uid) { console.log("sudo okay"); return; }
	console.error("please run with 'sudo'??");
	process.exit(1);
}


function xpm(data)
{
    if (!(this instanceof xpm)) return new xpm.apply(xpm, [null].concat(Array.from(arguments)))();
    var ofs = 0;
//    this.pixels = [];
    var parts = data[ofs++].match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/);
    if (!parts || (parts.length != 4+1)) throw "bad xpm line 1: " + data[--ofs];
    var w = parseInt(parts[1]), h = parseInt(parts[2]), numcolors = parseInt(parts[3]), chpp = parseInt(parts[4]);
    console.log("w %d, h %d, #c %d, chpp %d", w, h, numcolors, chpp);
//    if (chpp != 1) throw "xpm not implemented: " + chpp + " char/pixel";
    this.palette = {};
    var parse = new RegExp("^(.{" + chpp + "})\\s+c\\s+([^ ]+)\s*$", 'i');
    for (var i = 0; i < numcolors; ++i)
    {
        parts = data[ofs++].match(parse);
        if (!parts || (parts.length != 2+1)) throw "xpm bad color[" + i + "/" + numcolors + "]: " + data[--ofs];
        this.palette[parts[1]] = this.getcolor(parts[2]);
    }
    var buf = ''; for (var i in this.palette) buf += ', "' + i + '": 0x' + (this.palette[i] >>> 0).toString(16);
    console.log("xpm got %d colors:", numcolors, this.palette, '{' + buf.substr(2) + '}');
    Object.defineProperties(this,
    {
        width: { get() { return this.colorinx[0].length; }, enumerable: true, },
        height: { get() { return this.colorinx.length; }, enumerable: true, },
    });
//    this.image = new Image(w, h);
//    var img = this.image.getImageData(0, 0, w, h); //kludge: this is needed in order to force image.data to be created
//    this.abgr = new Uint32Array(w * h); //img.data);
//console.log("img data len", /*img.data.length,*/ this.abgr.length, this.width, this.height);
    this.colorinx = [];
    for (var y = 0; y < h; ++y, ++ofs)
    {
        if (data[ofs].length != w * chpp) throw "xpm bad row[" + y + "]: len " + data[ofs].length + " (expected " + (w * chpp) + ")";
//        var row = this.pixels[y] = [];
//        this.colorinx.push(data[ofs]); //save color inx so palette can be changed independently
        var row = this.colorinx[y] = [];
        for (var x = 0; x < w; ++x)
        {
            var code = data[ofs].substr(chpp * x, chpp);
            if (!(code in this.palette)) throw "xpm: unknown color code '" + code + "' @(" + x + ", " + y + ")";
//            this.abgr[y * w + x] = this.palette[this.colorinx[y][x]]; //actual color; ABGR expected; use A for transparency
            row.push(code); //indexed colors
//            row.push(this.colors[data[ofs].charCodeAt(x)]); //actual color
//2x			row.push(colors[data[ofs].charCodeAt(x)]);
        }
    }
//    img.data.set(newdata); //putImageData(img, 0, 0, w, h); //new Uint8ClampedArray(buf);
//    setimgdata(this.image, newdata)
    if (ofs < data.length) throw "xpm: junk at end " + (data.length - ofs);
//    return this.pixels;
}

//bmp: http://mrcoles.com/media/js/bitmap.js
xpm.prototype.imgdata = function imgdata()
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
xpm.prototype.argb2abgr = function argb2abgr(argb)
{
    argb >>>= 0;
//    if ((argb & 0xffffff) && !(argb & 0xff000000)) argb |= 0xff000000; //caller probably meant opaque
    return ((argb & 0xff00ff00) | ((argb >> 16) & 0xff) | ((argb << 16) & 0xff0000)) >>> 0; //force to uint32
}

xpm.prototype.swab = function swab(val32)
{
    var swapped = this.swab_inner(val32);
    console.log("swap: from", (val32 >>> 0).toString(16), "to", (swapped >>> 0).toString(16));
    return swapped;
}

xpm.prototype.swab_inner = function swab(val32)
{
    val32 >>>= 0;
    if (typeof swab.needswap == 'undefined')
    {
        var buf = new ArrayBuffer(4);
        var buf32 = new Uint32Array(buf);
        var buf8 = new Uint8ClampedArray(buf);
        buf32[0] = 0x12345678;
        swab.needswap = (buf8[0] != 0x12) || (buf8[3] != 0x78);
        console.log("need swap?", swab.needswap, (buf8[0] + 0).toString(16), (buf8[1] + 0).toString(16), (buf8[2] + 0).toString(16), (buf8[3] + 0).toString(16));
    }
    return swab.needswap? (val32 >> 24) | ((val32 >> 8) & 0xff00) | ((val32 << 8) & 0xff0000) | (val32 << 24): val32;
}

xpm.prototype.setpal = function setpal(newpal)
{
//    if (newpal.length != this.palette.length) throw "xpm setpal: wrong #colors (got " + newpal.length + ", expected " + this.palette.length + ")";
//    this.colors = {};
    for (var c in newpal)
    {
        if (!(c in this.palette)) throw "xpm: unknown color code '" + c + "' = " + newpal[c];
        this.palette[c] = this.getcolor(newpal[c]);
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

xpm.prototype.getcolor = function getcolor(color)
{
    if (typeof color == 'number') return color >>> 0;
    color += ''; //convert to string
    if (!color.match(/^(none|#[0-9a-f]{6})$/i)) throw "xpm bad color: " + color;
//    return (color[0] == '#')? /*this.argb2abgr*/(/*this.swab*/(parseInt(color.substr(1), 16)) | 0xff000000): 0; //alpha 0 => transparent (none)
    return (color[0] == '#')? (parseInt(color.substr(1), 16) >>> 0) | 0xff000000: 0; //alpha 0 => transparent (none)
}

//other ways: http://stackoverflow.com/questions/7242006/html5-copy-a-canvas-to-image-and-back
//or https://hacks.mozilla.org/2011/12/faster-canvas-pixel-manipulation-with-typed-arrays/
//   http://jsfiddle.net/andrewjbaker/Fnx2w/
xpm.prototype.draw = function draw(ctx, dest, force)
{
    if (!dest) dest = {}; //dest = {x: 10, y: 10, w: 100, h: 100, scale: 20};
    var fade = (dest.fade || 255) / 255; //TODO
    var dx = dest.scale || 10, w = this.width * dx, x = dest.x || 10;
    var dy = dest.scale || 10, h = this.height * dy, y = dest.y || 10;
//see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
    ctx.imageSmoothingEnabled = false; //see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled
//    ctx.drawImage(this.image, dest.x || 10, dest.y || 10, w, h); //origin = top left
    if (!this.img) //gen img data
    {
        force = true;
        this.img = new Image(this.width, this.height);
        this.img.onload = function() //finish async
        {
            console.log("async img draw", this.img.width, this.img.height);
            ctx.drawImage(this.img, x, y, w, h); //this.width, this.height);
        }.bind(this);
        console.log("set up async draw");
    }
    if (force)
    {
        if (dest.clear) ctx.clearRect(x, y, w, h);
        this.img.src = this.imgdata();
        console.log("img src", this.img.src);
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
            newdata[y * this.width + x] = this.colors[this.pixels[y][x]]; //actual color
    img.data.set(newdata); //new Uint8ClampedArray(buf));
    ctx.putImageData(img, dest.x || 0, dest.y || 0); //, w, h);
*/
    console.log("img %d x %d => %d x %d", this.width, this.height, w, h);
//            grid(ctx, dest, '#aaa');
    return this; //fluent
}

xpm.prototype.resize = function resize(w, h)
{
//NOTE: use distint arrays on each row to allow pixels to be set differently later
    if (this.height > h) this.colorinx.splice(h, this.height - h); //shrink
    while (this.height < h) this.colorinx.push(new Array(w)); //grow
    var wadjust = w - this.width; //CAUTION: need to save this before altering first row
    for (var y = 0; y < this.height; ++y)
    {
        if (wadjust < 0) this.colorinx[y].splice(w, -wadjust); //shrink
        if (wadjust > 0) this.colorinx[y].splice(w - wadjust, new Array(wadjust)); //grow
    }
    this.img = null; //need to regenerate image data
    return this; //fluent
}

Array.prototype.scroll = function scroll(ofs, newvals)
{
    if (!ofs) return;
    var svlen = this.length;
    var removed = (ofs < 0)? this.splice(0, -ofs): this.splice(this.length - ofs, ofs);
    console.log("array.scroll: removed %d..+%d: %d", (ofs < 0)? 0: svlen - ofs, (ofs < 0)? -ofs: ofs, removed.length);
    if (arguments.length > 1) removed.forEach(newvals); //function(y, row) { row.forEach(function(x) { row[x] = newval; }); });
    if (arguments.length > 1) console.log("array.scroll: init to %j", newvals);
    svlen = this.length;
//wrong    this.splice((ofs < 0)? this.length: 0, 0, removed);
    removed.splice(0, 0, (ofs < 0)? this.length: 0, 0);
    this.splice.apply(this, removed);
    console.log("array.scroll: added %d..+%d: %d", (ofs < 0)? svlen: 0, 0, removed.length);
    return removed;
}

xpm.prototype.scroll = function scroll(xofs, yofs)
{
    this.colorinx.scroll(yofs, function(row) { row.fill(0); });
    for (var y = 0; y < this.height; ++y)
        this.colorinx[y].scroll(xofs, function(val, inx, ary) { ary[inx] = 0; });
    this.img = null; //need to regenerate image data
    return this; //fluent
}

xpm.prototype.scroll1col = function scroll(x, yofs)
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
    this.img = null; //need to regenerate image data
    return this; //fluent
}

xpm.prototype.clone = function clone()
{
    var retval = new xpm(["1 1 1 1", "  c #000000", " "]); //1-pixel dummy image
    retval.palette = {};
    for (var color in this.palette)
        retval.palette[color] = this.palette[color];
    retval.colorinx = [];
    for (var y = 0; y < this.height; ++y)
        retval.colorinx.push(this.colorinx[y].slice());
    this.img = null; //need to regenerate image data
    return retval;
}


function xy_gift(x, y)
{
	var which = 256 - 32 * (x >> 1);
	if (x & 1) which += -17 - y;
	else which += y - 16;
//	console.log("(%d, %d) => '%d", x, y, which);
	return which;
}

function xy_gdoor(x, y)
{
	var which;
	if (x < 24) //left
	{
		which = 768 - 48 * (y >> 1);
		if (y & 1) which += -24-1 - x;
		else which += x - 24;
	}
	else //right
	{
		which = 384 - 48 * (y >> 1);
		if (y & 1) which += -48 + x - 24;
		else which += 24-1 - x;
	}
//	console.log("(%d, %d) => '%d", x, y, which);
	return which;
}

function image_test(img, xofs)
{
	console.error("show image %d x %d ...", img.width, img.height);
	rpio.setall(0);
	for (var y = 0; y < 16; ++y)
		for (var x = 0; x < 48; ++x)
		{
			rpio.setled(img.xy(x, y), [0xff0000, 0x00ff00, 0x0000ff][xofs % 3]);
			rpio.flush();
			rpio.msleep(50);
		}
}

function image(img, xofs)
{
	console.error("show image %d x %d  at '%d...", img.width, img.height);
	for (var y = 0; y < img.height; ++y)
		for (var x = 0; x < img.width; ++x)
		{
	            var color = img.palette[img.colorinx[y][x]];
	            if (typeof color != 'number') color = 0; //bkg
//        	    else color = png.color((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 
			if ((x == 0) && (x + xofs > 0)) rpio.setled(img.xy(x + xofs - 1, y), 0);
			if ((x + xofs >= 0) && (x + xofs < 48)) rpio.setled(img.xy(x + xofs, y), color);
//			if ((x == img[y].length - 1) && (x + xofs < 47)) rpio.setled(img.xy(x + xofs + 1, y), 0);
		}
	rpio.flush();
}

function scope_test()
{
	const SCOPE = 11;
	const DELAY = 100; //100 => 200 usec, 200 => 300, 50 => 125
	rpio.open(SCOPE, rpio.OUTPUT, rpio.LOW);
	for (;;)
	{
		rpio.write(SCOPE, rpio.HIGH);
		rpio.usleep(DELAY);
		rpio.write(SCOPE, rpio.LOW);
//		rpio.usleep(DELAY);
//		rpio.setled(0, 0x00ff00);
//		rpio.flush();
//		rpio.on(); //rpio.usleep(1);
//		rpio.off(); //rpio.usleep(5);
//		rpio.on(); //rpio.usleep(1);
//		rpio.off(); //rpio.usleep(5);
		rpio.write(19, rpio.HIGH); rpio.write(19, rpio.LOW);
		rpio.write(19, rpio.HIGH); rpio.write(19, rpio.LOW);
		rpio.usleep(1);
	}
	rpio.spiEnd();
}


//SPI loopback:
function test3()
{

//	loopback();
//write only test:
//	test3a(tx);
	test3b();

	rpio.spiEnd();
}


function fx()
{
	const DIM = 0x1f1f1f; //0x1e1e1e;
	const RED = 0x00ff00; //R<->G
	const GREEN = 0xff0000; //R<->G
	const BLUE = 0x0000ff;
	const CYAN = GREEN | BLUE, MAGENTA = RED | BLUE, YELLOW = RED | GREEN, WHITE = RED | GREEN | BLUE;
	const colors = [RED, GREEN, BLUE, YELLOW, MAGENTA, CYAN, WHITE];
		for (var c = 0; c < colors.length; ++c)
	for (var loop = 0; loop < 3; ++loop)
		{
//	const c = 2; //0;
//	console.log("fx start");
	rpio.scope();
/*
	for (var i = 0; i < 6; ++i) rpio.setled(i, 0);
	rpio.setled(0, WHITE & DIM);
//	rpio.setled(0, RED & DIM); rpio.setled(1, GREEN & DIM); rpio.setled(2, BLUE & DIM); rpio.setled(3, CYAN & DIM); rpio.setled(4, MAGENTA & DIM); rpio.setled(5, YELLOW & DIM);
	rpio.flush();
	rpio.msleep(2000);
*/

	const numled = 250+ 6;
	for (var nn = 0; nn <= numled; ++nn)
	{
		var n = nn; //6 - nn;
		if (!nn) console.log("fx: n ", n, ", color ", c);
		if (!nn) rpio.setall(0);
//n = 1;
		if (n < numled) rpio.setled(n % numled, colors[c] & DIM);
//		/*if (n)*/ rpio.setled((n - 1 + numled) % numled, 0);
//		rpio.setled(0, 0);
		rpio.flush();
//break;
		rpio.msleep(50); //100 * 10);
	}
		}
}

//loopback test:
function loopback()
{
	var tx = new Buffer('HELLO SPI');
	var rx = new Buffer(tx.length);
	var rxlen = rpio.spiTransfer(tx, rx, tx.length);
	console.log("spi rx %d, tx %d, io %j", rx.length, tx.length, rxlen);
	for (var i = 0; i < tx.length; ++i)
		process.stdout.write(String.fromCharCode(tx[i]) + ' ');
	process.stdout.write('\n');
}



function test3b()
{
	const SCOPE = 11;
	rpio.open(SCOPE, rpio.OUTPUT, rpio.LOW);
	rpio.scope = function() //scope trigger (debug)
	{
		rpio.write(SCOPE, rpio.HIGH);
		rpio.msleep(1);
		rpio.write(SCOPE, rpio.LOW);
	}

	const PIR = 13;
	rpio.open(PIR, rpio.INPUT);
	var previous;
	for (;;)
	{
		fx();
//		rpio.msleep(10); //1000);
		continue;

//		console.log("pir " + PIR + " is " + (rpio.read(PIR)? "on": "off"));
		var current = rpio.read(PIR);
		if (current && !previous) fx();
		previous = current;
		rpio.msleep(100);
	}
}


function test3a(tx)
{
	const DELAY = 2000; //msec
	for (;;)
	{
break;
	tx.setled(0, 0xff0000);
	tx.setled(1, 0x00ff00);
	tx.setled(2, 0x0000ff);
	tx.setled(3, 0xffff00);
	tx.setled(4, 0xff00ff);
	tx.setled(5, 0x00ffff);
//	var rx = new Buffer(tx.length);
		console.log("multi", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);

	for (var n = 0; n < 6; ++n) tx.setled(n, (n & 1)? 0xff0000: 0);
	console.log("green", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);

	for (var n = 0; n < 6; ++n) tx.setled(n, (n & 1)? 0x00ff00: 0);
	console.log("red", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);

	for (var n = 0; n < 6; ++n) tx.setled(n, (n & 1)? 0x0000ff: 0);
	console.log("blue", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);

//break;
	for (var n = 0; n < 6; ++n) tx.setled(n, (n & 1)? 0xffff00: 0);
	console.log("yellow", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);

	for (var n = 0; n < 6; ++n) tx.setled(n, (n & 1)? 0x00ffff: 0);
	console.log("magenta", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);

	for (var n = 0; n < 6; ++n) tx.setled(n, (n & 1)? 0xff00ff: 0);
	console.log("cyan", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);

	for (var n = 0; n < 6; ++n) tx.setled(n, (n & 1)? 0xffffff: 0);
	console.log("white", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);

	for (var n = 0; n < 6; ++n) tx.setled(n, 0);
	console.log("off", tx);
	rpio.spiWrite(tx, tx.length);
		rpio.msleep(DELAY);
break;
	}
}


//read a pin:
function test2()
{
	const LED = 11;
	rpio.open(LED, rpio.INPUT);
	console.log("pin " + LED + " is " + (rpio.read(LED)? "on": "off"));
}


//blink LED on P12 / GPIO 18:
function test1()
{
	const LED = 12;
	rpio.open(LED, rpio.OUTPUT, rpio.LOW);
	for (var i = 0; i < 5; ++i)
	{
		console.log(LED + " high");
		rpio.write(LED, rpio.HIGH);
		rpio.sleep(1);
		console.log(LED + " low");
		rpio.write(LED, rpio.LOW);
		rpio.msleep(500);
	}
}

function usec2bytes(usec)
{
	return 3 * usec / 1.25 / 8; //30 usec == 1 node == 9 bytes
}
function nodes2bytes(nodes)
{
	return nodes * 24 * 3 / 8; //1 node == 24 bits == 9 bytes
}

function init()
{
	console.log("init ...");
//	const NUMLEDS = 250+ 6, NUMNULL = 1;
	const LEADER = 0 +150; //15; //kludge: need to delay start
	const TRAILER = 0 +150; //150;
//	rpio.init({gpiomem: false}); //use /dev/mem for SPI
	rpio.spiBegin(); //set GPIO7-GPIO11 to SPI mode; calls .init()
	rpio.spiChipSelect(0); //TODO: is this needed?
	rpio.spiSetClockDivider(1 * (104 - 20)); //250 MHz / 104 ~= 2.4MHz => 3 * 24 == 72 bits  == 9 bytes / node WS281X; kludge: make it a little faster (timing is off)
	rpio.spiSetDataMode(0); //CPOL (clk polarity) 0, CPHA (clk phase) 0; see http://dlnware.com/theory/SPI-Transfer-Modes

	rpio.txbuf = new Buffer(usec2bytes(LEADER) + nodes2bytes(NUMLEDS + NUMNULL) + usec2bytes(TRAILER)); //6 nodes, 24 bits, 3 cycles/bit + 50 usec trailer
	rpio.txbuf.fill(0); //set trailer to 0s
	console.log("buf len %d = %d + %d + %d", rpio.txbuf.length, usec2bytes(LEADER), nodes2bytes(NUMLEDS + NUMNULL), usec2bytes(TRAILER));
	rpio.setall = function(color)
	{
		console.log("set all ...");
		for (var i = 0; i < NUMLEDS; ++i) this.setled(i, color);
		console.log("... set all");
	}
	rpio.setled = function(which, color)
	{
//		console.log("set led[%d] to 0x", which, color.toString(16));
//if (which >= 2) return;
		which += NUMNULL; //skip null pixel
		which *= nodes2bytes(1); //9 bytes / node
		which += usec2bytes(LEADER);
		if (which + nodes2bytes(1) + usec2bytes(TRAILER) > this.txbuf.length) { console.log( "bad index: " + ((which - usec2bytes(LEADER)) / nodes2bytes(1))); return; }
//		var r = (color >>> 16) & 0xFF;
//		var g = (color >>> 8) & 0xFF;
//		var b = color & 0xFF;
//turn on red/green/blue bits:
//		var buf = "";
		for (var i = 0; i < 3; ++i, which += 3, color <<= 8)
		{
			color >>>= 0; //force to int
//console.log("color[%d]: %s", i, (color & 0xff0000).toString(16));
//set beginning 1/3 of each bit and clear prev bit:
			this.txbuf[which + 0] = 0b10010010;
			this.txbuf[which + 1] = 0b01001001;
			this.txbuf[which + 2] = 0b00100100;

/*
			var ce = [", g", ", r", ", b"][i];
			if (color & 0x800000) buf += ce + "80";
			if (color & 0x400000) buf += ce + "40";
			if (color & 0x200000) buf += ce + "20";
			if (color & 0x100000) buf += ce + "10";
			if (color & 0x80000) buf += ce + "8";
			if (color & 0x40000) buf += ce + "4";
			if (color & 0x20000) buf += ce + "2";
			if (color & 0x10000) buf += ce + "1";
*/

			if (color & 0x800000) this.txbuf[which + 0] |= 0b01000000;
			if (color & 0x400000) this.txbuf[which + 0] |= 0b00001000;
			if (color & 0x200000) this.txbuf[which + 0] |= 0b00000001;
			if (color & 0x100000) this.txbuf[which + 1] |= 0b00100000;
			if (color & 0x080000) this.txbuf[which + 1] |= 0b00000100;
			if (color & 0x040000) this.txbuf[which + 2] |= 0b10000000;
			if (color & 0x020000) this.txbuf[which + 2] |= 0b00010000;
//CAUTION: 8th bit sometimes get stretched, which will be interpreted as a "1" and turn on msb of next color element; to avoid this, always turn off lsb here
			if (color & 0x010000) this.txbuf[which + 2] |= 0b00000010;
		}
//		console.log("set led bits", buf.substr(2));
	}
	rpio.setled(-1, 0); //clear null pixel
	rpio.flush = function()
	{
//		var buf = "";
		for (var i = 0; i < usec2bytes(LEADER); ++i)
			if (this.txbuf[i]) console.error("bad header:", i, this.txbuf[i]);
		for (var i = 0; i < nodes2bytes(NUMLEDS + NUMNULL); i += 3)
		{
			var color = this.txbuf.slice(usec2bytes(LEADER) + i); //, 3); //kludge: len param gives null buf!
//console.log(usec2bytes(LEADER), i, color);
//			buf += (i % nodes2bytes(1))? " ": ", 0b";
			if (color[0] || color[1] || color[2])
			{
				if ((color[0] & 0b10110110) != 0b10010010) console.error("bad bits0:", i + 0, color[0].toString(2));
				if ((color[1] & 0b11011011) != 0b01001001) console.error("bad bits1:", i + 1, color[1].toString(2));
				if ((color[2] & 0b01101101) != 0b00100100) console.error("bad bits2:", i + 2, color[2].toString(2));
			}
/*
			buf += (color[0] & 0b01000000)? "1": "0";
			buf += (color[0] & 0b00001000)? "1": "0";
			buf += (color[0] & 0b00000001)? "1": "0";
			buf += (color[1] & 0b00100000)? "1": "0";
			buf += (color[1] & 0b00000100)? "1": "0";
			buf += (color[2] & 0b10000000)? "1": "0";
			buf += (color[2] & 0b00010000)? "1": "0";
			buf += (color[2] & 0b00000010)? "1": "0";
*/
		}
//		console.log("flush:", buf.substr(2), this.txbuf.slice(usec2bytes(LEADER)));
		for (var i = usec2bytes(LEADER) + nodes2bytes(NUMLEDS + NUMNULL); i < this.txbuf.length; ++i)
			if (this.txbuf[i]) console.error("bad trailer:", i, this.txbuf[i]);
		this.spiWrite(this.txbuf, this.txbuf.length);
	}
	console.log("... init");
}

function init_fake()
{
	const SPIOUT = 19;
	rpio.open(SPIOUT, rpio.OUTPUT, rpio.LOW);
	rpio.buf = new Buffer(1 * 3);
	rpio.setled = function(which, color)
	{
		which *= 3;
		this.buf[which + 0] = color >>> 16;
		this.buf[which + 1] = color >>> 8;
		this.buf[which + 2] = color >>> 0;
	}
	rpio.flush = function()
	{
		for (var i = 0; i < this.buf.length; ++i)
		{
			rpio.write(SPIOUT, rpio.HIGH);
			if (this.buf[i] & 0x80);
			rpio.usleep(DELAY);
			rpio.write(SCOPE, rpio.LOW);
		}
	}
	rpio.on = function() { rpio.write(SPIOUT, rpio.HIGH); }
	rpio.off = function() { rpio.write(SPIOUT, rpio.LOW); }
}

//eof
