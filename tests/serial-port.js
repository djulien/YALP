'use strict';

require('colors');
var Elapsed = require('my-plugins/utils/elapsed');
//console.log(JSON.stringify(Elapsed));
/*var sprintf =*/ require('sprintf.js');

//from https://github.com/voodootikigod/node-serialport
var SerialPort = require("serialport"); //.SerialPort;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Renard protocol helpers (fluent)

var RenXt = require('my-plugins/hw/RenXt');
var Struct = require('struct'); //https://github.com/xdenser/node-struct
var DataView = require('buffer-dataview'); //https://github.com/TooTallNate/node-buffer-dataview

//TODO: move to RenXt.js
function RenXtBuffer(opts)
{
    if (!(this instanceof RenXtBuffer)) return new RenXtBuffer(opts); //{port, buflen}

    this.port = opts.port;
    this.buffer = new Buffer(opts.buflen || 4000); //NOTE: ignore FPS restrictions to simplify special cases such as initial enum
    this.dataview = new DataView(this.buffer);
    this.stats_opc = new Uint16Array(256);
    this.port.on('data', function(data) //collect incoming data
    {
        this.latest = this.elapsed.now;
        if (Buffer.isBuffer(data)) { data.copy(this.buffer, this.rdlen); this.rdlen += data.byteLength; }
        else { this.buffer.write(data, this.rdlen, data.length); this.rdlen += data.length; }
    }.bind(this));
}


//if (sport.rewind) console.log("rewind was already there".red);
//NOTE: rewind() must be called before doing I/O
RenXtBuffer.prototype.rewind = function()
{
    this.rdofs = this.rdlen = this.wrlen = 0;
//    if (!this.buffer) this.buffer = new Buffer(4000); //NOTE: ignore FPS restrictions to simplify special cases such as initial enum
//    if (!this.dataview) this.dataview = new DataView(this.buffer);
//    if (!this.stats_opc) this.stats_opc = new Uint16Array(256);
    this.buffer.fill(0xee); //for easier debug
    this.stats_opc.fill(0);
    return this; //fluent
}

RenXtBuffer.prototype.hasroom = function(len)
{
    return (this.wrlen + len <= this.buffer.byteLength);
}

RenXtBuffer.prototype.isempty = function(len)
{
    return (this.rdofs + (len || 0) >= this.rdlen);
}

