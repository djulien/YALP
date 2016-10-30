'use strict';
//cat /proc/interrupts   before and after to check irq occurrences

const xpm = require('my-plugins/image/xpm');
const TIMING_FUD = 0; //-20;
const ALL_COLOR = 0; //0x80; //rgswap(0x9800c8); //rgswap(0xff4010); //0000f8;
//const ALL_COLOR = 0x0000f8;
//const ALL_COLOR = 0x00f800;
//const ALL_COLOR = 0xf80000;

//const NUMLEDS = 256, NUMNULL = 1; //gift
const NUMLEDS = 768, NUMNULL = 1; //gdoor

/* XPM */
const Ghost_left = new xpm(
[
"16 16 5 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FFFFFF",
"#	c #0000FF",
"................",
"......++++......",
"....++++++++....",
"...++++++++++...",
"..+@@++++@@+++..",
"..@@@@++@@@@++..",
"..##@@++##@@++..",
".+##@@++##@@+++.",
".++@@++++@@++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++.++++.++++.",
"..++...++...++..",
"................",
]);
const Ghost_left2 = new xpm(
[
"16 16 5 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FFFFFF",
"#	c #0000FF",
"................",
"......++++......",
"....++++++++....",
"...++++++++++...",
"..+@@++++@@+++..",
"..@@@@++@@@@++..",
"..##@@++##@@++..",
".+##@@++##@@+++.",
".++@@++++@@++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++.+++..+++.++.",
".+...++..++...+.",
"................",
]);

const Ghost_front = new xpm(
[
"16 16 5 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FFFFFF",
"#	c #0000FF",
"................",
"......++++......",
"....++++++++....",
"...++++++++++...",
"..++@@++++@@++..",
"..+@@@@++@@@@+..",
"..+@##@++@##@+..",
".++@##@++@##@++.",
".+++@@++++@@+++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++.++++.++++.",
"..++...++...++..",
"................",
]);
const Ghost_front2 = new xpm(
[
"16 16 5 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FFFFFF",
"#	c #0000FF",
"................",
"......++++......",
"....++++++++....",
"...++++++++++...",
"..++@@++++@@++..",
"..+@@@@++@@@@+..",
"..+@##@++@##@+..",
".++@##@++@##@++.",
".+++@@++++@@+++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++.+++..+++.++.",
".+...++..++...+.",
"................",
]);

const Ghost_right = new xpm(
[
"16 16 5 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FFFFFF",
"#	c #0000FF",
"................",
"......++++......",
"....++++++++....",
"...++++++++++...",
"..+++@@++++@@+..",
"..++@@@@++@@@@..",
"..++@@##++@@##..",
".+++@@##++@@##+.",
".++++@@++++@@++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++.++++.++++.",
"..++...++...++..",
"................",
]);
const Ghost_right2 = new xpm(
[
"16 16 5 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FFFFFF",
"#	c #0000FF",
"................",
"......++++......",
"....++++++++....",
"...++++++++++...",
"..+++@@++++@@+..",
"..++@@@@++@@@@..",
"..++@@##++@@##..",
".+++@@##++@@##+.",
".++++@@++++@@++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++++++++++++++.",
".++.+++..+++.++.",
".+...++..++...+.",
"................",
]);

/* XPM */
const Ghost_altfeet = new xpm(
[
"16 16 4 1",
" 	c None",
".	c #000000",
"+	c #FF0000",
"@	c #FFFFFF",
"                ",
"                ",
"                ",
"                ",
"                ",
"                ",
"                ",
"                ",
"                ",
"                ",
"                ",
"                ",
".++++++++++++++.",
".++.+++..+++.++.",
".+...++..++...+.",
"................",
]);


/* XPM */
/*
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
*/

//USflag.resize(USflag.width, USflag.height + 3);
//USflag.scroll(0, +2);

/*
const USflag_waves = [USflag.clone(), USflag.clone(), USflag.clone(), USflag.clone()];
for (var x = 0; x < USflag.width; ++x)
{
//    if (!(Math.floor(x / 6) & 1)) continue;
//    USflag_wave1.scroll1col(x, -1);
//    USflag_wave2.scroll1col(x, +1);
//    var wavey = [0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, +1, +1, +1, +1, +1][x];
    var wavey = [0, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, +1, +1, +1, +1, +1, 0, 0, 0][x];
//    USflag_wave1.scroll1col(x, wavey);
    for (var i = 0; i < USflag_waves.length; ++i)
        USflag_waves[i].scroll1col((x + i * 3) % USflag.width, wavey);
}
*/

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
//USflag.xy = USflag_wave1.xy = USflag_wave2.xy = xy_gdoor;
//for (var i = 0; i < USflag_waves.length; ++i) USflag_waves[i].xy = xy_gdoor;
Ghost_left.xy = xy_gdoor;
Ghost_left2.xy = xy_gdoor;
Ghost_front.xy = xy_gdoor;
Ghost_front2.xy = xy_gdoor;
Ghost_right.xy = xy_gdoor;
Ghost_right2.xy = xy_gdoor;
Ghost_altfeet.xy = xy_gdoor;

