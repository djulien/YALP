//#!/usr/local/bin/node --expose-gc
//easter seq

'use strict';
const hw = require('./e4hw.js');


const PINK = 0x008844;
const PURPLE = 0x003366; //0x004488;

/* XPM */
var Easter_Rainbow_Cross24x16_xpm =
[
"24 16 9 1",
" 	c None",
".	c #E100FB",
"+	c #000000",
"@	c #FF0000",
"#	c #FF7000",
"$	c #FBFF00",
"%	c #00FF13",
"&	c #00FFFF",
"*	c #3C00FF",
"          ....          ",
"        ...+....        ",
"      ...@@+@@@...      ",
"    ...@@@@+@@@@@...    ",
"   ..@@@@##+###@@@@..   ",
"  ..@@@+++++++++#@@@..  ",
" ..@@@###$$+$$$###@@@.. ",
" .@@@###$$$+$$$$###@@@. ",
"..@@###$$%%+%%%$$###@@..",
".@@###$$%%%+%%%%$$###@@.",
".@@##$$%%%&+&&%%%$$##@@.",
"@@###$%%%&&+&&&%%%$###@@",
"@###$$%%&&&+*&&&%%$$###@",
"@##$$%%&&&*+**&&&%%$$##@",
"@##$$%%&&**+***&&%%$$##@",
"@##$$%%&&******&&%%$$##@",
];

/* XPM */
var Easter_Rainbow48x16_xpm =
[
"48 16 9 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FF7000",
"#	c #FBFF00",
"$	c #00FF13",
"%	c #00FFFF",
"&	c #3C00FF",
"*	c #E100FB",
"..................++++++++++++..................",
"..............++++++++++++++++++++..............",
"...........+++++++@@@@@@@@@@@@+++++++...........",
".........+++++@@@@@@@@@@@@@@@@@@@@+++++.........",
".......++++@@@@@@@############@@@@@@@++++.......",
"......+++@@@@######################@@@@+++......",
".....++@@@@#######$$$$$$$$$$$$#######@@@@++.....",
"....++@@@#####$$$$$$$$$$$$$$$$$$$$#####@@@++....",
"...++@@#####$$$$$$$%%%%%%%%%%$$$$$$$#####@@++...",
"..++@@####$$$$$%%%%%%%%%%%%%%%%%%$$$$$####@@++..",
"..+@@####$$$$%%%%%%&&&&&&&&&&%%%%%%$$$$####@@+..",
".++@@###$$$%%%%%&&&&&&&&&&&&&&&&%%%%%$$$###@@++.",
".+@@###$$$%%%%&&&&&&********&&&&&&%%%%$$$###@@+.",
"++@@##$$$%%%&&&&&**************&&&&&%%%$$$##@@++",
"++@@##$$%%%&&&&******************&&&&%%%$$##@@++",
"++@@##$$%%%&&&********************&&&%%%$$##@@++",
];

var Easter_Rainbow48x16_xpm =
[
"48 16 9 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FF7000",
"#	c #FBFF00",
"$	c #00FF13",
"%	c #00FFFF",
"&	c #3C00FF",
"*	c #E100FB",
"..................++++++++++++..................",
"..............+++++++++..+++++++++..............",
"...........+++++++@@@@@..@@@@@+++++++...........",
".........+++++@@@@@@@@@..@@@@@@@@@+++++.........",
".......++++@@@@@@@#####..#####@@@@@@@++++.......",
"......+++@@@@######..........######@@@@+++......",
".....++@@@@#######$..........$#######@@@@++.....",
"....++@@@#####$$$$$$$$$..$$$$$$$$$#####@@@++....",
"...++@@#####$$$$$$$%%%%..%%%%$$$$$$$#####@@++...",
"..++@@####$$$$$%%%%%%%%..%%%%%%%%$$$$$####@@++..",
"..+@@####$$$$%%%%%%&&&&..&&&&%%%%%%$$$$####@@+..",
".++@@###$$$%%%%%&&&&&&&..&&&&&&&%%%%%$$$###@@++.",
".+@@###$$$%%%%&&&&&&***..***&&&&&&%%%%$$$###@@+.",
"++@@##$$$%%%&&&&&******..******&&&&&%%%$$$##@@++",
"++@@##$$%%%&&&&********..********&&&&%%%$$##@@++",
"++@@##$$%%%&&&********************&&&%%%$$##@@++",
];

var Happy =
[
"48 16 3 1",
" 	c None",
".	c #FFFFFF",
"                                                ",
"                                                ",
" .   .   ...  ....  ....  .   .                 ",
" .   .  .   . .   . .   .  . .                  ",
" .....  ..... ....  ....    .                   ",
" .   .  .   . .     .       .                   ",
" .   .  .   . .     .       .                   ",
"                                                ",
"                                                ",
"           .....  ...   .... ..... ..... ....   ",
"           .     .   . .       .   .     .   .  ",
"           ....  .....  ...    .   ....  ....   ",
"           .     .   .     .   .   .     .  .   ",
"           ..... .   . ....    .   ..... .   .  ",
"                                                ",
"                                                ",
];

var Cross =
[
"48 16 3 1",
" 	c None", //transparency
//" 	c #000000",
".	c #888888",
"#	c #00FF22",
"                                                ",
"                                                ",
" .   .   ...  ....  ....  .   .                 ",
" .   .  .   . .   . .   .  . .                  ",
" .....  ..... ....  ....    .                   ",
" .   .  .   . .     .       .                   ",
" .   .  .   . .     .       .                   ",
"                               #                ",
"                               #                ",
"           .....  ...   ....#######..... ....   ",
"           .     .   . .       #   .     .   .  ",
"           ....  .....  ...    #   ....  ....   ",
"           .     .   .     .   #   .     .  .   ",
"           ..... .   . ....    #   ..... .   .  ",
"                                                ",
"                                                ",
];


