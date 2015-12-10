//RenXT protocol consts
//based on ver 1.14 RenXT.h

'use strict';

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Protocol definitions:
//

var RENXt = module.exports = {}; //namespace
function Const_RENXt(name, value)
{
    Object.defineProperty(RENXt, name, {value: value, writable: false, enumerable: true}); //, enumerable: true, configurable: true
}


//special protocol bytes:
//these are carried over from the original Renard protocol from P. Short
Const_RENXt('RENARD_SYNC', 0x7E); //"~" start of packet
//trick from xLights: sender use 8N2 but receiver use 8N1; extra pad bit gives 10% padding but no instruction overhead to check for Pad char
Const_RENXt('RENARD_PAD', 0x7D); //"}" padding in case sender (usually the host PC) clock is too fast
Const_RENXt('RENARD_ESCAPE', 0x7F); //take next byte as-is, no special handling
//#define RENARD_SUBST  0x7C //substitute another byte in place of this char

//put Renard special chars in ascending order (for more efficient compares):
if (typeof RENXt.RENARD_PAD !== 'undefined') //sender should periodically send a Pad char to compensate for different rx clock
{
    console.log("[INFO] Using explicit Renard Pad byte (allows sender-controlled pad rate)"); //more processing overhead but more tunable
    Const_RENXt('RENARD_SPECIAL_MIN', Math.min(Math.min(RENXt.RENARD_SYNC, RENXt.RENARD_ESCAPE), RENXt.RENARD_PAD));
    Const_RENXt('RENARD_SPECIAL_MID', (RENXt.RENARD_SYNC ^ RENXt.RENARD_ESCAPE ^ RENXt.RENARD_PAD ^ RENXt.MIN_RENARD_SPECIAL ^ RENXt.MAX_RENARD_SPECIAL));
    Const_RENXt('RENARD_SPECIAL_MAX', Math.max(Math.max(RENXt.RENARD_SYNC, RENXt.RENARD_ESCAPE), RENXt.RENARD_PAD));

    if (RENXt.RENARD_SPECIAL_MAX - RENXt.RENARD_SPECIAL_MIN == 2) //values are sequential; use simple range check
        RENXt.IsRenardSpecial = function(ch) { return (((ch) >= RENXt.RENARD_SPECIAL_MIN) && ((ch) <= RENXt.RENARD_SPECIAL_MAX)); }
    else //disjoint; check each value
        RENXt.IsRenardSpecial = function(ch) { return (((ch) == RENXt.RENARD_SYNC) || ((ch) == RENXt.RENARD_PAD) || ((ch) == RENXt.RENARD_ESCAPE)); }
}
else //sender must use 8N1.5 or 8N2 to compensate for differences between tx and rx clocks
{
    console.log("[INFO] Using implicit Renard byte padding (pad ratio hard-coded at 5% or 10%)"); //fewer protocol char collisions
    Const_RENXt('RENARD_SPECIAL_MIN', Math.min(RENXt.RENARD_SYNC, RENXt.RENARD_ESCAPE));
    Const_RENXt('RENARD_SPECIAL_MAX', Math.max(RENXt.RENARD_SYNC, RENXt.RENARD_ESCAPE));

    RENXt.IsRenardSpecial = function(ch) { return (((ch) == RENXt.RENARD_SYNC) || ((ch) == RENXt.RENARD_ESCAPE)); }
}


//pseudo-controller addresses:
Const_RENXt('ADRS_NONE', 0); //all controllers should ignore this packet; might be intended for host
Const_RENXt('ADRS_ALL', 0xFF); //this packet is for all controllers to process
//#define ADRS_UNKNOWN  0xFF //this controller has not been assigned an address; respond to all non-0 addresses
//#define ADRS_UNASSIGNED  0xFF //NOTE: this value matches ADRS_ALL so unassigned controllers will respond if pkt is for all


//manifest data:
//this can be used to get more info about controllers
Const_RENXt('MANIF_END', 0x800); //ends at end of first page
Const_RENXt('MANIF_CONFIG', RENXt.MANIF_END - 1); //config bits/ccp options
Const_RENXt('MANIF_CLOCK', RENXt.MANIF_CONFIG - 2); //ext clock freq (if any); little endian
Const_RENXt('MANIF_MAXBAUD', RENXt.MANIF_CLOCK - 2); //max baud rate (won't fit in 14 bits); little endian
Const_RENXt('MANIF_TOTALRAM', RENXt.MANIF_MAXBAUD - 1); //total RAM available for node + palette data
Const_RENXt('MANIF_DIMSTEPS', RENXt.MANIF_TOTALRAM - 1); //#steps (resolution) of dimming curve
Const_RENXt('MANIF_IOTYPES', RENXt.MANIF_DIMSTEPS - 1); //which node I/O types supported
Const_RENXt('MANIF_PINS', RENXt.MANIF_IOTYPES - 1); //#I/O pins available for nodes, which I/O pin for series nodes
Const_RENXt('MANIF_DEVICE', RENXt.MANIF_PINS - 1); //device code (which uController)
Const_RENXt('MANIF_VERSION', RENXt.MANIF_DEVICE - 1); //firmware version#
Const_RENXt('VERSION', 0x1E); //protocol version 1.14
Const_RENXt('MANIF_STAMP', RENXt.MANIF_VERSION - 3); //magic/stamp "RenXt\0"
Const_RENXt('MANIF_ADDR', RENXt.MANIF_STAMP); //start address of internal controller manifest data; near end of first code page