//if (sport.flush) console.log("flush was already there".red);
RenXtBuffer.prototype.flush = function(cb)
{
//write + drain:
    this.elapsed = new Elapsed();
    if (!cb) cb = function(err) { return err; }
    if (!this.wrlen) return process.nextTick(function() { cb(); }); //this.port.write_drain(this.buffer, this.wrlen);
    var outbuf = (this.wrlen < this.buffer.byteLength)? this.buffer.slice(0, this.wrlen): this.buffer; //kludge: no len param to write(), so trim buffer instead
    if (this.wrlen > this.buffer.byteLength) console.log("out buf overflow: %d (max %d)".red, this.wrlen, this.buffer.byteLength);
//    for (var ofs = 0; ofs < this.wrlen; ofs += 64)
//        console.log("write[%d/%d] ", ofs, this.wrlen, this.buffer.slice(ofs, 64));
    console.log("write %d ", this.wrlen, outbuf);
    return this.port.write(outbuf, function(err, results)
    {
//        console.log(typeof outbuf);
        var outdesc = outbuf.length + ':"' + ((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')).replace(/\n/g, "\\n") + '"';
        if (err) return cb(err); //{ console.log('write "%s" err after %s: '.red, outdesc, this.elapsed.scaled(), err); return cb(err); }
        console.log('write "%s" ok after %s; results %d:'.green, outdesc, this.elapsed.scaled(), results.length, results);
        this.port.drain(function(err)
        {
            if (err) return cb(err); //{ console.log('drain %s err '.red + err, outdesc); return cb(err); }
            console.log("drain %s completed after %s".green, outdesc, this.elapsed.scaled());
            setTimeout(function() //return data should be no more than 1 char time (44 usec) per controller, but allow extra due to USB timing
            {
                console.log("%d bytes avail, latest came at %d msec", this.rdlen, this.latest);
                console.log(this.buffer.slice(0, this.rdlen));
                return cb();
            }.bind(this), 1000); //should only need to wait 10 msec max for response, but USB latency is taking longer; //1000 * (1 + 8 + 1 + 1) / 242500 * 16
        }.bind(this));
    }.bind(this));
}

RenXtBuffer.prototype.emit_buf = function(buf, len)
{
//TODO: use buffer.indexOf to scan for special chars, then buffer.copy?
    for (var ofs = 0; ofs < len; ++ofs) this.emit_byte(buf[ofs]); //copy byte-by-byte to handle special chars and padding; escapes will be inserted as necessary
    return this; //fluent
}

RenXtBuffer.prototype.emit_rawbuf = function(buf, len)
{
//    for (var ofs = 0; ofs < len; ++ofs) this.emit_raw(values[ofs]); //copy byte-by-byte to handle special chars and padding; caller is responsible for escapes
    len = len || buf.byteLength || buf.length || 0;
    /*if (this.wrlen + len <= this.buffer.byteLength)*/ buf.copy(this.buffer, this.wrlen, 0, len);
    this.wrlen += len;
    return this; //fluent
}

RenXtBuffer.prototype.emit_rgb = function(rgb) //ensure correct byte order
{
    this.emit_byte(rgb >> 16); //RGB2R(rgb));
    this.emit_byte(rgb >> 8); //RGB2G(rgb));
    this.emit_byte(rgb); //RGB2B(rgb));
//    this.buffer.writeUInt32BE(rgb << 8, ofs); ofs += 3;
    return this; //fluent
}

RenXtBuffer.prototype.emit_uint32 = function(val) //ensure correct byte order
{
//NOTE: can't use raw 32 because val might contain special bytes that need to be escaped
    this.emit_byte(val >> 24); //val / 0x1000000);
    this.emit_byte(val >> 16); //val / 0x10000);
    this.emit_byte(val >> 8); //val / 0x100);
    this.emit_byte(val); //val);
//    this.buffer.writeUInt32BE(val, ofs); ofs += 4;
    return this; //fluent
}

RenXtBuffer.prototype.emit_uint16 = function(val, count) //ensure correct byte order
{
    if (typeof count === 'undefined') count = 1;
    while (count-- > 0)
    {
        this.emit_byte(val >> 8); /// 0x100);
        this.emit_byte(val); // % 0x100);
    }
    return this; //fluent
}

RenXtBuffer.prototype.emit_uint16_raw = function(val, count) //ensure correct byte order
{
//    emit_raw(val / 0x100);
//    emit_raw(val % 0x100);
    if (typeof count === 'undefined') count = 1;
    while (count-- > 0)
    {
        /*if (this.wrlen + 2 <= this.buffer.byteLength)*/ this.buffer.writeUInt16BE(val, this.wrlen);
        this.wrlen += 2;
    }
    return this; //fluent
}

RenXtBuffer.prototype.emit_opc = function(value, count)
{
    this.stats_opc[value] += count || 1;
    this.emit_byte(value, count);
    return this; //fluent
}

RenXtBuffer.prototype.pad = function(count)
{
    this.since_pad = 0; //avoid recursion
    this.emit_raw(RenXt.RENARD_PAD, count);
//    stats_opc[RENARD_PAD] += count || 1;
//    debug(10, "pad @'0x%x, @rate %d", used, pad_rate);
    return this; //fluent
}

//if (sport.emit) console.log("emit was already there".red);
RenXtBuffer.prototype.emit_byte = function(value, count)
{
    if (RenXt.IsRenardSpecial(value)) this.emit_uint16_raw((RenXt.RENARD_ESCAPE << 8) | (value & 0xFF), count);
//            ++stats_opc[RENARD_ESCAPE];
//            if (doing_opcode && doing_opcode->enclen) ++doing_opcode->enclen; //include extra esc codes in count
    else this.emit_raw(value, count);
    return this; //fluent
}

//if (sport.emit_raw) console.log("emit_raw was already there".red);
RenXtBuffer.prototype.emit_raw = function(value, count)
{
    if (typeof count === 'undefined') count = 1;
    while (count -- > 0)
    {
//            debug(90, "%semit_raw 0x.6%x to ofs %d", (used < frbuf.size())? "": "not-", value, used);
//        if (used < frbuf.size()) frbuf[used++] = value;  //track length regardless of overflow
//        else ++used; //keep track of overflow
//        ++since_pad;
        /*if (this.wrlen < this.buffer.byteLength)*/ this.buffer[this.wrlen++] = value;
//seems okay without        else ++this.wrlen; //keep track of overflow length
//        PrevByte = ((value != RENARD_ESCAPE) || (PrevByte != RENARD_ESCAPE))? value: 0; //kludge: treat escaped escape as a null for pad check below
//#ifdef RENARD_PAD //explicit padding
//        if (pad_rate && (since_pad >= pad_rate) /* !(used % pad_rate)*/)
//            if (PrevByte != RENARD_ESCAPE) pad(); //CAUTION: recursive
//#endif
    }
    return this; //fluent
}

RenXtBuffer.prototype.readreq = function(ctlr_adrs, mem_adrs, len)
{
//    if (!this.hasroom(len)) return;
    this
        .emit_raw(RenXt.RENARD_SYNC)
        .emit_raw(ctlr_adrs)
        .emit_opc(RenXt.READ_REG) //read controller memory
        .emit_uint16(mem_adrs)
//#ifdef WANT_DEBUG
// #pragma message WARN("TEMP: hard-coded response")
//        if (ctlr < 2) out.emit('A', 2 * len); //placeholder for escaped bytes
//        else
//#endif // WANT_DEBUG
        .emit_byte(RenXt.NOOP, Math.floor(len * 1.2)); //placeholder bytes; allow for 20% esc codes
    return this; //fluent
}


RenXtBuffer.prototype.deque_sync = function(skip)
{
//    debug(99, "deque(skip %d): used %d, rdofs 0x%x, buf 0x%x", skip, used, rdofs, (rdofs < frbuf.size())? frbuf[rdofs]: -1);
    if (!skip) return (this.deque_raw() == RenXt.RENARD_SYNC);
    for (;;)
    {
        if ((this.rdofs + 1 < this.rdlen) && (this.buffer[this.rdofs] == RenXt.RENARD_ESCAPE)) { this.rdofs += 2; continue; } //not a real Sync
        if (this.deque_raw() != RenXt.RENARD_SYNC) continue;
        while ((this.rdofs < this.rdlen) && (this.buffer[this.rdofs] == RenXt.RENARD_SYNC)) ++this.rdofs; //consume multiple Sync if there
        return true;
    }
}

RenXtBuffer.prototype.deque_uint16 = function() //ensure correct byte order
{
    var retval = this.deque() << 8; //big endian
    retval |= this.deque();
    return retval;
}

RenXtBuffer.prototype.deque_buf = function(len)
{
    var retbuf = new Buffer(len);
    for (var ofs = 0; ofs < len; ++ofs)
        retbuf[ofs] = this.deque(); //copy byte-by-byte to handle special chars and padding
    return retbuf;
}

RenXtBuffer.prototype.deque = function()
{
    if ((this.rdofs < this.rdlen) && (this.buffer[this.rdofs] == RenXt.RENARD_ESCAPE)) ++this.rdofs;
    return this.deque_raw();
}

RenXtBuffer.prototype.deque_raw = function()
{
    if (this.rdofs < this.rdlen) return this.PrevByte = this.buffer[this.rdofs++];
    return RenXt.RENARD_SYNC; //simulate Sync if past end of buffer
}

RenXtBuffer.prototype.deque_readreq = function(ctlr_adrs, mem_adrs, len)
{
    var uint8, uint16;
    for (;;)
    {
        if (this.isempty()) return false;
        if (!this.deque_sync(true)) { console.log("no sync for ctlr 0x%s @'0x%s", ctlr_adrs.toString(16), this.rdofs.toString(16)); return false; } //skip multiple syncs (useful for loopback test)
        uint8 = this.deque();
        if ((uint8 & 0x7F) != ctlr_adrs) { console.log("wrong controller: got 0x%s vs expected 0x%s @'0x%s", uint8.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
        else if (uint8 != (ctlr_adrs | 0x80)) { console.log("no response from controller 0x%s @'0x%s", ctlr_adrs.toString(16), this.rdofs.toString(16)); return false; } //continue; }
        uint8 = this.deque();
        if (uint8 != RenXt.READ_REG) { console.log("wrong command: got 0x%s vs. expected 0x%s for ctlr 0x%s @'0x%s", uint8.toString(16), RenXt.READ_REG.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
        uint16 = this.deque_uint16();
        if (uint16 != mem_adrs) { console.log("wrong address: got 0x%s vs. expected 0x%s for ctlr 0x%s @'0x%s", uint16.toString(16), mem_adrs.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
        break;
    }
//    while (len -- > 0) *(((byte*)buf)++) = out.deque();
    return this.deque_buf(Math.floor(len * 1.2));
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////


var inherits = require('inherits');
function RenXtSerialPort(opts) //path, options, openImmediately, callback)
{
    if (!(this instanceof RenXtSerialPort)) return new RenXtSerialPort.apply(this, arguments); //[].prototype.sliceopts);
    SerialPort.SerialPort.apply(this, arguments);

    this.RenXt = new RenXtBuffer({port: this, buflen: 4000}); //CAUTION: create a namespace to avoid overwriting base class members (flush, emit, etc.)
}
inherits(RenXtSerialPort, SerialPort.SerialPort);


var elap = new Elapsed();
SerialPort.list(function (err, ports)
{
    if (err) console.log("ERR:".red, err);
    else console.log("found %d ports after %s:".cyan, ports.length, elap.scaled());
  ports.forEach(function(port, inx)
  {
    console.log("found port[%d]:".cyan, inx, port.comName, port.manufacturer, port.pnpId);
  });
});


//NOTE: buffer size can be larger than 1 frame to allow special I/O such as enum; NOTE: bufferSize defaults to 64K except on Windows
//var sport = new /*SerialPort.*/ RenXtSerialPort("/dev/ttyUSB0", { baudrate: 242500, dataBits: 8, parity: 'none', stopBits: 1, buffersize: 2048*10, parser: SerialPort.parsers.raw, xparser: SerialPort.parsers.readline("\n") }, function(err)
//{
//    if (err) console.log("open err: ".red + err);
//    else console.log("opened after %s".green, elap.scaled());
//});
var sport = new /*SerialPort.*/ RenXtSerialPort("/dev/ttyUSB0", { baudrate: 242500, dataBits: 8, parity: 'none', stopBits: 1, buffersize: 2048*10 }, false); // this is the openImmediately flag [default is true]
//setTimeout(function() { serialPort.open(); }, 4000);

//status tracking (for debug):
sport.on("open", function () { console.log('opened %s'.green, this.path); }.bind(sport));
//.flush(cb(err)) data received but not read
//sport.on('data', function(data) { console.log('data received on %s %d: "%s"'.blue, this.path, data.length, data.toString('utf8').replace(/\n/g, "\\n")); }.bind(sport));
sport.on('error', function(err) { console.log("ERR on %s: ".red, this.path, err); }.bind(sport));
sport.on('close', function() { console.log("closed %s".cyan); }.bind(sport));
sport.on('disconnect', function() { console.log("disconnected %s".red, this.path); }.bind(sport));

/*
//add a write+drain method:
sport.write_drain = function(outbuf, outlen, cb)
{
    var elapsed = new Elapsed();
    if (typeof outlen === 'function') { cb = outlen; outlen = undefined; }
    if (!cb) cb = function(err) { return err; }
    if (/-*(typeof outlen !== 'undefined') &&*-/ (outlen < outbuf.byteLength)) outbuf = outbuf.slice(0, outlen); //kludge: no len param to write(), so trim buffer instead
    return this.write(outbuf, function(err, results)
    {
//        console.log(typeof outbuf);
        var outdesc = outbuf.length + ':"' + ((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')).replace(/\n/g, "\\n") + '"';
        if (err) { console.log('write "%s" err after %s: '.red, outdesc, elapsed.scaled(), err); return cb(err); }
        else console.log('write "%s" ok after %s; results %d:'.green, outdesc, elapsed.scaled(), results.length, results);
        this.drain(function(err)
        {
            if (err) { console.log('drain %s err '.red + err, outdesc); return cb(err); }
            console.log("drain %s completed after %s".green, outdesc, elapsed.scaled());
            return cb();
        }.bind(this));
    }.bind(this));
}; //.bind(sport);
*/

setTimeout(function() { var el = new Elapsed(); sport.close(function(err)
{
    if (err) console.log("close err: ".red + err);
    else console.log("closed after %s".green, el.scaled());
}); }, 15000);

//eof


/* OLD//from https://github.com/bminer/trivial-port/blob/master/test.js
//CAUTION: messes up xterm afterward
var util = require('util');
var SerialPort = require("trivial-port");
//to list ports: dmesg | grep tty
var sport = new SerialPort({"baudRate": 115200, "serialPort": "/dev/ttyUSB0"});
//console.log(util.inspect(port));
sport.initialize();
sport.on("data", function(chunk)
{
    console.log("RX:", chunk.toString("ascii"));
});
sport.write("AT+CSQ\r\n");
setTimeout(function()
{
    console.log("Writing message again");
    sport.write("ATZ\r\n");
}, 2000);
setTimeout(function()
{
    console.log("Closing");
    sport.close();
}, 5000);
*/


function test1(sp)
{
  sp.outSync("ls\n");
  sp.outSync("echo hello there;\n");
  var buf = new Buffer(2000);
  buf.fill(0x5a);
  sp.outSync(buf);
}


setTimeout(function()
{
    var elap = new Elapsed();
    sport.open(function(err)
    {
        console.log("open took %s, err? %s".yellow, elap.scaled(), err);
        if (err) return;
        if (!err) test2(sport);
    });
}, 1000);

function test2(port)
{

//CAUTION: must match firmware manifest; 14-bit words => uint16
    var manif = Struct()
        .array('stamp', 3, 'word16Ule') //word48Ube('stamp') //magic/stamp; "RenXt\0" == 2965, 3758, 3A00
        .word16Ule('version') //firmware version#
        .word16Ule('device') //device code (which uController)
        .word16Ule('pins') //#I/O pins available for nodes, which I/O pin for series nodes
        .word16Ule('iotypes') //which node types are supported
        .word16Ule('dimsteps') //#steps (resolution) of dimming curve
        .word16Ule('ram') //total RAM available for node + palette data
        .array('max_baud', 2, 'word16Ule') //word32Ube('max_baud') //max baud rate (won't fit in 14 bits); little endian
        .array('clock', 2, 'word16Ule') //word32Ube('clock') //ext clock freq (if any); little endian
        .word16Ule('config') //config bits/ccp options
        .allocate();

    function A2(char1, char2) { return (((char1.charCodeAt(0)) << 7) | (char2.charCodeAt(0))); }

    var nbram = Struct()
        .word8Ule('demo_var') //demo/test var
        .word8Ule('demo_pattern')
        .word8Ule('junk') //last_prerr; //last protocol error
        .word8Ule('state') //misc state bits
// #define UNUSED_BIT0_ADDR  (8 * MISCBITS_ADDR + 0)
// #define WANT_ECHO_ADDR  (8 * MISCBITS_ADDR + 1)
// #define IO_BUSY_ADDR /*ZC_STABLE_ADDR*/  (8 * MISCBITS_ADDR + 2)
// #define PROTOCOL_LISTEN_ADDR  (8 * MISCBITS_ADDR + 3) //whether to rcv protocol byte
        .word8Ule('adrs') //config; controller address
        .word8Ule('node_config') //config; currently active node type and packing
// #define NODETYPE_MASK  0xF0 //node type in upper nibble
// #define PARALLEL_NODES_ADDR  (8 * NODE_CONFIG_ADDR + 4) //bottom bit of node type indicates series vs. parallel for smart nodes
// #define COMMON_CATHODE_ADDR  (8 * NODE_CONFIG_ADDR + 4) //bottom bit of node type indicates common anode vs. cathode for dumb nodes
// #define UNUSED_NODECONFIG_BIT3_ADDR  (8 * NODE_CONFIG_ADDR + 3)
// #define UNUSED_NODECONFIG_BIT2_ADDR  (8 * NODE_CONFIG_ADDR + 2)
// #define BPP_MASK  0x03 //bottom 2 bits: 0x00 == 4 bpp, 0x01 == 1 bpp, 0x02 == 2 bpp, 0x03 == reserved for either 6 bpp or variable (tbd)
        .word8Ule('node_bytes') //config; currently active node data size (scaled)
        .word24Ule('iochars') //stats; 24-bit counter allows minimum of 11 minutes at 250 kbaud sustained
        .word8Ule('protocol_errors') //stats; 4-bit counter in upper nibble(doesn't wrap), latest reason in lower nibble
        .word8Ule('ioerrs') //stats; 8-bit counter (doesn't wrap)
        .array('more_junk', 3+1, 'word8Ule') //stack frame and temps
        .allocate();

    var eedata = Struct()
        .word8Ule('node_config') //default node type + packing
        .word8Ule('node_bytes') //default node data size
        .word8Ule('adrs') //current controller address
        .word24Ule('bkg') //demo bkg color
//        uint8_t strlen; //demo string length
        .word8Ule('demo_pattern') //demo/test pattern
        .chars('name', 24) //prop/controller user-assigned name
        .allocate();

    port.RenXt
        .rewind()
        .emit_raw(RenXt.RENARD_SYNC, 5); //allow controllers to auto-detect baud rate or stop what
    var limit = 0;
    for (var adrs = 1; adrs <  RenXt.RENARD_SPECIAL_MIN; ++adrs) //NOTE: buffer can be as large as needed since there is no FPS limitation
    {
        var wrlen = -port.RenXt.wrlen;
        port.RenXt
            .readreq(adrs, RenXt.INROM(RenXt.MANIF_ADDR), manif.length())
            .readreq(adrs, RenXt.INRAM(RenXt.WORKING_REGS + nbram.getOffset('state')), nbram.getOffset('more_junk') - nbram.getOffset('state')) //nbram.length() - 3 - 4)
            .readreq(adrs, RenXt.INEEPROM(0), eedata.length());
        wrlen += port.RenXt.wrlen;
        if (!port.RenXt.hasroom(wrlen)) break; //not room for another
    }
    console.log("queried for %d props".yellow, adrs);
    var ctlrs = [];
    port.RenXt
        .emit_raw(RenXt.RENARD_SYNC) //send out a final sync to mark end of last packet
        .flush(function(err)
        {
            if (err) { console.log("error: " + err); return; }
//            for (var i = 0; i < 160; i += 16) console.log("buf[%d]: %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s %s", i, port.RenXt.buffer[i].toString(16), port.RenXt.buffer[i+1].toString(16), port.RenXt.buffer[i+2].toString(16), port.RenXt.buffer[i+3].toString(16), port.RenXt.buffer[i+4].toString(16), port.RenXt.buffer[i+5].toString(16), port.RenXt.buffer[i+6].toString(16), port.RenXt.buffer[i+7].toString(16), port.RenXt.buffer[i+8].toString(16), port.RenXt.buffer[i+9].toString(16), port.RenXt.buffer[i+10].toString(16), port.RenXt.buffer[i+11].toString(16), port.RenXt.buffer[i+12].toString(16), port.RenXt.buffer[i+13].toString(16), port.RenXt.buffer[i+14].toString(16), port.RenXt.buffer[i+15].toString(16));
            console.log("write+drain+delay done: %d bytes available", port.RenXt.rdlen);
            for (var adrs = 1; adrs <  RenXt.RENARD_SPECIAL_MIN; ++adrs) //NOTE: buffer can be as large as needed since there is no FPS limitation
            {
                var why = get_response(adrs);
                if (why < 1) { console.log("why: %d", why); break; }
                var newctlr =
                {
                    address: adrs,
                    uctlr_type: manif.fields.device,
                    fwver: manif.fields.version,
                    pins: manif.fields.pins,
                    ram: manif.fields.ram,
                    max_baud: manif.fields.max_baud[0] + 0x1000 * manif.fields.max_baud[1],
                    clock: manif.fields.clock[0] + 0x1000 * manif.fields.clock[1],
                    iochars: nbram.fields.iochars, //nbram.iochars.bytes[0] + 256 * nbram.iochars.bytes[1] + 256 * 256 * nbram.iochars.bytes[2];
                    protoerrs: nbram.fields.protocol_errors, //stats; 8-bit counter (doesn't wrap)
//            ctlrs->last_prerr = nbram.last_prerr;
                    ioerrs: nbram.fields.ioerrs, //stats; 8-bit counter (doesn't wrap)
//    debug(1, "baud: 0x%x 0x%x, clock 0x%x 0x%x", manif.max_baud[0], manif.max_baud[1], manif.clock[0], manif.clock[1]);
                    node_type: nbram.fields.node_config >> 4,
                    num_nodes: nbram.fields.node_bytes * 2, //* 4; //divup(manif.ram, 256); //2 nodes/byte (4 bpp)
                    name: '',
                };
                if (manif.fields.ram > 256) newctlr.num_nodes *= 2; //byte pairs
                if (manif.fields.ram > 512) newctlr.num_nodes *= 2; //byte quads
                if ((eedata.fields.name.charCodeAt(0) == 0xFF) || !eedata.fields.name.charCodeAt(0)) newctlr.name = "(no name)";
                else for (var i = 0; i < 24; ++i)
                    if (!eedata.fields.name.charCodeAt(i)) break;
                    else newctlr.name += eedata.fields.name[i];
                if (!newctlr.name) newctlr.name = "prop[" + ctlrs.length + "]";
                ctlrs.push(newctlr);
            }
            console.log("%d props/controllers found:", ctlrs.length);
            console.log("adrs  proc  firm pins ram baud clk ntype nodes     #i/o ser per name\n");
            const device_codes = {0x28: "12F1840", 0x68: "16F688", 0x85: "16F1825", 0x87: "16F1827"};
            const NodeTypes = ["Null ", "FrPan", "PWM- ", "PWM+ ", "Chpl-", "Chpl+", "GECE!", "GECE=", "??8??", "??9??", "281X!", "281X=", "??12?", "??13?", "??14?", "??15?"];
            ctlrs.forEach(function(ctlr, inx)
            {
//                console.log(ctlr);
                var ramscale = (ctlr.ram <= 256)? 1: (ctlr.ram <= 512)? 2: 4, ramdesc = ('   ' + ((ctlr.ram < 1000)? ctlr.ram: Math.round(ctlr.ram, 1024) + 'K')).substr(-3);
                var devdesc = ('      ' + (device_codes[ctlr.uctlr_type] || "UNKN")).substr(-6); //truncate if too long
                console.log(sprintf("0x%.2x%7s %d.%.2d %x+%x %s %3.0fk %2.0fM %s %5d%9d %3d %x:%x %s\n", /*i,*/ ctlr.address, devdesc, ctlr.fwver / 0x10, ctlr.fwver % 0x10, Math.min(ctlr.pins >> 8, 15), ctlr.pins & 0xff, ramdesc, Math.floor(ctlr.max_baud / 1000), Math.floor(ctlr.clock / 1000000), NodeTypes[ctlr.node_type & 0xF], ctlr.num_nodes, ctlr.iochars, ctlr.ioerrs, ctlr.protoerrs / 0x10, ctlr.protoerrs % 0x10, ctlr.name));
            });
        });

    function get_response(adrs)
    {
        var retbuf;

        if (port.RenXt.isempty()) return 0;
        retbuf = port.RenXt.deque_readreq(adrs, RenXt.INROM(RenXt.MANIF_ADDR), manif.length());
        if (!retbuf) return -1;
        retbuf.copy(manif.buffer());
        if (!manif.fields.device) return -2;
//        console.log("stamp %s %s %s vs. %s %s %s", manif.fields.stamp[0].toString(16), manif.fields.stamp[1].toString(16), manif.fields.stamp[2].toString(16), A2('R', 'e').toString(16), A2('n', 'X').toString(16), A2('t', '\0').toString(16));
        if ((manif.fields.stamp[0] != A2('R', 'e')) || (manif.fields.stamp[1] != A2('n', 'X')) || (manif.fields.stamp[2] != A2('t', '\0'))) return -3;
        retbuf = port.RenXt.deque_readreq(adrs, RenXt.INRAM(RenXt.WORKING_REGS + nbram.getOffset('state')), nbram.getOffset('more_junk') - nbram.getOffset('state')); //nbram.length() - 3 - 4)
        if (!retbuf) return -4;
        retbuf.copy(nbram.buffer(), nbram.getOffset('state'));
        retbuf = port.RenXt.deque_readreq(adrs, RenXt.INEEPROM(0), eedata.length());
        if (!retbuf) return -5;
        retbuf.copy(eedata.buffer());
        return true;
    }
}

//eof
