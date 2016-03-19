'use strict';

//example from https://github.com/jperkin/node-rpio
//https://mikaelleven.wordpress.com/2015/12/10/troubleshooting-spi-on-raspberry-pi-nodejs/
//for explanation of 3x bit rate with NRZ, see https://github.com/jgarff/rpi_ws281x

chkroot();
var rpio = require('rpio');
init_fake();
//test1();
//test2();
scope_test();
test3();


function chkroot()
{
//	if (process.getuid) console.log(`Current uid: ${process.getuid()}`);
//	else console.log("can't check uid");
	var uid = parseInt("0" + process.env.SUDO_UID);
//	if (uid) process.setuid(uid);
//	console.log("uid", uid);
	if (uid) { console.log("sudo okay"); return; }
	console.error("please run with 'sudo'");
	process.exit(1);
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
	test3b(tx);

	rpio.spiEnd();
}


function fx(tx)
{
	const colors = [0x00ff00, 0xff0000, 0x0000ff, 0xffff00, 0x00ffff, 0xff00ff, 0xffffff];
//	for (var loop = 0; loop < 3; ++loop)
//		for (var c = 0; c < colors.length; ++c)
	const c = 2; //0;
//	console.log("fx start");
	rpio.scope();
	for (var n = 0; n <= 6; ++n)
	{
n = 1;
		if (n < 6) tx.setled(n % 6, colors[c]);
		if (n) tx.setled((n - 1 + 6) % 6, 0);
		rpio.spiWrite(tx, tx.length);
break;
		rpio.msleep(50); //100 * 10);
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



function test3b(tx)
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
		fx(tx);
//		rpio.msleep(10); //1000);
		continue;

//		console.log("pir " + PIR + " is " + (rpio.read(PIR)? "on": "off"));
		var current = rpio.read(PIR);
		if (current && !previous) fx(tx);
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

function init()
{
	const NUMLEDS = 1; //6;
	const LEADER = 0; //15; //kludge: need to delay start
	const TRAILER = 0; //150;
//	rpio.init({gpiomem: false}); //use /dev/mem for SPI
	rpio.spiBegin(); //set GPIO7-GPIO11 to SPI mode; calls .init()
	rpio.spiChipSelect(0); //TODO: is this needed?
	rpio.spiSetClockDivider(10 * (104 - 20)); //250 MHz / 104 ~= 2.4MHz => 3 * 24 == 72 bits  == 9 bytes / node WS281X; kludge: make it a little faster (timing is off)
	rpio.spiSetDataMode(0); //CPOL (clk polarity) 0, CPHA (clk phase) 0; see http://dlnware.com/theory/SPI-Transfer-Modes

	rpio.txbuf = new Buffer(LEADER + NUMLEDS * 24 * 3 / 8 + 3 * TRAILER / 1.25 / 8); //6 nodes, 24 bits, 3 cycles/bit + 50 usec trailer
	rpio.txbuf.fill(0); //set trailer to 0s
	console.log("buf len %d = %d + %d", rpio.txbuf.length, NUMLEDS * 24 * 3 / 8, 3 * TRAILER / 1.25 / 8);
	rpio.setled = function(which, color)
	{
//if (which >= 2) return;
		which *= 9; //9 bytes / node
		which += LEADER;
		if (which >= this.txbuf.length) throw "bad index: " + (which / 9);
//		var r = (color >>> 16) & 0xFF;
//		var g = (color >>> 8) & 0xFF;
//		var b = color & 0xFF;
//turn on red/green/blue bits:
		for (var i = 0; i < 3; ++i, which += 3, color <<= 8, color >>>= 0)
		{
//console.log("color[%d]: %s", i, (color & 0xff0000).toString(16));
//set beginning 1/3 of each bit and clear prev bit:
			this.txbuf[which + 0] = 0b10010010;
			this.txbuf[which + 1] = 0b01001001;
			this.txbuf[which + 2] = 0b00100100;
			if (color & 0x800000) this.txbuf[which + 0] |= 0b01000000;
			if (color & 0x400000) this.txbuf[which + 0] |= 0b00001000;
			if (color & 0x200000) this.txbuf[which + 0] |= 0b00000001;
			if (color & 0x100000) this.txbuf[which + 1] |= 0b00100000;
			if (color & 0x080000) this.txbuf[which + 1] |= 0b00000100;
			if (color & 0x040000) this.txbuf[which + 2] |= 0b10000000;
			if (color & 0x020000) this.txbuf[which + 2] |= 0b00010000;
			if (color & 0x010000) this.txbuf[which + 2] |= 0b00000010;
		}
	}
	rpio.flush = function()
	{
		this.spiWrite(this.txbuf, this.txbuf.length);
	}
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