//function opcodes:
//NOTE: function codes can be used as jumptable offsets
Const_RENXt('NOOP', 0x00); //0x00 (0) = noop

Const_RENXt('SETNODE_OPGRP', 0x1F); //0x0# (0..15) = set node values (in memory)
    RENXt.BITMAP = function(bpp) { return (0x10 + Math.min(4, bpp)); } //0x02 (2) = use remaining bytes as full bitmap 1bpp/2bpp/4bpp for smart pixels
//Const(BPP  //dummy keyword for readability
    Const_RENXt('CLEAR_ALL', RENXt.BITMAP(0 /*BPP*/)); //0xF0 (240) = clear all nodes to black (overwrites first palette entry)
//NOTE: CLEAR_ALL requires padding (~1 NOOP per 50 nodes on a 5 MIPS PIC)
    Const_RENXt('DUMBLIST', 0x1D); //0x05 (5) = use remaining bytes as dumb pixel display event list (chplex/pwm)
// Const_RENXt(TEXT = 0x16; //0x06 (6) = use remaining bytes as text string
    Const_RENXt('NODEBYTES', 0x1E); //0x05 (5) = set node count to next byte (prep for clear-all or set-all)

// Const_RENXt(NODELIST  0x15 //0x01 (1) = use remaining bytes 1..200 as sparse list of node#s (> 200 are esc codes); node# < prev will offset all later node#s by 200
// Const_RENXt(NODESTR  0x17 //0x07 (7) = parallel ledstrip strings
// Const_RENXt(UNUSED_08  0x08 //0x08 (8) = unused
// Const_RENXt(UNUSED_09  0x09 //0x09 (9) = unused
// Const_RENXt(UNUSED_0A  0x0A //0x0A (10) = unused
// Const_RENXt(UNUSED_0B  0x0B //0x0B (11) = unused
// Const_RENXt(UNUSED_0C  0x0C //0x0C (12) = unused
// Const_RENXt(UNUSED_0D  0x0D //0x0D (13) = unused
// Const_RENXt(UNUSED_0E  0x0E //0x0E (14) = unused
// Const_RENXt(UNUSED_0F  0x0F //0x0F (15) = unused
//Const_RENXt(NODEESC_OPGRP  0xFF //0xF# (240..255) = various node list escape codes
// Const_RENXt(SET_ALL  0xF1 //0xF1 (241) = set all (remaining) nodes to currently select palette entry#
// Const_RENXt(SET_ROWS  0xF2 //0xF2 (242) = set string mask; following 2 bytes = bitmask of I/O pins to duplicate
// Const_RENXt(SET_UNUSED_F3  0xF3 //0xF3 (243) = unused
// Const_RENXt(UNUSED_F4  0xF4 //0xF4 (244) = unused
// Const_RENXt(UNUSED_F5  0xF5 //0xF5 (245) = unused
// Const_RENXt(UNUSED_F6  0xF6 //0xF6 (246) = unused
// Const_RENXt(UNUSED_F7  0xF7 //0xF7 (247) = unused
// Const_RENXt(UNUSED_F8  0xF8 //0xF8 (248) = unused
// Const_RENXt(UNUSED_F9  0xF9 //0xF9 (249) = unused
// Const_RENXt(UNUSED_FA  0xFA //0xFA (250) = unused
// Const_RENXt(UNUSED_FB  0xFB //0xFB (251) = unused
// Const_RENXt(UNUSED_FC  0xFC //0xFC (252) = unused
// Const_RENXt(UNUSED_FD  0xFD //0xFD (253) = unused
// Const_RENXt(UNUSED_FE  0xFE //0xFE (254) = unused
// Const_RENXt(UNUSED_FF  0xFF //0xFF (255) = unused

RENXt.SETPAL = function(numents) { return (0x20 + ((numents) & 0xF)); } //0x2# (32..47) = set palette; lower nibble = #palette entries to set (values follow, 3 bytes each, 16 entries max)

RENXt.SETALL = function(palent) { return (0x30 + ((palent) & 0xF)); } //_ALL_IMMED_RGB  0xF2 //0xF1 (241) = set all (remaining) nodes to the following value
//NOTE: SETALL requires padding (~1 NOOP per 50 nodes on a 5 MIPS PIC)

RENXt.SETTYPE = function(nodetype) { return (0x40 + ((nodetype) & 0xF)); } //0x4# (64..79) = set node type if not already set

//Const_RENXt(FXFUNC_OPGRP  0x3F //0x4# (64..79) = various "smart prop" fx functions
// Const_RENXt(SNOW  0x30 //0x40 (64) = snow
// Const_RENXt(GRADIENT  0x31 //0x41 (65) = gradient (ramp/fade)
// Const_RENXt(SCROLL  0x32 //0x42 (66) = scroll
// Const_RENXt(UNUSED_43  0x43 //0x43 (67) = unused
// Const_RENXt(UNUSED_44  0x44 //0x44 (68) = unused
// Const_RENXt(UNUSED_45  0x45 //0x45 (69) = unused
// Const_RENXt(UNUSED_46  0x46 //0x46 (70) = unused
// Const_RENXt(UNUSED_47  0x47 //0x47 (71) = unused
// Const_RENXt(UNUSED_48  0x48 //0x48 (72) = unused
// Const_RENXt(UNUSED_49  0x49 //0x49 (73) = unused
// Const_RENXt(UNUSED_4A  0x4A //0x4A (74) = unused
// Const_RENXt(UNUSED_4B  0x4B //0x4B (75) = unused
// Const_RENXt(UNUSED_4C  0x4C //0x4C (76) = unused
// Const_RENXt(UNUSED_4D  0x4D //0x4D (77) = unused
// Const_RENXt(UNUSED_4E  0x4E //0x4E (78) = unused
// Const_RENXt(UNUSED_4F  0x4F //0x4F (79) = unused

