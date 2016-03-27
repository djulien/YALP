//easter h/w defs

'use strict';


//const NUMLEDS = 256, NUMNULL = 1; //gift
const NUMLEDS = 48*16, NUMNULL = 1; //gdoor
//const NUMLEDS = 80, NUMNULL = 1; //columns
const SPI_CLOCK = 1 * (104 - 20);
//const SPI_CLOCK = 104 - 10; //1 * (104 - 20)

//example from https://github.com/jperkin/node-rpio
//https://mikaelleven.wordpress.com/2015/12/10/troubleshooting-spi-on-raspberry-pi-nodejs/
//for explanation of 3x bit rate with NRZ, see https://github.com/jgarff/rpi_ws281x

function rasp()
{
    chkroot();
    var rpio = require('rpio');
    init();
    console.log("sleep 10 sec ...");
    rpio.msleep(10 * 1000);
}


function chkroot()
{
	if (!global.gc) console.error("not running with gc exposed");
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
	rpio.spiSetClockDivider(SPI_CLOCK); //1 * (104 - 20)); //250 MHz / 104 ~= 2.4MHz => 3 * 24 == 72 bits  == 9 bytes / node WS281X; kludge: make it a little faster (timing is off)
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


module.exports.gc = (global && global.gc)? global.gc: function() { console.error("no gc"); }
module.exports.mem = (process && process.memoryUsage)? function() { return process.memoryUsage().heapUsed; }: function() { return -1; }
module.exports.exit = process.exit;

//eof