//console.log("ONE ONLY");
if (ALL_COLOR) all(ALL_COLOR);
/*
var wave = 0;
for (;;)
//for (var retry = 0; retry < 10; ++retry)
{
//	rpio.setall(0);
	for (var i = -12; i < 48-12; ++i)
	{
		rpio.setall(0);
		var ofs = 24-1 - i;
//ofs = 12; //24;
		for (var w = 0; w < 3; ++w) wave_fx(ofs);
//break;
//		rpio.msleep(500);
	}
//break;
}
*/
const rolleyes = [Ghost_front, Ghost_left, Ghost_front, Ghost_right];
const rolleyes2 = [Ghost_front2, Ghost_left2, Ghost_front2, Ghost_right2];
var colors = [0xff0000, 0x00ff00, 0x00ffff, 0xff4411, 0xff00ff]; //, 0x0000ff];
var roll_delay = 50 * Math.random();
for (;;)
{
	var sel = Math.round(10 * Math.random());
	var setcolor = {"+": colors[sel % colors.length]};
	Ghost_front.setpal(setcolor);
	Ghost_front2.setpal(setcolor);
	Ghost_left.setpal(setcolor);
	Ghost_left2.setpal(setcolor);
	Ghost_right.setpal(setcolor);
	Ghost_right2.setpal(setcolor);
	var l2r = (sel >= 5);
	for (var ofs = -12, parity = 0; ofs < 48 - 2; ++ofs, ++parity)
	{
		var oofs = l2r? ofs: 48-12-2-1 - ofs;
console.log("ofs %s", oofs);
		rpio.setall(0);
		image((parity & 1)? (l2r? Ghost_right2: Ghost_left2): (l2r? Ghost_right: Ghost_left), oofs, false);
		rpio.msleep(100);
//		if ((ofs != 24 - 16) && (ofs != 24 + 4)) continue;
		if (--roll_delay > 0) continue;
		for (var roll = (roll_delay > -0.5)? 16: 0; roll < 32; ++roll, ++parity)
		{
console.log("roll %s", roll);
			rpio.setall(0);
			image((parity & 1)? rolleyes2[(roll >> 2 + 2 * l2r) % 4]: rolleyes[(roll >> 2 + 2 * l2r) % 4], oofs, false);
			rpio.msleep(100);
		}
		roll_delay = 50 * Math.random();
	}
}


function all(color)
{
//	for (var retry = 0; retry < 10-8+8; ++retry)
	for (;;)
	{
		if (true)
		rpio.setall(color);
		else
		for (var pix = 0; pix < 80; ++pix)
			rpio.setled(pix, [0x00f800, 0xf8f8f8, 0x0000f8][rwb(pix)]);
		rpio.flush();
		rpio.msleep(100);
	}
	process.exit(0);

//	function rwb(i) { return 0; }
//	function rwb(i) { return i % 3; }
//	function rwb(i) { return Math.floor(i / 17) % 3; }
	function rwb(i) { return (i < 37)? 0: Math.floor((i - 37) / 7) % 3; }
}


function wave_fx(ofs)
{
	var img = Ghost_left;
/*
	switch (wave++ & 3)
	{
		case 1: img = USflag_wave1; break;
		case 3: img = USflag_wave2; break;
//		case 2: --ofs; rpio.setall(0); break;
	}
*/
	img = USflag_waves[wave++ % USflag_waves.length];
	image(img, ofs, false);
	rpio.msleep(100);
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

function image(img, xofs, debug)
{
	if (debug) console.error("show image %d x %d  at '%d...", img.width, img.height, xofs);
	for (var y = 0; y < img.height; ++y)
		for (var x = 0; x < img.width; ++x)
		{
	            var color = img.palette[img.colorinx[y][x]];
	            if (typeof color != 'number') color = 0; //bkg
//        	    else color = png.color((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 
			if ((x == 0) && (x + xofs > 0)) rpio.setled(img.xy(x + xofs - 1, y), 0);
			if ((x + xofs >= 0) && (x + xofs < 48)) rpio.setled(img.xy(x + xofs, y), rgswap(color));
//			if ((x == img[y].length - 1) && (x + xofs < 47)) rpio.setled(img.xy(x + xofs + 1, y), 0);
		}
	rpio.flush();
}

function rgswap(color)
{
    color >>>= 0;
    return ((color & 0xff0000ff) | ((color >> 8) & 0xff00) | ((color << 8) & 0xff0000)) >>> 0; //force to uint32
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
	rpio.spiSetClockDivider(104 + TIMING_FUD); //250 MHz / 104 ~= 2.4MHz => 3 * 24 == 72 bits  == 9 bytes / node WS281X; kludge: make it a little faster (timing is off)
	rpio.spiSetDataMode(0); //CPOL (clk polarity) 0, CPHA (clk phase) 0; see http://dlnware.com/theory/SPI-Transfer-Modes

	rpio.txbuf = new Buffer(usec2bytes(LEADER) + nodes2bytes(NUMLEDS + NUMNULL) + usec2bytes(TRAILER)); //6 nodes, 24 bits, 3 cycles/bit + 50 usec trailer
	rpio.txbuf.fill(0); //set trailer to 0s
	console.log("buf len %d = %d + %d + %d", rpio.txbuf.length, usec2bytes(LEADER), nodes2bytes(NUMLEDS + NUMNULL), usec2bytes(TRAILER));
	var count = 0;
	rpio.setall = function(color)
	{
//		console.log("set all ...", count++);
		for (var i = 0; i < NUMLEDS; ++i) this.setled(i, color);
//		console.log("... set all");
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