//Const_RENXt(UNUSED_BX  0xBF //0xB# (176..191) = unused
//Const_RENXt(UNUSED_5X  0x5F //0x5# (80..95) = unused
//Const_RENXt(UNUSED_6X  0x6F //0x6# (96..111) = unused

Const_RENXt('CTLFUNC_OPGRP', 0x7F); //0x7# (112..127) = controller functions; these are < 0x80 for easier use with Putty (for debug/test)
// Const_RENXt(ENUM  0x70 //0x70 (112) enumerate/assign address
// Const_RENXt(GET_STATUS  0x71 //0x71 (113) = read controller status
    Const_RENXt('CLEARSTATS', 0x70); //clear run-time stats; useful for perf analysis/debug
    Const_RENXt('READ_REG', 0x71); //0x72 (114) = read registers, address and length follow
    Const_RENXt('WRITE_REG', 0x72); //0x73 (115) = write registers, address, length and data follow
    RENXt.INROM = function(ofs) { return (0x8000 | (ofs)); } //max 32K, so use top bit to denote ROM address space
    RENXt.INRAM = function(ofs) { return (0x4000 | (ofs)); } //max 1K on larger devices, < 256B on smaller devices
    RENXt.INEEPROM = function(ofs) { return (0x2000 | (ofs)); } //max 256B typically
    Const_RENXt('WORKING_REGS', 0x70);
//   Const_RENXt(EEADR  0x4000

    Const_RENXt('IOH_REG', '??'); //I/O handler select; I/O handler DOES NOT start immediately so remaining I/O can be overlapped if desired - waits for flush opcode so all updates can be synced
//I/O handler values:
    Const_RENXt('NULLIO', 0x00); //0x10 (16) = null I/O
    Const_RENXt('FRPANEL', 0x01); //TODO: front panel (custom); can be connected to any PIC to show diagnostic/status info
//polarity:
//   Const(COMMON_ANODE  0xCA
//   Const(COMMON_CATHODE  0xCC
        Const_RENXt('ACTIVE_HIGH', 1);
        Const_RENXt('ACTIVE_LOW', 0);
        RENXt.IsActiveHigh = function(polarity) { return ((polarity) & 1); } //((((polarity) & 0xF) % 11) & 1) //can use 0xA/0xC or 0/1
//CAUTION: only bottom bit should be different for PWM or CHPLEX variants
    RENXt.PWM = function(polarity) { return (0x02 + RENXt.IsActiveHigh(polarity)); } //IIF(IsCommonCathode(polarity), 0x03, 0x02) //IIF(((polarity) & 0xF) != 0xC, 0x02, 0x01) //0x11 (17) = pwm (dedicated I/O pins), Common Anode or Common Cathode
    RENXt.CHPLEX = function(polarity) { return (0x04 + RENXt.IsActiveHigh(polarity)); } //IIF(IsCommonCathode(polarity), 0x05, 0x04) //IIF(((polarity) & 0xF) != 0xC, 0x04, 0x03) //0x13 (19) = chplex (chipiplexed I/O pins), Common Anode or Common Cathode
    Const_RENXt('LAST_DUMBIO', Math.max(Math.max(RENXt.PWM(RENXt.ACTIVE_HIGH), RENXt.PWM(RENXt.ACTIVE_LOW)), Math.max(RENXt.CHPLEX(RENXt.ACTIVE_HIGH), RENXt.CHPLEX(RENXt.ACTIVE_LOW)))); //highest dumb I/O type
    RENXt.IsDumb = function(nodetype) { return ((nodetype) <= RENXt.LAST_DUMBIO); }
    RENXt.IsChplex = function(nodetype) { return ((nodetype) >= Math.min(RENXt.CHPLEX(RENXt.ACTIVE_HIGH), RENXt.CHPLEX(RENXt.ACTIVE_LOW))); }
//CAUTION: only bottom bit should be different for series vs. parallel variants:
    RENXt.GECE = function(orientation) { return (0x06 + RENXt.IsParallel(orientation)); } //IIF(IsParallel(orientation), 0x07, 0x06) //(0x06 + (orientation)) //0x15 (21) = GECE strings (max 63 ct); always parallel since max str len is limited
//   Const_RENXt(LPD6803(orientation)  (0x06 + (orientation)) //0x16 (22) = LPD6803 strings
//   Const_RENXt(TM1809(orientation)  (0x08 + (orientation)) //0x18 (24) = TMS1809 LED strip
    RENXt.WS2811 = function(orientation) { return (0x0A + RENXt.IsParallel(orientation)); } //IIF(IsParallel(orientation), 0x0B, 0x0A) //(0x0A + (orientation)) //0x18 (24) = WS2811 LED strip
//   Const_RENXt(WS2801(orientation)  (0x0C + (orientation)) //0x17 (23) = WS2801 strings
//orientation:
        Const_RENXt('SERIES', 0);
        Const_RENXt('PARALLEL', 1);
        RENXt.IsParallel = function(orientation) { return ((orientation) & 1); }

    Const_RENXt('INTERLEAVE_REG', '??'); //0xC# (192..207) = set #parallel strings; lower nibble = #parallel strings; used even if it exceeds #I/O pins (otherwise incoming caller addressing will be messed up)

    Const_RENXt('STATS_REG', '??');