function main()
{
//test1();
//test2();
//scope_test();
//test3();
    if (false) { solid(); hw.exit(0); }
    var img = xpm(Easter_Rainbow48x16_xpm);
    img.xy = xy_gdoor;
    //image(img, 15); hw.flush(); hw.exit();
    var img2 = xpm(Cross);
    img2.xy = xy_gdoor;
    for (;;)
    {
        for (var fade = 0; fade < 20; ++fade)
        {
            hw.gc(); //kludge: avoid interrupting SPI I/O (causes corrupted pixels)
            console.error("show image %d x %d  fade %d, heap %d ...", img[0].length, img.length, fade, hw.mem());
            hw.setall(0);
            if (fade < 16) image(img, 15 - fade);
            if (fade >= 14) image(img2, 3 * (fade - 14));
            hw.flush();
            setTimeout(thing,
            hw.msleep(500);
        }
    hw.msleep(3000);
    }
    //image(img, 0);
    hw.exit(0);

    for (;;)
    {
        hw.setall(0);
        for (var ofs = -12; ofs < 48-12; ++ofs)
        {
            image(img, ofs);
            hw.flush();
            hw.msleep(500);
        }
    }
}


function solid()
{
	rpio.setall(0);
	for (var i = 0; i < 80; ++i) rpio.setled(i, PURPLE);
//	for (var i = 0; i < 80; ++i) rpio.setled(i, PINK);
	rpio.flush();
	rpio.msleep(10);
}


function xpm(data)
{
	var ofs = 0;
	var colors = {}, pixels = [];
	var parts = data[ofs++].match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/);
	if (!parts || (parts.length != 4+1)) throw "bad xpm line 1: " + data[--ofs];
	var w = parseInt(parts[1]), h = parseInt(parts[2]), numcolors = parseInt(parts[3]), huh = parseInt(parts[4]);
	console.log("w %d, h %d, #c %d, ?? %d", w, h, numcolors, huh);
	for (var i = 0; i < numcolors; ++i)
	{
		parts = data[ofs++].match(/^(.)\s+c\s+([^ ]+)\s*$/);
		if (!parts || (parts.length != 2+1)) throw "bad xpm color[" + i + "]: " + data[--ofs];
		colors[parts[1].charCodeAt(0)] = (parts[2][0] == '#')? parseInt(parts[2].substr(1), 16): parts[2];
	}
	console.log("got %d colors:", numcolors, colors);
	for (var y = 0; y < h; ++y, ++ofs)
	{
		var row = pixels[y] = [];
		if (data[ofs].length != w) throw "bad xpm: row " + y + " has len " + data[ofs].length;
		for (var x = 0; x < w; ++x)
		{
			if (!(data[ofs].charCodeAt(x) in colors)) throw "bad xpm: unknown color code '" + data[ofs][x] + "' ofs " + x + " row " + y;
			row.push(colors[data[ofs].charCodeAt(x)]);
//2x			row.push(colors[data[ofs].charCodeAt(x)]);
		}
	}
	if (ofs < data.length) throw "bad xpm: junk at end";
	return pixels;
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
	console.error("show image %d x %d ...", img[0].length, img.length);
	rpio.setall(0);
	for (var y = 0; y < 16; ++y)
		for (var x = 0; x < 48; ++x)
		{
			rpio.setled(img.xy(x, y), [0xff0000, 0x00ff00, 0x0000ff][xofs % 3]);
			rpio.flush();
			rpio.msleep(50);
		}
}


function dim(color, fade)
{
	var r = (color >>> 16) & 0xff;
	var g = (color >>> 8) & 0xff;
	var b = (color >>> 0) & 0xff;
	r *= fade;
	g *= fade;
	b *= fade;
	r = Math.round(r) & 0xe0;
	g = Math.round(g) & 0xe0;
	b = Math.round(b) & 0xe0;
//	color = (r << 16) | (g << 8) | b;
//	return color;
	return {r: r, g: g, b: b};
}

function image(img, fade)
{
	fade /= 15;
//	console.error("show image %d x %d  at '%d...", img[0].length, img.length, fade);
	for (var y = 0; y < img.length; ++y)
		for (var x = 0; x < img[y].length; ++x)
		{
			var color = img[y][x]; //img.xy(x, y);
			if (typeof color != 'number') continue; //assume transparent
			color = dim(color, fade);
			color = (color.r << 16) | (color.g << 8) | color.b;
//			console.log("(%d, %d) 0x%s * %d => 0x%s", x, y, img[y][x].toString(16), fade * 15, color.toString(16));
			rpio.setled(img.xy(x, y), color);
		}
}

function image_ofs(img, xofs)
{
	console.error("show image %d x %d  at '%d...", img[0].length, img.length, xofs);
	for (var y = 0; y < img.length; ++y)
		for (var x = 0; x < img[y].length; ++x)
		{
			if ((x == 0) && (x + xofs > 0)) rpio.setled(img.xy(x + xofs - 1, y), 0);
			if ((x + xofs >= 0) && (x + xofs < 48)) rpio.setled(img.xy(x + xofs, y), img[y][x]);
//			if ((x == img[y].length - 1) && (x + xofs < 47)) rpio.setled(img.xy(x + xofs + 1, y), 0);
		}
	rpio.flush();
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

function seq(img)
{
    console.log("set img 48x16 png");
    img.src = 'file:///home/dj/Documents/ESOL-fog/graphics/Easter/Easter-He-Is-Risen48x16.png';
}

//eof