// Const_RENXt(UNUSED_1A  0x1A //0x1A (26) = unused
// Const_RENXt(UNUSED_1B  0x1B //0x1B (27) = unused
// Const_RENXt(UNUSED_1C  0x1C //0x1C (28) = unused
// Const_RENXt(UNUSED_1D  0x1D //0x1D (29) = unused
// Const_RENXt(UNUSED_1E  0x1E //0x1E (30) = unused
// Const_RENXt(UNUSED_1F  0x1F //0x1F (31) = unused
// Const_RENXt(READ_STATS  0x74 //0x74 (116) = read stats
// Const_RENXt(CLEAR_STATS  0x75 //0x75 (117) = clear stats
    Const_RENXt('SAVE_EEPROM', 0x73); //0x76 (118) = save current palette + node values to EEPROM
// Const_RENXt(DEMO  0x74 //0x77 (119) = return to demo mode (free-running demo/test pattern)
    Const_RENXt('ACK', 0x74); //return pkt status to sender in following byte
    Const_RENXt('RESET', 0x75); //0x78 (120) = reset controller; will return to demo mode
    Const_RENXt('REFLASH', 0x76); //0x79 (121) = bootloader (reflash)
    Const_RENXt('NODEFLUSH', 0x77); //0x79 (121) = send out node data
    Const_RENXt('ZCRESAMPLE', 0x7A); //0x79 (121) = resample ZC rate
    Const_RENXt('TTYACK', 0x7B); //0x79 (121) = tty test

// Const_RENXt(UNUSED_7A  0x7A //0x7A (122) = unused
// Const_RENXt(UNUSED_7B  0x7B //0x7B (123) = unused
// Const_RENXt(UNUSED_7C  0x7C //0x7C (124) = unused
// Const_RENXt(UNUSED_7D  0x7D //0x7D (125) = unused; DON'T USE = Pad (7D)
// Const_RENXt(UNUSED_7E  0x7E //0x7E (126) = unused; DON'T USE = Sync (7E)
// Const_RENXt(UNUSED_7F  0x7F //0x7F (127) = unused; DON'T USE = Escape (7F)

//Const_RENXt(UNUSED_8X  0x8F //0x8# (128..143) = unused
//Const_RENXt(UNUSED_9X  0x9F //0x9# (144..159) = unused
//Const_RENXt(UNUSED_AX  0xAF //0xA# (160..175) = unused

//Const_RENXt(REPEAT  0xEF //0xE# (224..239) = set repeat count; lower nibble = repeat count - 2; TBD: interpret as 2 ^ count rather than count?

//Const_RENXt(PALENT  0xDF //0xD# (208..223) = set palette entry#; lower nibble = palette entry#

//Const_RENXt(NODEOFS  0xBF //0xB# (176..191) = set start node; lower nibble = ofs * 4 * 16 (50?); node# < prev automatically increments this by 4

//TODO: NodeRange,start-node#,count to replace NodeList,node,node+1,node+2,...,node+count-1
RENXt.NODERANGE = function(palent) { return (0xE0 + ((palent) & 0xF)); }

RENXt.NODELIST = function(palent) { return (0xF0 + ((palent) & 0xF)); } //0xF0..0xFF (240..255) = inverted node lists; start of node list or jump to next node bank (add 240 to node#s)
    Const_RENXt('NODELIST_END', RENXt.NODELIST(0)); //end of inverted node lists (bkg palette entry is never explicitly addressed, so use it as an end-of-list marker)
//nodes are divided into "banks" due to 8-bit addresses (transparent to caller)
    Const_RENXt('NODELIST_BANKSIZE', RENXt.NODELIST(0));
    RENXt.NodeBank = function(nodenum) { return ((nodenum) / RENXt.NODELIST_BANKSIZE); }
    RENXt.NodeOffset = function(nodenum) { return ((nodenum) % RENXt.NODELIST_BANKSIZE); }
    RENXt.MakeNode = function(bank, offset) { return ((bank) * RENXt.NODELIST_BANKSIZE + ((offset) % RENXt.NODELIST_BANKSIZE)); }


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Protocol handler:
//

module.exports.AddProtocol = function(port)
{
//    if (!port) return;
//    RenXtProtocol.prototype.forEach(function(func, name) { if (func) port[name] = func; }); //.bind(this)); //console.log("copy %s.%s", subclass.constructor.name, name);
//    var oldmethods = {assign: port.assign, flush: port.flush}; //, verify: port.verify};
    /*if (!this.encbuf)*/
    port.encbuf = new RenXtBuffer(4096); //port.buf.length); //ignore-NOTE: don't do this until after all channels assigned; TODO: replace with stream-buffer?
    port.encbuf.emit_raw(RenXt.RENARD_SYNC, 5); //allow controllers to auto-detect baud rate or stop what they were doing first time
    port.old_outbuf = port.outbuf;
    port.outbuf = {getContents: function() { return port.encbuf.usedbuf; }, size: function() { return port.encbuf.wrlen; }}; //kludge: make it look like stream-buffer
//        .rewind()
//    port.encode = encode.bind(port);
    port.old_assign = port.assign;
    port.assign = function(model) //assign controller address
    {
        if (!(model.nodelist || []).length) throw "RenXt model '" + model.name + "' has no nodes";
        this.old_assign /*.bind(port)*/(model);
        var nodetype = model.opts.nodetype || RenXt.WS2811(RenXt.SERIES);
        model.adrs = port.models.length; //assign unique adrs for each prop on this port, in correct hardware order
        model.setRenderType('ARGB'); //RENXt.IsDumb(nodetype)? 'raw': 'mono'); //RgbQuant in encode() wants raw pixel data; also don't want R<->G swap before quant
        model.encode = (RENXt.IsDumb(nodetype)? encode_chplex: RENXt.IsParallel(nodetype)? encode_parallel: encode_series).bind(model);
        var old_render = model.render;
        model.render = function model_render()
        {
debugger;
//            this.was_dirty = this.dirty;
//            var oldlen = port.outbuf.size();
            var my_outbuf = this.port.outbuf; this.port.outbuf = this.port.old_outbuf; //swap in original non-protocol outbuf
            this.port.outbuf.reset();
            var retval = old_render.call(this);
            if (this.port.outbuf.size())
            {
                this.raw_nodes = uint8ary_to_uint32ary(this.port.outbuf.peek()); //getContents(); //buf slice isn't observed by RgbQuant so do the extra buf alloc + copy here; //peek(); //node ARGB values to be encoded; NOTE: node list is sparse or reordered compared to canvas
                this.raw_nodes.inspect = buf_inspector.bind(this.raw_nodes);
                var oldlen = this.port.encbuf.wrlen;
                this.encode();
                console.log("RenXt encode '%s': %d node bytes -> %d enc bytes", this.name, this.raw_nodes.length, this.port.encbuf.wrlen - oldlen);
                console.log("nodes in:", this.raw_nodes);
                console.log("enc out:", this.port.encbuf.usedbuf);
            }
            this.port.outbuf = my_outbuf; //swap back to protocol outbuf
            return retval;
        }.bind(model);
    }.bind(port);

//    port.old_flush = port.flush;
//    port.flush = function(seqnum) //use correct buffer
//    {
//        var old_outbuf = this.outbuf; //.getContents(); //slice(0, outlen); //kludge: no len param to write(), so trim buffer instead
//        this.outbuf = {getContents: function() { return this.encbuf.usedbuf; }, size: function() { return this.wrlen; }};
//        var retval = this.old_flush(seqnum);
//        this.outbuf = old_outbuf;
//        return retval;
//    }.bind(port);
/*
    port.flush = function(frtime, force) //encode/compress raw nodes before sending
    {
debugger;
//        (this.models || []).forEach(function(model, inx, all) { model.was_dirty = model.dirty; }); //kludge: preserve dirty flag for encode()
        var retval = svmethods.render.apply(this, arguments); //svrender(frtime, force); //ChannelPool.prototype.render.call(port, frtime, force);
//        var encbuf = (retval && retval.buf)? encode(port, retval.buf, !frtime): null;
//        if (encbuf) { retval.rawbuf = retval.buf; retval.buf = encbuf; } //swap in encoded buf but preserve original (mainly for debug)
        console.log("renxt: got base port '%s' render frtime %s, frnext %s, buflen %s, buf", this.name, retval.frtime, retval.frnext || '-', retval.buflen || '-', retval.buf || []);
        encode.call(this, !frtime); //throw away raw render and create new one from models
//        if (this.encbuf.wrlen) {
        console.log("renxt replace outbuf len %s %s with encoded len %s", retval.buf.length, retval.buflen, this.encbuf.wrlen);
        retval.buf = this.encbuf.wrlen? this.encbuf.buffer.slice(0, this.encbuf.wrlen): null;
        retval.buflen = this.encbuf.wrlen;
        return retval;
    }.bind(port);
*/
    port.verify = verify.bind(port);
/*
    port.verify = function() //verify outbuf was received and processed
    {
debugger;
        var iorec = this.ioverify.first; // {seqnum, data, len, sendtime}
        if (this.inbuf.size() < iorec.len) return; //not enough data to verify
        var elapsed = new Elapsed(iorec.sendtime);
//        var cmp = svmethods.verify? svmethods.verify.call(port, outbuf, inbuf): null; //svverify(outbuf, inbuf);
//        if ((cmp !== null) && (cmp !== 0)) return cmp; //return base result if failed
        return verify(outbuf, inbuf);
    }.bind(port)
*/
//    port.cfg_sent = false; //force config info to be sent first time
    console.log("RenXt protocol added to %s".yellow, port.name);
}


//RgbQuant doesn't seem to like node.js Buffers or ArrayBuffers, so convert:
//TODO: avoid calling this
//var uint32_splitter = new Buffer(4);
function uint8ary_to_uint32ary(buf)
{
/*
//                this.raw_nodes = new Uint32Array(this.port.outbuf.peek()); //node values to be encoded; NOTE: node list is sparse or reordered compared to canvas
//                this.raw_nodes = this.port.outbuf.peek(); //node values to be encoded; NOTE: node list is sparse or reordered compared to canvas
                var nodes = this.port.outbuf.peek(); //node values to be encoded; NOTE: node list is sparse or reordered compared to canvas
                this.raw_nodes = new Uint32Array(nodes.length / 4);
//                var nodes = new Uint32Array(this.raw_nodes); //NOTE RgbQuant somehow sees the 8K stream buffer, so force a new array/buffer
                for (var i = 0; i < nodes.length; i += 4)
                    this.raw_nodes[i / 4] = nodes.readUInt32BE(i);
                this.raw_nodes = this.imgdata();
                console.log("raw nodes", this.raw_nodes);
*/
    if (!buf.readUInt32BE) buf.readUInt32BE = function(ofs) { return (this[ofs] << 24) | (this[ofs + 1] << 16) | (this[ofs + 2] << 8) | this[ofs + 3]; }
    var retval = new Uint32Array(buf.length / 4);
    for (var ofs = 0; ofs < buf.length; ofs += 4)
        retval[ofs / 4] = buf.readUInt32BE(ofs); //buf.readUInt32BE? buf.readUInt32BE(ofs): (buf[ofs] << 24) | (buf[ofs + 1] << 16) | (buf[ofs + 2] << 8) | buf[ofs + 3];
    return retval;
}
//var arr = new Uint8Array([1, 2, 3])
//    var palbuf = toBuffer(pal);
//    var pal_view = new Uint32Array(pal);
//    var pal_view = new DataView(pal);
//    var buf = '';
//    for (var i = 0; i < pal.length; i += 4)
//        buf += ', ' + pal_view.getUint32(i);


var buffer = require('buffer');

function buf_inspector(depth, opts) //make debug easier
{
    var buf = '';
    if (!this.readUInt32BE) this.readUInt32BE = function(ofs) { return (this[ofs] << 24) | (this[ofs + 1] << 16) | (this[ofs + 2] << 8) | this[ofs + 3]; }
    for (var ofs = 0, limit = this.length; ofs < limit; ofs += 4)
    {
        if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (limit - ofs) / 4 + ' '; break; }
        buf += ' #' + hex(this.readUInt32BE(ofs), 8);
    }
    return '<RGBA-buf:' + (limit / 4) + ' ' + buf + '>';
}


//function RenXtProtocol() {} //dummy ctor
//RenXtProtocol.prototype.encode = encode;
//RenXtProtocol.prototype.validate = validate;

/*
function encode(nodes) //port, nodes,// first) //NOTE: runs in port context
{
//    if (!port.encbuf) port.encbuf = new RenXtBuffer(4000); //port.buf.length); //NOTE: don't do this until after all channels assigned
//    if (ZOMBIE_RECOVER) port.sent_config = false;
    this.encbuf.rewind();
    this.models.forEach(function(model, inx, all)
    {
        if (first || !this.cfg_sent) this.encbuf.SetConfig(model.adrs, model.opts.nodetype, model.opts.nodebytes || Math.ceil(model.nodelist.length / 4 / 2)) //quad bytes, 2 bpp
        if (!model.was_dirty) return; //no need to re-encode
//        var img = Uint32Array(model.numpx);
//        for (var i = 0; i < model.numpx; ++i) img[i] = model.buf; //abgr format
        if ((model.opts.nodetype || 999) <= RenXt.LAST_DUMBIO) encode_dumb.call(this, model); //, nodes);
        else encode_smart.call(this, model); //, nodes);
    }.bind(this));
    if (this.encbuf.wrlen) this.encbuf.emit_raw(RenXt.RENARD_SYNC); //send out a final sync to mark end of last packet
//        .flush(function(err)
//        {
//            if (err) { console.log("error: " + err); return; }
//            console.log("write+drain+delay done: %d bytes available", port.RenXt.rdlen);
//        });
    this.cfg_sent = true;
//    return port.encbuf.buffer;
}
*/


//var DataView = require('buffer-dataview');
var toBuffer = require('typedarray-to-buffer')
var RgbQuant = require('rgbquant');
//NO var quant = new RgbQuant({colors: 16}); //need new one each time

//encode series nodes for this model:
//places encoded nodes into port output buf
//model already deduped
//NOTE: runs in model context
function encode_series(first) //_smart(model) //, nodes)
{
    console.log("raw nodes %j", this.raw_nodes);
    console.log("series encode %d nodes, need quantize? %s", this.raw_nodes.length, this.raw_nodes.length > 16);
//    if (this.raw_nodes.length > 16) //do this even if <= 16 nodes (need to invert anyway)
    {
        analyze(this.raw_nodes, "raw");
//    var quant = new RgbQuant({colors: 16, boxSize: [4, 4], boxPxls: 1}); //need new object each time?
//    boxSize: [4, 4], boxPxls: 1,
//    dithXXXX: true, //maybe try dithKern, dithSerp, etc
//    colorDist: ??, //select color distance eqn?
        var quant = new RgbQuant({ colors: 16, method: 1, initColors: 0}); //4 bpp, 1D (no sub-boxes)
//NO: node.js buf len broken
        quant.sample(this.raw_nodes); //analyze histogram
//    quant.colorStats1D(buf32) //wants ARGB, .length

//TODO: share palette across frames to reduce frame-to-frame color variations
        var pal = uint8ary_to_uint32ary(quant.palette()); //build palette; ABGR entries
        pal.inspect = buf_inspector.bind(pal);
        console.log("pal %s", typeof pal, pal);
//    console.log("palbuf %s %j", typeof palbuf, palbuf);
//then generate reduced palette:
        var reduced = uint8ary_to_uint32ary(quant.reduce(this.raw_nodes, 2)); //reduce colors in image; retType 2 = Indexed array
        reduced.inspect = buf_inspector.bind(reduced);
        console.log("reduced %s", typeof reduced, reduced);
        analyze(reduced, "reduced");
    }

//    console.log("renxt: model '%s', #nodes %s, #pal %s vs limit %s, BAD reduced #ents %s", this.name, this.raw_nodes.length / 4, pal.length, Object.keys(counts).length, reduced.length);
//start encoding:
    if (first || !this.cfg_sent) //need to config addresses before sending anything else
        this.port.encbuf.SetConfig(this.adrs, this.opts.nodetype, this.opts.nodebytes || Math.ceil(this.nodelist.length / 4 / 2)); //quad bytes, 2 bpp
    this.cfg_sent = true;
//        if (!model.adrs) { console.log("RenXt encode: skipping model '%s' no address", model.name); return; }
//        model.want_cfg = true; //force config info to be sent first time; NOTE: must send config to all models on this port to set correct addresses
//        model.cfg_sent = false; //force config info to be sent first time

    this.port.encbuf
        .SelectAdrs(this.adrs)
//        .SetPal(pal)
        .emit_buf("TODO: SERIES")
        .NodeFlush();
}


function encode_parallel(first) //, nodes)
{
    this.port.encbuf
        .SelectAdrs(this.adrs)
        .emit_buf("TODO: PARALLEL")
        .NodeFlush();
}

function encode_chplex(first) //, nodes)
{
    this.port.encbuf
        .SelectAdrs(this.adrs)
        .emit_buf("TODO: DUMB")
        .NodeFlush();
}


function hex(val, len)
{
    if (!len) len = 8;
    return ('00000000' + (val >>> 0).toString(16)).slice(-len);
}


//first analyze nodes:
//used only for debug
function analyze(nodes, desc)
{
//    var keys = {}, counts = [];
//    require('my-plugins/utils/showthis').call(nodes, "nodes");
    var counts = {};
    if (nodes.data) nodes = nodes.data;
    if (nodes.readUInt32BE) //buffer
        for (var i = 0; i < nodes.length; i += 4)
        {
            var color = nodes.readUInt32BE(i) & 0xFFFFFF; //nodes[i] & 0x00FFFFFF; //>>> 8; //RGB, drop A
            if (isNaN(++counts[color])) counts[color] = 1;
/*
            var inx = keys[color];
            if (typeof inx == 'undefined') { inx = keys[color] = counts.length; counts.push(0); }
            ++counts[inx];
            this.raw_nodes.writeUInt32BE(inx);
*/
        }
    else //array
        for (var i = 0; i < nodes.length; ++i)
        {
            var color = nodes[i] & 0xFFFFFF;
            if (isNaN(++counts[color])) counts[color] = 1;
        }
    var palette = Object.keys(counts);
    palette.sort(function(lhs, rhs) { return (counts[lhs] - counts[rhs]) || (lhs - rhs); });
    var buf = '';
    palette.forEach(function(color) { buf += ', #' + hex(color, 6) + ' * ' + counts[color]; });
    console.log((desc || '') + " palette %d ents:", palette.length, buf.substr(2));
}


function verify(outbuf, inbuf)
{
debugger;
    if (!this.ioverify.length) return; //nothing to verify
    var iorec = this.ioverify[0]; // {seqnum, data, len, sendtime}
    console.log("iorec", iorec);
    console.log("RenXt verify: inlen %s vs. iolen %s", this.inbuf.size(), iorec.len);
    if (this.inbuf.size() < iorec.len) return; //not enough data to verify
    var elapsed = new Elapsed(iorec.sendtime);
//        var cmp = svmethods.verify? svmethods.verify.call(port, outbuf, inbuf): null; //svverify(outbuf, inbuf);
//        if ((cmp !== null) && (cmp !== 0)) return cmp; //return base result if failed
    console.log("TODO: compare RenXt outbuf + inbuf");
}


//enumerate props/controllers on a port:
function enum_props()
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
        .emit_raw(RenXt.RENARD_SYNC, 5); //allow controllers to auto-detect baud rate or stop what they were doing
    var limit = 0;
    for (var adrs = 1; adrs <  RenXt.RENARD_SPECIAL_MIN; ++adrs) //NOTE: buffer can be as large as needed here since there is no FPS limitation
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


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Protocol helpers (mostly fluent):
//

var RenXt = require('my-plugins/hw/RenXt');
var Struct = require('struct'); //https://github.com/xdenser/node-struct
//var DataView = require('buffer-dataview'); //https://github.com/TooTallNate/node-buffer-dataview
var makenew = require('my-plugins/utils/makenew');


//TODO: derive from stream buffer?
function RenXtBuffer(opts)
{
    if (!(this instanceof RenXtBuffer)) return makenew(RenXtBuffer, arguments); //{port, buflen}
//    this.port = opts.port;
    opts = (typeof opts !== 'object')? {buflen: opts}: opts || {};
    this.buffer = new Buffer(opts.buflen || 4096); //NOTE: ignore FPS restrictions to simplify special cases such as initial enum
    Object.defineProperty(this, 'usedbuf', {get() { return this.buffer.slice(0, this.wrlen); }});

//    this.dataview = new DataView(this.buffer);
    this.stats_opc = new Uint16Array(256);
//    this.port.on('data', function(data) //collect incoming data
//    {
//        this.latest = this.elapsed.now;
//        if (Buffer.isBuffer(data)) { data.copy(this.buffer, this.rdlen); this.rdlen += data.length; }
//        else { this.buffer.write(data, this.rdlen, data.length); this.rdlen += data.length; }
//    }.bind(this));
    this.rewind();
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
    return (this.wrlen + len <= this.buffer.length);
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
    var outbuf = (this.wrlen < this.buffer.length)? this.buffer.slice(0, this.wrlen): this.buffer; //kludge: no len param to write(), so trim buffer instead
    if (this.wrlen > this.buffer.length) console.log("out buf overflow: %d (max %d)".red, this.wrlen, this.buffer.byteLength);
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

RenXtBuffer.prototype.SelectAdrs = function(adrs)
{
    this
        .emit_raw(RenXt.RENARD_SYNC)
        .emit_raw(adrs);
    return this; //fluent
}

RenXtBuffer.prototype.SetConfig = function(adrs, node_type, node_bytes)
{
    if (typeof node_type == 'undefined') node_type = RenXt.WS2811(RenXt.SERIES);
    this
        .emit_raw(RenXt.RENARD_SYNC)
        .emit_raw(adrs)
//firmware requires SentNodes state bit to be off in order to change node type (otherwise flagged as protocol error)
//since we know what all the state bits should be, just overwrite them all rather than using a complicated read-modify-write process to try to preserve some of them
//state bits are at 0x73 in PIC shared RAM; 0x01 = Echo (should be on), 0x02 = Esc pending (should be off), 0x04 = Protocol inactive (should be off), 0x08 = Sent nodes (should be on)
//        BeginOpcode(__LINE__, adrs, 5);
        .emit_opc(RenXt.WRITE_REG)
        .emit_uint16_raw(RenXt.INRAM(0x73)) //2 byte adrs of firmware Status bits; TODO: use const from RenXt.h
        .emit_raw(RenXt.WRITE_REG ^ 0 ^ 0x73) //mini-checksum
        .emit_raw(0x01); //firmware State bits: Echo = on, Esc = off, Protocol = active, Sent = off; TODO: use const from RenXt.h
    this
        .emit_raw(RenXt.RENARD_SYNC)
        .emit_raw(adrs)
        .emit_opc(RenXt.SETTYPE(node_type)) //changes value if nodes not already sent
//NOTE: 1.14 firmware does NOT do a SetAll after setting node type
        .emit_opc(RenXt.NODEBYTES) //sets node count to next byte (prep for clear-all or set-all); no wait states so group it with SetType
        .emit_byte(node_bytes); //ABS(prop->desc.numnodes) / 2);
    return this; //fluent
}

RenXtBuffer.prototype.SetPal = function(/*adrs,*/ colors)
{
//    if (arguments.length < 2) { colors = adrs; adrs = undefined; } //shuffle optional params
    if (!Array.isArray(colors)) colors = arguments;
    if ((colors.length < 1) || (colors.length > 16)) throw "Invalid palette length: " + colors.length;
//    if (typeof adrs != 'undefined') this //start new block
//        .emit_raw(RenXt.RENARD_SYNC)
//        .emit_raw(adrs);
    this.emit_opc(RenXt.SETPAL(colors.length));
//    Array.from/*prototype.slice.call*/(arguments).slice(1).forEach(function(color, inx)
    colors.forEach(function(color, inx)
    {
        this.emit_rgb(color);
    }.bind(this));
    return this; //fluent
}

RenXtBuffer.prototype.NodeFlush = function() //adrs)
{
//    if (typeof adrs != 'undefined') this //start new block
//        .emit_raw(RenXt.RENARD_SYNC)
//        .emit_raw(adrs);
    this
        .emit_opc(RenXt.NODEFLUSH)
        .pad(10); //TODO: interleave + wait states
    return this; //fluent
}

RenXtBuffer.prototype.SetAll = function(/*adrs,*/ palinx)
{
//    if (typeof adrs != 'undefined') this //start new block
//        .emit_raw(RenXt.RENARD_SYNC)
//        .emit_raw(adrs);
    this
        .emit_opc(RenXt.SETALL(palinx))
        .pad(10); //TODO: interleave + wait states
    return this; //fluent
}

RenXtBuffer.prototype.emit_buf = function(buf, len)
{
    if (arguments.length < 2) len = buf.length;
//TODO: use buffer.indexOf to scan for special chars, then buffer.copy?
    for (var ofs = 0; ofs < len; ++ofs) this.emit_byte(buf[ofs]); //copy byte-by-byte to handle special chars and padding; escapes will be inserted as necessary
    return this; //fluent
}

RenXtBuffer.prototype.emit_rawbuf = function(buf, len)
{
//    for (var ofs = 0; ofs < len; ++ofs) this.emit_raw(values[ofs]); //copy byte-by-byte to handle special chars and padding; caller is responsible for escapes
    len = len || buf.length || 0;
    /*if (this.wrlen + len <= this.buffer.length)*/ buf.copy(this.buffer, this.wrlen, 0, len);
    this.wrlen += len;
    return this; //fluent
}

RenXtBuffer.prototype.emit_rgb = function(rgb) //ensure correct byte order
{
//NOTE: send each byte separately in case of special char conflict
    this.emit_byte(rgb >> 16); //RGB2R(rgb));
    this.emit_byte(rgb >> 8); //RGB2G(rgb));
    this.emit_byte(rgb); //RGB2B(rgb));
//    this.buffer.writeUInt32BE(rgb << 8, ofs); ofs += 3;
    return this; //fluent
}

RenXtBuffer.prototype.emit_uint32 = function(val) //ensure correct byte order
{
//NOTE: send each byte separately in case of special char conflict; can't use raw 32 because val might contain special bytes that need to be escaped
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
        /*if (this.wrlen + 2 <= this.buffer.length)*/ this.buffer.writeUInt16BE(val, this.wrlen);
        this.wrlen += 2;
    }
    return this; //fluent
}

RenXtBuffer.prototype.emit_opc = function(value, count)
{
    this.stats_opc[value] += count || 1;
    this.emit_raw(value, count); //NOTE: assumes opcode doesn't need to be escaped, which should be the case
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
        /*if (this.wrlen < this.buffer.length)*/ this.buffer[this.wrlen++] = value;
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


//eof
