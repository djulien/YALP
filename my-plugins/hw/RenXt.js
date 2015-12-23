//RenXT protocol consts
//based on ver 1.14 RenXT.h

'use strict';
require('colors');

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Protocol definitions:
//

var RENXt = module.exports; //= {}; //namespace
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
    console.log("[INFO] Using explicit Renard Pad byte (allows sender-controlled pad rate)".yellow); //more processing overhead but more tunable
    Const_RENXt('RENARD_SPECIAL_MIN', Math.min(Math.min(RENXt.RENARD_SYNC, RENXt.RENARD_ESCAPE), RENXt.RENARD_PAD));
    Const_RENXt('RENARD_SPECIAL_MID', (RENXt.RENARD_SYNC ^ RENXt.RENARD_ESCAPE ^ RENXt.RENARD_PAD ^ RENXt.MIN_RENARD_SPECIAL ^ RENXt.MAX_RENARD_SPECIAL));
    Const_RENXt('RENARD_SPECIAL_MAX', Math.max(Math.max(RENXt.RENARD_SYNC, RENXt.RENARD_ESCAPE), RENXt.RENARD_PAD));

    if (RENXt.RENARD_SPECIAL_MAX - RENXt.RENARD_SPECIAL_MIN == 2) //values are sequential; use simple range check
        RENXt.IsRenardSpecial = function isspecial2(ch) { return (((ch) >= RENXt.RENARD_SPECIAL_MIN) && ((ch) <= RENXt.RENARD_SPECIAL_MAX)); }
    else //disjoint; check each value
        RENXt.IsRenardSpecial = function isspecial3(ch) { return (((ch) == RENXt.RENARD_SYNC) || ((ch) == RENXt.RENARD_PAD) || ((ch) == RENXt.RENARD_ESCAPE)); }
}
else //sender must use 8N1.5 or 8N2 to compensate for differences between tx and rx clocks
{
    console.warn("[INFO] Using implicit Renard byte padding (pad ratio hard-coded at 5% or 10%)".yellow); //fewer protocol char collisions
    Const_RENXt('RENARD_SPECIAL_MIN', Math.min(RENXt.RENARD_SYNC, RENXt.RENARD_ESCAPE));
    Const_RENXt('RENARD_SPECIAL_MAX', Math.max(RENXt.RENARD_SYNC, RENXt.RENARD_ESCAPE));

    RENXt.IsRenardSpecial = function isspecial_nopad(ch) { return (((ch) == RENXt.RENARD_SYNC) || ((ch) == RENXt.RENARD_ESCAPE)); }
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
    RENXt.BITMAP = function bitmap(bpp) { return (0x10 + Math.min(4, bpp)); } //0x02 (2) = use remaining bytes as full bitmap 1bpp/2bpp/4bpp for smart pixels
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

RENXt.SETPAL = function setpal(numents) { return (0x20 + ((numents) & 0xF)); } //0x2# (32..47) = set palette; lower nibble = #palette entries to set (values follow, 3 bytes each, 16 entries max)

RENXt.SETALL = function setall(palent) { return (0x30 + ((palent) & 0xF)); } //_ALL_IMMED_RGB  0xF2 //0xF1 (241) = set all (remaining) nodes to the following value
//NOTE: SETALL requires padding (~1 NOOP per 50 nodes on a 5 MIPS PIC)

RENXt.SETTYPE = function settype(nodetype) { return (0x40 + ((nodetype) & 0xF)); } //0x4# (64..79) = set node type if not already set

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
    RENXt.INROM = function inrom(ofs) { return (0x8000 | (ofs)); } //max 32K, so use top bit to denote ROM address space
    RENXt.INRAM = function inram(ofs) { return (0x4000 | (ofs)); } //max 1K on larger devices, < 256B on smaller devices
    RENXt.INEEPROM = function ineeprom(ofs) { return (0x2000 | (ofs)); } //max 256B typically
    Const_RENXt('WORKING_REGS', 0x70);
//   Const_RENXt(EEADR  0x4000

    Const_RENXt('IOH_REG', '??'); //I/O handler select; I/O handler DOES NOT start immediately so remaining I/O can be overlapped if desired - waits for flush opcode so all updates can be synced
//I/O handler values:
    Const_RENXt('NULLIO', 0x00); //0x10 (16) = null I/O
    Const_RENXt('FRPANEL', 0x01); //TODO: front panel (custom); can be connected to any PIC to show diagnostic/status info
//polarity:
//   Const(COMMON_ANODE  0xCA
//   Const(COMMON_CATHODE  0xCC
        Const_RENXt('ACTIVE_HIGH', 1); //"common anode" or "cathode" is ambiguous (because there is a row and column), so use "active high" or "low" instead
        Const_RENXt('ACTIVE_LOW', 0);
        RENXt.IsActiveHigh = function activehi(polarity) { return ((polarity) & 1); } //((((polarity) & 0xF) % 11) & 1) //can use 0xA/0xC or 0/1
//CAUTION: only bottom bit should be different for PWM or CHPLEX variants
    RENXt.PWM = function pwm(polarity) { return (0x02 + RENXt.IsActiveHigh(polarity)); } //IIF(IsCommonCathode(polarity), 0x03, 0x02) //IIF(((polarity) & 0xF) != 0xC, 0x02, 0x01) //0x11 (17) = pwm (dedicated I/O pins), Common Anode or Common Cathode
    RENXt.CHPLEX = function chplex(polarity) { return (0x04 + RENXt.IsActiveHigh(polarity)); } //IIF(IsCommonCathode(polarity), 0x05, 0x04) //IIF(((polarity) & 0xF) != 0xC, 0x04, 0x03) //0x13 (19) = chplex (chipiplexed I/O pins), Common Anode or Common Cathode
    Const_RENXt('LAST_DUMBIO', Math.max(Math.max(RENXt.PWM(RENXt.ACTIVE_HIGH), RENXt.PWM(RENXt.ACTIVE_LOW)), Math.max(RENXt.CHPLEX(RENXt.ACTIVE_HIGH), RENXt.CHPLEX(RENXt.ACTIVE_LOW)))); //highest dumb I/O type
    RENXt.IsDumb = function isdumb(nodetype) { return ((nodetype) <= RENXt.LAST_DUMBIO); }
    RENXt.IsChplex = function ischplex(nodetype) { return ((nodetype) >= Math.min(RENXt.CHPLEX(RENXt.ACTIVE_HIGH), RENXt.CHPLEX(RENXt.ACTIVE_LOW))); }
//CAUTION: only bottom bit should be different for series vs. parallel variants:
    RENXt.GECE = function gece(orientation) { return (0x06 + RENXt.IsParallel(orientation)); } //IIF(IsParallel(orientation), 0x07, 0x06) //(0x06 + (orientation)) //0x15 (21) = GECE strings (max 63 ct); always parallel since max str len is limited
//   Const_RENXt(LPD6803(orientation)  (0x06 + (orientation)) //0x16 (22) = LPD6803 strings
//   Const_RENXt(TM1809(orientation)  (0x08 + (orientation)) //0x18 (24) = TMS1809 LED strip
    RENXt.WS281X = function ws281x(orientation) { return (0x0A + RENXt.IsParallel(orientation)); } //IIF(IsParallel(orientation), 0x0B, 0x0A) //(0x0A + (orientation)) //0x18 (24) = WS281X LED strip
//   Const_RENXt(WS2801(orientation)  (0x0C + (orientation)) //0x17 (23) = WS2801 strings
//orientation:
        Const_RENXt('SERIES', 0);
        Const_RENXt('PARALLEL', 1);
        RENXt.IsParallel = function ispara(orientation) { return ((orientation) & 1); }

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
RENXt.NODERANGE = function noderange(palent) { return (0xE0 + ((palent) & 0xF)); }

RENXt.NODELIST = function nodelist(palent) { return (0xF0 + ((palent) & 0xF)); } //0xF0..0xFF (240..255) = inverted node lists; start of node list or jump to next node bank (add 240 to node#s)
    Const_RENXt('NODELIST_END', RENXt.NODELIST(0)); //end of inverted node lists (bkg palette entry is never explicitly addressed, so use it as an end-of-list marker)
//nodes are divided into "banks" due to 8-bit addresses (transparent to caller)
    Const_RENXt('NODELIST_BANKSIZE', RENXt.NODELIST(0));
    RENXt.NodeBank = function nodebank(nodenum) { return Math.floor((nodenum) / RENXt.NODELIST_BANKSIZE); }
    RENXt.NodeOffset = function nodeofs(nodenum) { return ((nodenum) % RENXt.NODELIST_BANKSIZE); }
    RENXt.MakeNode = function mknode(bank, offset) { return ((bank) * RENXt.NODELIST_BANKSIZE + ((offset) % RENXt.NODELIST_BANKSIZE)); }

//opcodes that return variable data:
var opcodes = {};
opcodes[RENXt.ACK] = 0;
opcodes[RENXt.READ_REG] = 2;
//opcodes[RENXt.NODELIST
Const_RENXt('DataOpcodes', opcodes);
//Const_RENXt('DataOpcodes', {RENXt.READ_REG: 2, RENXt.ACK: 0});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Protocol handler:
//

require('colors');
const logger = require('my-plugins/utils/logger')();
const Elapsed = require('my-plugins/utils/elapsed');
const bufdiff = require('my-plugins/utils/buf-diff');
const unprintable = require('my-plugins/utils/unprintable');

function my_inspect(depth, opts) //make debug easier
{
    var buf = '';
    for (var ofs = 0; ofs < this.length; ++ofs)
    {
        if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (this.length - ofs) + ' '; break; }
        if (!(ofs % 16) && ofs) buf += " 'x" + ofs.toString(16); //show byte offset periodically
//        switch (grouping)
//        {
//            case 3: buf += ' ' + hex(this.readUInt24BE(ofs), 6); break;
//            case 4: buf += ' ' + hex(this.readUInt32BE(ofs), 8); break;
//            default: throw "Unhandled chunk size: " + grouping;
//        }
        buf += ' ' + (!ofs? 'x' : '') + this[ofs].toString(16); //hex(this[ofs], 2);
    }
    return '<Buffer ' + this.length + ':' + buf + '>';
}

JSON.my_stringify = function my_stringify(thing) //TODO: use YAML for readability?  kludge: just don't like those quotes :(
{
    return JSON.stringify(thing, function buf_replacer(key, value)
    {
        if (!value) return value;
        if (!Buffer.isBuffer(value))
            if (!value.data || !value.type || !Array.isArray(value.data) || (value.type != 'Buffer'))
                return value;
//        value.inspect = my_inspect.bind(value);
//        return value.inspect();
        return my_inspect.call(value.data);
    });
//    return JSON.stringify(thing).replace(/"([A-Z0-9$@_]+)":/gi, "$1:").replace(/([^0-9]),/g, "$1, "); //.replace(/\n */g, '');
}

const DefaultNodeType = RENXt.WS281X(RENXt.SERIES); //most of my pixels are this type, so use it as default
//opcode names:
//mainly for debug
function OpcodeNames(opc)
{
//debugger;
    switch (opc)
    {
        case RENXt.NOOP: return "NOOP";
        case RENXt.BITMAP(1):
        case RENXt.BITMAP(2):
        case RENXt.BITMAP(4): return "BMP(# BPP)".replace(/#/, opc & 0xF);
        case RENXt.DUMBLIST: return "DUMBLIST";
        case RENXt.NODEBYTES: return "NODEBYTES";
        case RENXt.CLEARSTATS: return "CLEARSTATS";
        case RENXt.READ_REG: return "READ_REG";
        case RENXt.WRITE_REG: return "WRITE_REG";
        case RENXt.SAVE_EEPROM: return "SAVE_EEPROM";
        case RENXt.ACK: return "ACK";
        case RENXt.RESET: return "RESET";
        case RENXt.REFLASH: return "REFLASH";
        case RENXt.NODEFLUSH: return "NODEFLUSH";
        case RENXt.ZCRESAMPLE: return "ZCRESAMPLE";
        case RENXt.TTYACK: return "TTYACK";
        case RENXt.NODELIST_END: return "NODELIST_END";
    }
    var name = '';
    if (typeof opc == 'number') switch (opc & 0xF0)
    {
        case RENXt.SETPAL(0): name = "SETPAL(#)"; break;
        case RENXt.SETALL(0): name = "SETALL(#)"; break;
        case RENXt.SETTYPE(0): name = "SETTYPE(#)"; break;
        case RENXt.NODELIST(0): name = "NODELIST(#)"; break;
    }
    return name.replace(/#/, opc & 0x0F);
}


//add data and wedge in custom handlers:
module.exports.AddProtocol =
function AddProtocol(port)
{
//debugger;
//    if (!port) return;
//    RenXtProtocol.prototype.forEach(function proto_each(func, name) { if (func) port[name] = func; }); //.bind(this)); //console.log("copy %s.%s", subclass.constructor.name, name);
//    var oldmethods = {assign: port.assign, flush: port.flush}; //, verify: port.verify};
    /*if (!this.encbuf)*/
    port.encbuf = new RenXtBuffer(4096); //port.buf.length); //ignore-NOTE: don't do this until after all channels assigned; TODO: replace with stream-buffer?
//no-defer    port.encbuf.emit_raw(RenXt.RENARD_SYNC, 5); //allow controllers to auto-detect baud rate or stop what they were doing first time
    port.encbuf.src = "out";

    port.old_outbuf = port.outbuf;
    port.outbuf = //kludge: wrap protocol buffer to look like port's stream-buffer
    {
        getContents: function getcont()
        {
            this.encbuf.interleave(); //enforce wait states before sending
//TODO: avoid the extra buffer copy
            var retbuf = new Buffer(this.encbuf.usedbuf); //NOTE: need to copy buffer contents because it will be reused
            if (retbuf.length) this.inbuf.push('\n' + JSON.my_stringify({rawbuf: retbuf, buflen: retbuf.length, seqnum: this.seqnum, src: 'outbound'}) + '\n'); //include copy before parsing
            if (this.encbuf.wrlen) this.inbuf.non_xform(this.encbuf); //copy output to loopback log so it can be compared for comm and firmware diagnostics
            this.encbuf.rewind();
            return retbuf;
        }.bind(port),
        size: function size() { return port.encbuf.wrlen; },
//        readUInt24BE: function readUInt24BE(ofs) { return int24.readUInt24BE(this, ofs) >>> 0; },
//        writeUInt24BE: function writeUInt24BE(val, ofs) { return int24.writeUInt24BE(this, val >>> 0, ofs); }; //NOTE: falafel/acorn needs ";" here to prevent the following array lit from being undefined; TODO: fix falafel/acorn
    };

    port.iostats = //send to analysis stream rather than accumulating in memory
    {
        length: 0, //kludge: make it look like an empty array
        push: function iostats_push(info) { logger(100-1, "iostats.push"); port.inbuf.push(JSON.my_stringify(info) + '\n'); },
    };
    var svfinish = port.onfinish;
    port.onfinish = function onfinish(args)
    {
        if (!port.encbuf.stats_opc.length) return;
        var buf = '';
        port.encbuf.stats_opc.forEach(function opc_enum(count, key) { buf += ', ' + OpcodeNames(+key) + ' = ' + count; }); //logger("protocol opc enc: %s occurs %s", OpcodeNames(key), count); }); //port.encbuf.stats_opc.toString());
        logger("protocol opc enc: %s", buf.substr(2));
        logger("protocol interleave: %s", JSON.stringify(port.encbuf.stats_interleave));
//        console.log(port.encbuf.stats_opc);
        if (svfinish) svfinish();
    } //.bind(port));
//    port.old_write = port.write;
//    port.write = my_write.bind(port);
    var old_inbuf = port.inbuf;
    port.inbuf = new LoopbackStream({dest: old_inbuf});
//    fs.createWriteStream(path.basename(this.name || this.device) + '-out.log'); //, "port '" + this.name + "' input");
/*
    inbuf.unpipe(old_writer);
    inbuf.pipe(new_writer);
    port.inbuf = //redirect incoming data and analyze for comm or firmware errors
    {
//        write:
        getContents: function getcont() { return null; },
        size: function size() { return 0; },
    };
*/
//        .rewind()
//    port.encode = encode.bind(port);

//NOTE 2 phases: immediately update models already assigned to ports, then wedge assign() to handle future assignments
    port.models.forEach(function already_assigned(model) { my_assign.call(port, model); }); //update models that were already assigned to port
    port.old_assign = port.assign; //allow previous method to be called as well; grab from instance rather than prototype in case it was overridden
    port.assign = my_assign.bind(port);

    port.old_flush = port.flush; //allow previous method to be called as well; grab from instance rather than prototype in case it was overridden
    port.flush = my_flush.bind(port);

//    port.verify = my_verify.bind(port); //NOTE: completely overrides previous method
//    port.cfg_sent = false; //force config info to be sent first time
    console.log("RenXt protocol added to %s".yellow, port.name);
}


//assign controller address:
//runs with port context
function my_assign(model)
{
debugger;
    logger("assign model '%s' with %d nodes to port '%s'".blue, model.name, (model.nodelist || []).length, this.name || this.device);
    if (!(model.nodelist || []).length) throw "RenXt model '" + model.name + "' has no nodes (need to specify model node order)";
    if (this.old_assign) this.old_assign.apply(this, arguments); // /*.bind(port)*/(model);
    var nodetype = model.opts.nodetype || DefaultNodeType;
    model.adrs = model.opts.adrs || model.inx_port + 1; //this.models.length; //assign unique adrs for each prop on this port, in correct hardware order; let caller override
    model.setRenderType('ARGB'); //NOTE: use 32-bit value to preserve byte alignment in node analyzer; //RENXt.IsDumb(nodetype)? 'raw': 'mono'); //RgbQuant in encode() wants raw ABGR pixel data; also don't want R<->G swap before quant
    model.encode = (RENXt.IsDumb(nodetype)? encode_chplex: RENXt.IsParallel(nodetype)? encode_parallel: encode_series).bind(model);
    model.nodebytes = model.opts.nodebytes || Math.ceil(model.nodelist.length / 4 / 2); //memory size of nodes in controller; 2 nodes/byte, quad bytes
//    model.mips = model.opts.mips || 4.6; //processor speed (mips); older PIC16Fs are 4.5 MIPS, newer are 8 MIPS
    model.wait_states = function wait_states(opc) //use actual node memory size for more precise delays
    {
        switch (opc)
        {
//PIC16F takes ~ 50 instr (~11 usec @5 MIPS or ~7 usec @8 MIPS) to set 4 node-pairs (8 nodes), and chars arrive every ~ 44 usec (8N2 is 11 bits/char)
// (prop->desc.noderam > 10)? divup(prop->desc.noderam - 10, 5 /*5 MIPS, or 48 for 8 MIPS*/): 0); //PIC takes ~ 50 instr (~11 usec @5 MIPS or ~7 usec @8 MIPS) to set 4 node-pairs (8 nodes), and chars arrive every ~ 44 usec (8N2 is 11 bits/char), so delay next opcode to give set-all time to finish; use actual memory size allocated, for more precise delays
//latest: 5 MIPS: 48 nodes => 8 usec, 36 nodes => 5 usec, 20 nodes => 2 usec, 10 nodes => 0 usec
//timing: 16F1827 at 8 MIPS is taking 2 - 3 char times to set 640 nodes, so denominator above can be ~ 210
//???check this: 16F688 at 4.5 MIPS takes 2 - 3 char times for 40 nodes or 13 chars for 240 nodes
            case RENXt.SETALL: return Math.ceil((this.nodebytes - 10) / (((this.opts.mips || 4.6) == 8)? 48: 5));
            case RENXt.NODEFLUSH: return 999; //kludge: execution time depends on pixel type so just pick a large number to delay all remaining opcodes for this processor to end of pipeline
            case RENXt.ZCRESAMPLE:
            case RENXt.RESET:
            default: throw "Unhandled opcode: " + opc;
        }
    }.bind(model);
    model.old_render = model.render; //grab from instance rather than prototype in case it was overridden
    model.render = function render_custom()
    {
//debugger;
//            this.was_dirty = this.dirty;
//            var oldlen = port.outbuf.size();
        var my_outbuf = this.port.outbuf; this.port.outbuf = this.port.old_outbuf; //swap in original non-protocol outbuf
        this.port.outbuf.reset();
        var retval = this.old_render.apply(this, arguments); //capture rendered node list in outbuf
        if (this.port.outbuf.size())
        {
            this.raw_nodes = uint8ary_to_uint32ary(this.port.outbuf.peek()); //getContents(); //buf slice isn't observed by RgbQuant so do the extra buf alloc + copy here; //peek(); //node ARGB values to be encoded; NOTE: node list is sparse or reordered compared to canvas
//            var buf = [];
//            for (var i = 0; i < 10; ++i) buf.push(hex(this.port.outbuf.peekraw_nodes[i], 8));
//            console.log("raw nodes", this.port.outbuf.peek().slice(0, 100)); //buf.join(","));
            if (false)
            {
                var buf = [];
                for (var i = 0; i < 10; ++i) buf.push(hex(this.port.outbuf.peek()[i], 8));
                console.log("raw nodes for seq# %d:", this.port.seqnum, buf.join(', '));
                this.raw_nodes.inspect = buf_inspector_uint32ary.bind(this.raw_nodes);
            }
//            console.log("raw nodes", this.raw_nodes);
//if (this.port.seqnum > 5) process.exit(0);
            var oldlen = this.port.encbuf.wrlen;
            this.encode();
            logger(30, "RenXt encode '%s' adrs %s: %d node bytes -> %d enc bytes".blue, this.name, this.adrs, this.raw_nodes.length, this.port.encbuf.wrlen - oldlen);
//            logger(130, "nodes ARGB in: %s".blue, this.raw_nodes.inspect());
//            if (this.port.seqnum < 5)
//                logger(30, "enc out seq# %s: %d:%j".cyan, this.port.seqnum, this.port.encbuf.usedbuf.length, this.port.encbuf.usedbuf);
        }
        this.port.outbuf = my_outbuf; my_outbuf = null; //put back protocol outbuf for caller
        return retval;
    }.bind(model);
}


//capture outbound data for analysis:
//runs with port context
//function my_write(data, wrote_cb)
//{
//function xform(chunk, encoding, done)
//    port.inbuf.copy_outbound(data);
//    return port.old_write.apply(port, arguments);
//}


//flush port contents:
//runs with port context
function my_flush(args)
{
//    if (this.pending_trailer)
//    {
//        this.outbuf.write(this.pending_trailer);
//        this.pending_trailer = null;
//    }
    if (this.encbuf.wrlen) this.encbuf.emit_raw(RenXt.RENARD_SYNC); //terminate last opcode for more reliable packet parsing below; also helps reset controllers to know state at end of each frame
    logger("flush %d enc bytes", this.encbuf.wrlen);
    return this.old_flush.apply(this, arguments);
}

//    port.old_flush = port.flush;
//    port.flush = function flush_custom(seqnum) //use correct buffer
//    {
//        var old_outbuf = this.outbuf; //.getContents(); //slice(0, outlen); //kludge: no len param to write(), so trim buffer instead
//        this.outbuf = {getContents: function getcont_used() { return this.encbuf.usedbuf; }, size: function getcont_dummy() { return this.wrlen; }};
//        var retval = this.old_flush(seqnum);
//        this.outbuf = old_outbuf;
//        return retval;
//    }.bind(port);
/*
    port.flush = function flush_custom(frtime, force) //encode/compress raw nodes before sending
    {
//debugger;
//        (this.models || []).forEach(function dirty_each(model, inx, all) { model.was_dirty = model.dirty; }); //kludge: preserve dirty flag for encode()
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


//function RenXtProtocol() {} //dummy ctor
//RenXtProtocol.prototype.encode = encode;
//RenXtProtocol.prototype.validate = validate;

/*
function encode(nodes) //port, nodes,// first) //NOTE: runs in port context
{
//    if (!port.encbuf) port.encbuf = new RenXtBuffer(4000); //port.buf.length); //NOTE: don't do this until after all channels assigned
//    if (ZOMBIE_RECOVER) port.sent_config = false;
    this.encbuf.rewind();
    this.models.forEach(function encode_each(model, inx, all)
    {
        if (first || !this.cfg_sent) this.encbuf.SetConfig(model.adrs, model.opts.nodetype, model.nodebytes))
        if (!model.was_dirty) return; //no need to re-encode
//        var img = Uint32Array(model.numpx);
//        for (var i = 0; i < model.numpx; ++i) img[i] = model.buf; //abgr format
        if ((model.opts.nodetype || DefaultNodeType) <= RenXt.LAST_DUMBIO) encode_dumb.call(this, model); //, nodes);
        else encode_smart.call(this, model); //, nodes);
    }.bind(this));
    if (this.encbuf.wrlen) this.encbuf.emit_raw(RenXt.RENARD_SYNC); //send out a final sync to mark end of last packet
//        .flush(function flush_err(err)
//        {
//            if (err) { console.log("error: " + err); return; }
//            console.log("write+drain+delay done: %d bytes available", port.RenXt.rdlen);
//        });
    this.cfg_sent = true;
//    return port.encbuf.buffer;
}
*/


//start encoding for this model:
//runs with model context
function encode_adrs(first)
{
    if (first || !this.cfg_sent) //need to config addresses before sending anything else
        this.port.encbuf.SetConfig(this.adrs, this.opts.nodetype, this.nodebytes, this.port.encbuf.wrlen? 2: 5); //kludge: put an extra Syncs at beginning in case recipients were not paying attention
    else this.port.encbuf.SelectAdrs(this.adrs);
    this.cfg_sent = true;
//        if (!model.adrs) { console.log("RenXt encode: skipping model '%s' no address", model.name); return; }
//        model.want_cfg = true; //force config info to be sent first time; NOTE: must send config to all models on this port to set correct addresses
//        model.cfg_sent = false; //force config info to be sent first time
//    if (!(seqnum % WANT_COMM_DEBUG))
    if (this.opts.ack === false) return;
    if (this.sent_ack--) return; //check firmware status periodically
    this.sent_ack = (this.opts.ack === true)? 20: this.opts.ack; //do it again in 20 (default) frames, or however often caller chooses
    logger(30, "checking '%s' firmware status every %d frames".cyan, this.name || this.device, this.sent_ack || 20);
    this.port.encbuf
        .emit_opc(RENXt.ACK) //check listener/packet status
//        out.BeginOpcodeData(); //remainder of opcode bytes will be returned from processor
        .emit_byte(RENXt.NOOP, 5+1+1+1+1) //placeholders for status bits, i/o errs, proto errs, node bytes; CAUTION: must allow enough esc placeholders to protect next opcode
        .emit_raw(RENXt.RENARD_SYNC) //kludge: send extra Sync in case prev byte was Escape
        .SelectAdrs(this.adrs); //caller is expecting adrs as last item so resend
}


//var DataView = require('buffer-dataview');
//var toBuffer = require('typedarray-to-buffer')
var RgbQuant = require('rgbquant');
//NO var quant = new RgbQuant({colors: 16}); //need new one each time

function ARGB2ABGR(color) { return (color & 0xFF00FF00) | ((color >> 16) & 0xFF) | ((color << 16) & 0xFF0000); }

//encode series nodes for this model:
//places encoded nodes into port output buf
//model already deduped
//NOTE: runs with model context
function encode_series(first) //_smart(model) //, nodes)
{
    logger(100, "raw ARGB nodes", this.raw_nodes);
    logger(100, "series encode %d nodes, need quantize? %s", this.raw_nodes.length, this.raw_nodes.length > 16);
//    if (this.raw_nodes.length > 16) //do this even if <= 16 nodes (need to invert anyway)
//    {
    var myhist = histogram(this.raw_nodes, "raw RGB"); //{colors[], counts{}, index{}}
//    var quant = new RgbQuant({colors: 16, boxSize: [4, 4], boxPxls: 1}); //need new object each time?
//    boxSize: [4, 4], boxPxls: 1,
//TODO: dither?
//    dithXXXX: true, //maybe try dithKern, dithSerp, etc
//    colorDist: ??, //select color distance eqn?
    if (myhist.colors.length > 16) //reduce palette size
    {
        var quant = new RgbQuant({ colors: 16, method: 1, initColors: 0}); //4 bpp, 1D (no sub-boxes)
//NO: node.js buf len broken
        this.raw_nodes.forEach(function swapBG_each(color, inx, all) { all[inx] = ARGB2ABGR(color >>> 0); }); //kludge: RgbQuant wants nodes in ABGR format
        quant.sample(this.raw_nodes); //analyze histogram; wants ABGR
//    quant.colorStats1D(buf32) //wants ARGB, .length

//TODO: eliminate redundant histogram
//TODO: share palette across frames to reduce frame-to-frame color variations
        var quant_pal = uint8ary_to_uint32ary(quant.palette()); //build palette; ABGR entries
        quant_pal.inspect = buf_inspector_uint32ary.bind(quant_pal);
        logger(100, "quant pal RGBA %s", typeof quant_pal, quant_pal.inspect());
//    console.log("palbuf %s %j", typeof palbuf, palbuf);
//then generate reduced palette:
        var indexed_nodes = quant.reduce(this.raw_nodes, 2); //reduce colors in image; retType 2 = Indexed array
        indexed_nodes.inspect = buf_inspector_uint32ary.bind(indexed_nodes);
        logger(100, "reduced %s", typeof indexed_nodes, indexed_nodes.inspect());
        indexed_nodes.forEach(function swapBG_each(colorinx, nodeinx, all) { all[nodeinx] = ARGB2ABGR(quant.idxi32[colorinx] >>> 0); }); //kludge: unindex colors before my histogram
        logger(100, "reduced + restored nodes %s", typeof indexed_nodes, indexed_nodes.inspect());
        myhist = histogram(indexed_nodes, "my reduced"); //{colors[], counts{}, index{}}
//        myhist.colors.forEach(function unindex_each(quant_inx, list_inx, all) { all[list_inx] = quant_pal[quant_inx]; }); //kludge: reload palette with un-quant colors
        indexed_nodes.forEach(function index_each(color, nodeinx) { indexed_nodes[nodeinx] = myhist.index[color & 0xFFFFFF]; });
    }
    else
    {
        var indexed_nodes = [];
        this.raw_nodes.forEach(function index_each(color, nodeinx) { indexed_nodes[nodeinx] = myhist.index[color & 0xFFFFFF]; });
    }
    indexed_nodes.inspect = buf_inspector_uint32ary.bind(indexed_nodes);
    logger(100, "indexed, reduced nodes", indexed_nodes);
//    myhist.colors_rgb = []; //quant shim
//    myhist.colors.forEach(function swap_each(color, inx, all) { myhist.colors_rgb[inx] = ((color & 0xFF) << 16) | (color & 0xFF00) | ((color >> 16) & 0xFF); }); //put in RGB order
//    myhist.colors_rgb.inspect = buf_inspector_uint32ary.bind(myhist.colors_rgb);
//    console.log("final RGB palette", myhist.colors_rgb);
/* TODO: SetAll(non-0) if #pal ents == 1
    if ((myhist.colors.length < 16) && !myhist.counts[0]) //add black to improve changes of palette reuse in next frame
    {
        myhist.counts[0] = 1;
        myhist.index[0] = myhist.colors.count;
        myhist.colors.push(0);
    }
*/

//    console.log("renxt: model '%s', #nodes %s, #pal %s vs limit %s, BAD reduced #ents %s", this.name, this.raw_nodes.length / 4, pal.length, Object.keys(counts).length, reduced.length);
    encode_adrs.apply(this, arguments); //send config, select adrs, etc.
//estimate encoded sizes of bitmaps vs. inverted lists and choose the more compact option:
//TODO: allow shared palette across frames or models
    var most_common = myhist.counts[myhist.colors[0]]; //quant.histogram[quant.idxi32[quant.idxi32.length - 1]];
    var bpp = (myhist.colors.length <= 1)? 0: (myhist.colors.length <= 2)? 1: (myhist.colors.length <= 4)? 2: (myhist.colors.length <= 16)? 4: 999; //#bits per pixel
    var pallen = 1 + 3 * myhist.colors.length;
    var bitmap_size = pallen + 3 + (bpp? Math.ceil(indexed_nodes.length / (8 / bpp)): 0) + 1; //SetPal + SetAll or Bitmap + NodeFlush opcodes
    var inverted_size = pallen + myhist.colors.length + indexed_nodes.length - most_common + 1; //SetPal + SetAll + Nodelist + NodeFlush opcodes
    var use_bitmap = (bpp && (bitmap_size < inverted_size)); //flat bitmap is more compact than inverted lists
    logger(100, "est enc size: bmpsize %d, invsize %d, use bmp? %s, pal len %s ents, %d bytes, %s bpp bitmap %s+%s=%s bytes, inverted lists %s+%s=%s bytes, most common #%s = %s", bitmap_size, inverted_size, use_bitmap, myhist.colors.length, pallen, bpp, pallen, bitmap_size - pallen, bitmap_size, pallen, inverted_size - pallen, inverted_size, hex(myhist.colors[0], 8), myhist.counts[myhist.colors[0]]); //quant.idxi32[quant.idxi32.length - 1], 8), myhist.colors[0], myhist.counts[myhist.colors[0]]); //quant.histogram[quant.idxi32[quant.idxi32.length - 1]]);

    var need_palette = true;
    if (this.prior_palette) //check if previous palette contained all the colors needed
    {
//        console.log("color hist", myhist);
//debugger;
        if (myhist.colors.every(function pal_enum(color) { return this.prior_palette.counts[color]; }.bind(this))) //all colors found
            if (use_bitmap) need_palette = false; //bitmap just needs all colors present, any order
            else if (this.prior_palette.counts[this.prior_palette.colors[0]] == this.prior_palette.counts[myhist.colors[0]]) need_palette = false; //can use same bkg color
        var buf = '';
        myhist.colors.forEach(function pal_enum(color, inx) { buf += ', #' + hex(color, 8) + '=' + myhist.counts[color]; });
        logger(10, "seq# %s, model '%s' needs palette? %s #ents %d, use_bitmap? %s, same most common freq? %s (%s vs. %s), pal: %s".blue, this.port.seqnum, this.name, need_palette, myhist.colors.length, use_bitmap? bpp + ' bpp': false, this.prior_palette.counts[this.prior_palette.colors[0]] == this.prior_palette.counts[myhist.colors[0]], hex(this.prior_palette.colors[0], 8), hex(myhist.colors[0]), buf.substr(2));
    }

    if (need_palette)
    {
        this.port.encbuf
//        .SelectAdrs(this.adrs)
            .SetPal(myhist.colors, this.opts.output); //this.pal); //TODO: concat/trunc palette; TODO: share palette across models + frames?
        this.prior_palette = myhist;
    }
//TODO: GECE RGB2IBGRZ color conv
//TODO: splitable
    if (use_bitmap) //bpp && (bitmap_size < inverted_size)) //flat bitmap
    {
        this.port.encbuf
            .emit_opc(RENXt.BITMAP(bpp))
//TODO: quad bytes?
//NOTE: firmware does a NodeFlush after receiving the bitmap, so wait states are needed following the bitmap if it fully completes
            .emit_byte(Math.ceil(indexed_nodes.length * bpp / 8) + 1) //no I/O delay needed because rcv rate is faster than send rate in all cases; kludge: +1 to prevent firmware auto-flush
            .emit_byte(0); //TODO: skip first part of bitmap if it didn't change
        var curbyte = 0;
        while (indexed_nodes.length % (8 / bpp)) indexed_nodes.push(0); //pad to fill last node group
        logger(100, "pack %s nodes", indexed_nodes.length);
        indexed_nodes.forEach(function pack_each(colorinx, nodeinx)
        {
            curbyte <<= bpp;
            curbyte |= colorinx;
//            if (nodeinx % (8 / bpp)) return; //byte not full yet
            if ((nodeinx + 1) % (8 / bpp)) return; //don't have all the bits for this byte yet
//1 bpp: 2468 1357 => 0008 0007, 0006 0005, 0004 0003, 0002 0001
//2 bpp: 2244 1133 => 0044 0033, 0022 0011
//4 bpp: 1111 2222
            switch (bpp) //shuffle packed bits to format wanted by firmware
            {
                case 1: //8765 4321 =-> 2468 1357
                    curbyte = ((curbyte & 0x80) >> 3) | ((curbyte & 0x40) >> 6) | (curbyte & 0x20) | ((curbyte & 0x10) >> 3) | ((curbyte & 0x08) << 3) | (curbyte & 0x04) | ((curbyte & 0x02) << 6) | ((curbyte & 0x01) << 3);
                    break;
                case 2: //4433 2211 => 2244 1133
                    curbyte = ((curbyte & 0xc0) >> 2) | ((curbyte & 0x30) >> 4) | ((curbyte & 0x0c) << 4) | ((curbyte & 0x03) << 2);
                    break;
            }
            this.port.encbuf.emit_byte(curbyte); //flush current group of nodes
        }.bind(this));
//not needed; next model follows anyway        this.port.encbuf.SelectAdrs(this.adrs); //start next packet instead of sending last bitmap byte to inhibit auto-flush
    }
    else //inverted node lists
    {
        var nodelists = [];
        myhist.colors.forEach(function mk_nodelist() { nodelists.push([]); }); //create a node list for each color palette entry
        indexed_nodes.forEach(function split_each(colorinx, nodeinx) { if (colorinx) nodelists[colorinx].push(nodeinx); }); //split nodes into inverted lists
        myhist.colors.forEach(function inverted_each(color, palinx)
        {
//TODO: SetAll+Flush? (firmware update)
            if (!palinx) //background color uses SetAll instead of a node list
            {
//                var svopc = this.port.encbuf.opc_blocks[this.adrs].length;
                this.port.encbuf.SetAll(0, this.wait_states);
//                if (this.port.encbuf.opc_blocks[this.adrs].length != svopc)
                if (this.port.encbuf.opc_blocks.latest.delay_next)
                    this.port.encbuf.SelectAdrs(this.adrs); //wait state needed on next opcode, so emit adrs again
                return;
            }
            nodelists[palinx].sort(); //node inx must be in increasing order for correct bank switching
            var node_esc = RENXt.NODELIST(palinx); //esc code to start next list or switch banks
            var prevbank = RENXt.NodeBank(0), prevofs = RENXt.NodeOffset(0); //reset bank tracking
            this.port.encbuf.emit_opc(node_esc);
            nodelists[palinx].forEach(function invnode_each(nodeinx)
            {
                for (var newbank = RENXt.NodeBank(nodeinx); newbank > prevbank; ++prevbank) //check for bank switch
                {
                    var implicit = (newbank == prevbank + 1) && (RENXt.NodeOffset(nodeinx) <= prevofs) && RENXt.NodeOffset(nodeinx); //kludge: disable implicit bank switch on first node
                    logger(100, "out byte[%d]: new node %d, prev node %d, implicit bank switch? %d", this.port.encbuf.wrlen, nodeinx, RENXt.MakeNode(prevbank, prevofs), implicit);
                    if (!implicit) this.port.encbuf.emit_byte(node_esc); //explicit jump to next bank
                }
//obsolete??        if (!*nodeptr) out.emit(node_esc, 7); //kludge: incorrect bank switch on node 0
                prevofs = RENXt.NodeOffset(nodeinx);
                this.port.encbuf.emit_byte(prevofs);
            }.bind(this));
        }.bind(this));
        if (myhist.colors.length > 1) this.port.encbuf.emit_byte(RENXt.NODELIST_END); //end of inverted lists
    }
    this.port.encbuf
        .NodeFlush(this.wait_states)
        .EndOfOpcode(); //mark end of last block
}


function encode_parallel(first) //, nodes)
{
    encode_adrs.apply(this, arguments); //send config, select adrs, etc.
//nodetype: RenXt.WS281X(RenXt.PARALLEL)
    this.port.encbuf
//        .SelectAdrs(this.adrs)
        .emit_buf(new Buffer("TODO: PARALLEL"))
        .NodeFlush(this.wait_states)
        .EndOfOpcode(); //mark end of last block
}


function encode_chplex(first)
{
//debugger;
//TODO: xlate RGBW format into 4 separate monochrome channels?
    var chplex = RENXt.IsChplex(this.opts.nodetype || DefaultNodeType);
    var pwm = (this.raw_nodes.length != 56); //TODO: make this selectable?
//     RENXt.CHPLEX(RENXt.ACTIVE_HIGH), RENXt.CHPLEX(RENXt.ACTIVE_LOW))); }
//    var numrows = Math.ceil(this.raw_nodes.length / 7);
    var mono_nodes = []; //typically 8 PWM or 56 ch'plexed channels per controller
//    for (var r = 0; r < numrows /*this.height*/; ++r) mono_nodes.push([]); //allow node lists by row
    this.raw_nodes.forEach(function chplex_each(color, inx) //generate display event list for chplex firmware
    {
        var br = Brightness(color);
        if (!br) return; //discard Off channels; they are off by default
        var row = chplex? Math.floor(inx / 7) + 1: 0, col = (chplex? inx % 7: inx) + 1;
        if (chplex && (col >= row)) ++col; //skip diagonal; row cannot == column
        mono_nodes.push({br: br, row: row, col: col});
    });
    mono_nodes.sort(function chplex_sort(lhs, rhs) { return (rhs.br - lhs.br) || (rhs.row - lhs.row) || (rhs.col - lhs.col); }); //descending; phase angle dimming requires brightest channels first; group channels by row
    if ((mono_nodes[0] || {}).br != 255) mono_nodes.unshift({br: 255, row: 0, col: 0}); //inject dummy event to delay first on (phase angel dimming requires precise start time); need at least one event to turn channels off
    logger(120, "sorted %s nodes, chplex? %s, pwm? %s".blue, mono_nodes.length, chplex, pwm, mono_nodes);

    encode_adrs.apply(this, arguments); //send config, select adrs, etc.
//use phase angle dimming model for DC as well (to simplify the logic):
//TODO: SSR doublers, variable DC dim cycle, dumb set-all
    var brightness = 255; //start with max/total brightness (dumb nodes only); AC phase angle requires this, but DC/PWM can be in any order
//    var delay_first = mono_nodes.length? brightness - mono_nodes[0].br: 0; //dummy event is needed to delay first on; don't need delay if node list is empty / all off
//    var listlen = 3 * mono_nodes.length - 1 + 1 + (delay? 1: 0) + 1; // + 1; //handle eol marker as part of padding; NOTE: don't need event for full off, but need one to pad out dimming cycle
    var listlen = 1; //(delay_first? 3: 0) + 1; // + 1; //handle eol marker as part of padding; NOTE: don't need event for full off, but need one to pad out dimming cycle
    mono_nodes.forEach(function chplex_count(node, inx, all) { if (!inx || (node.br != all[inx - 1].br) || (node.row != all[inx - 1].row)) listlen += 3; }); //row start
    var colmasks = {}; //columns on by active row
//    var tailpad = (listlen % 4)? 4 - (listlen % 4): 0; //padlen(listlen, 4);
//    console.log("first dumb: cur br %d, first %d, duration %d, listlen %d, padlen %d", brightness, mono_nodes[0].br, delay, listlen, tailpad);
    this.port.encbuf
//        .SelectAdrs(this.adrs)
        .emit_opc(RENXt.DUMBLIST) //start of dumb pixel display event list (chplex/pwm)
        .emit_byte(Math.ceil(listlen / 4)) //quad bytes
        .emit_byte(0); //no skip for now
//    if (delay_first) this.port.encbuf.emit_byte(delay_first).emit_byte(0, 2); //first event (no rows, no cols) to delay first on
//    brightness -= delay;
//remainder of dumb pixel display event list (chplex/pwm):
    mono_nodes.forEach(function chplex_each(node, inx, all)
    {
        if (!inx || (node.br != all[inx - 1].br) || (node.row != all[inx - 1].row)) //row start
        {
            var delay_next = /*RGB2R(it->first)*/ brightness - ((inx + 1 != all.length)? all[inx + 1].br: 0); //NOTE: dimming might be behind schedule, so use actual brightness rather than desired brightness here
            if (delay_next < 1) delay_next = 1; //must be >= 1 timeslot for triacs to turn on; if we fall behind we can catch up later
            this.port.encbuf.emit_byte(delay_next);
            brightness -= delay_next;
//        var row = chplex? node.row: 0; //node_lists[it->first].front() / 7: 0;
//                    int colmask = 0;
            if (!(pwm && chplex)) colmasks[node.row] = 0; //not cumulative (not pseudo-pwm)
        }
        colmasks[node.row] |= 0x100 >> node.col;
        logger(130, "node[%s/%s] node br %s => row %s 0x%s, col %s cols 0x%s".blue, inx, all.length, node.br, node.row, (0x100 >> node.row).toString(16), node.col, colmasks[node.row].toString(16));
        if ((inx + 1 == all.length) || (node.br != all[inx + 1].br) || (node.row != all[inx + 1].row)) //row end
        {
            this.port.encbuf
                .emit_byte(0x100 >> node.row) //chplex? 0x100 >> node.row: node.row) //convert to mask if chipiplexed; leave 0 for pwm (no row)
                .emit_byte(colmasks[node.row]); //cumulative column map for this row
            logger(40, "out dumb evt: next brightness %s, row 0x%s, cols 0x%s, delay_next %s".blue, brightness, (chplex? 0x100 >> node.row: node.row).toString(16), colmasks[node.row].toString(16), delay_next);
//                    brightness -= delay; //RGB2R(it->first);
        }
    }.bind(this));
//    console.log("dumb tail pad %d + eof", tailpad);
    this.port.encbuf
        .emit_byte(0, 4 * Math.ceil(listlen / 4) - listlen + 1) //end of list marker + quad-byte padding
        .NodeFlush(this.wait_states) //flush changes; must be last opcode for this processor
        .EndOfOpcode(); //mark end of last block
}


//first analyze nodes:
//used only for debug
function histogram(nodes, desc)
{
//    var keys = {}, counts = [];
//    require('my-plugins/utils/showthis').call(nodes, "nodes");
    var counts = {}, index = {length: 0};
    if (nodes.data) nodes = nodes.data;
    if (nodes.readUInt32BE) //buffer
        for (var i = 0; i < nodes.length; i += 4)
        {
            var color = nodes.readUInt32BE(i) & 0xFFFFFF; //nodes[i] & 0x00FFFFFF; //>>> 8; //ABGR, drop A
            if (!++counts[color] /*isNaN*/) { counts[color] = 1; index[color] = index.length++; }
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
            var color = nodes[i] & 0xFFFFFF; //ABGR, drop A
            if (!++counts[color] /*isNaN*/) { counts[color] = 1; index[color] = index.length++; }
        }
    var palette = Object.keys(counts);
    palette.sort(function pal_sort(lhs, rhs) { return (counts[rhs] - counts[lhs]) || (rhs - lhs); }); //descending order
    palette.inspect = buf_inspector_uint32ary.bind(palette);
//    var buf = '';
//    palette.forEach(function pal_enum(color) { buf += ', #' + hex(color, 6) + ' * ' + counts[color]; });
//    console.log((desc || '') + " palette %d ents:", palette.length, buf.substr(2));
    logger(100, (desc || '') + " myhist palette", palette);
    return {colors: palette, counts: counts, index: index};
}


//bad hoist: var verbuf = new RenXtBuffer();

//const VER_STATES = {'sync'
const REN_EOF = 0x200;


/*
//compare port inbuf with saved outbuf:
//this helps catch firmware bugs and comm problems by verifying outbuf was received and processed
//NOTE: this code runs async after I/O has occurred, so it can only report errors and not prevent them
//i tried preventing errors with synchronous check and resend, but then the sequence timing suffers due to USB latency (and the logic must be very efficient)
//if comm errors are infrequent, then an async detection after is okay; this makes code efficiency less important
function my_verify(final_incomplete) //outbuf, inbuf)
{
    for (;;)
    {
        if (!this.inbuf.size()) return; //no loopback data to verify against
        if (!this.ioverify.length) return; //no packets to verify yet
        var iorec = this.ioverify[0]; // {seqnum, data, len, sendtime}
        if ((iorec.veri_ofs || 0) < iorec.data.length) break; //found a frame to verify
        this.inbuf.getContents(iorec.veri_skip);
        this.ioverify.shift();
    }
//        if (this.inbuf.size() < iorec.len) return; //not enough data to verify
//        var elapsed = new Elapsed(iorec.sendtime);
    if (!++iorec.veri_retry /-*isNaN*-/) iorec.veri_retry = 1;
    console.log("trying to verify iorec", iorec);
    if (!this.sentbuf)
    {
        this.sentbuf = new RenXtBuffer(); //reduce ctor overhead by only instantiating once
        this.sentbuf.consume = function sent_consume(iorec) { iorec.veri_ofs = this.rdofs; } //consume packets from saved state
    }
    this.sentbuf.buffer = iorec.data;
    this.sentbuf.rdofs = iorec.veri_ofs || 0;
    this.sentbuf.rdlen = iorec.len;
//restore inbuf parser state:
//TODO: merge with data handler or flush()?
    if (!this.veribuf)
    {
        this.veribuf = new RenXtBuffer(); //reduce ctor overhead by only instantiating once
        this.veribuf.consume = function veri_consume(inbuf) { iorec.veri_skip = this.rdofs; } //inbuf.getContents(this.rdofs); this.rdlen -= this.rdofs; this.rdofs = 0; }
    }
    this.veribuf.buffer = this.inbuf.peek();
    this.veribuf.rdofs = iorec.veri_skip || 0;
    this.veribuf.rdlen = this.inbuf.size();
//    if (!this.veribuf.rdlen) return; //nothing to verify

    var sent = null, rcvd = null;
    for (;;)
    {
//TODO: use parse() for ReadMem + controller enum as well
//debugger;
        if (!sent) sent = this.sentbuf.parse(true, final_incomplete); //{adrs, seqnum, lit, data}
        if (!rcvd) rcvd = this.veribuf.parse(true, final_incomplete);
        if (!sent || !rcvd) //wait for more data; no need for further checking unless we have 2 valid packets to compare
        {
            if (!sent && !rcvd) { console.log("all data %sverified!", !final_incomplete? '(so far) ': ''); return; }
            if (!sent && rcvd) console.log("extra data rcvd:", rcvd);
            if (sent && !rcvd) console.log("data not rcvd:", sent);
            if (final_incomplete) setTimeout(function veri_delayed() { this.verify.apply(this, arguments); }.bind(this), 1000);
            return;
        }
        if (rcvd.adrs != sent.adrs + 0x80) //use "+" instead of "|" so if sent is wrong the check will fail
        {
            console.log("adrs/status mismatch: got 0x%s, expected 0x%s", (rcvd.adrs + 0).toString(16), (sent.adrs + 0x80).toString(16));
            if ((sent.adrs & 0x7F) < (rcvd.adrs & 0x7F)) { sent = null; this.sentbuf.consume(iorec); continue; }
            if ((sent.adrs & 0x7F) > (rcvd.adrs & 0x7F)) { rcvd = null; this.veribuf.consume(this.inbuf); continue; }
        }
        if (rcvd.seqnum != sent.seqnum)
        {
            console.log("seq# mismatch: got 0x%s, expected 0x%s", rcvd.seqnum.toString(16), sent.seqnum.toString(16));
            if (sent.seqnum < rcvd.seqnum) { sent = null; this.sentbuf.consume(iorec); continue; }
            if (sent.seqnum > rcvd.seqnum) { rcvd = null; this.veribuf.consume(this.inbuf); continue; }
        }
        var cmp = bufdiff(sent.lit, rcvd.lit);
        if (cmp) console.log("lit mismatch %j: got %d:'%j', expected %d:'%j'", cmp, (rcvd.lit || []).length, rcvd.lit, (sent.lit || []).length, sent.lit);
//        else console.log("got lit data %j %d:'%s'", cmp, (rcvd.lit || []).length, rcvd.lit);
        cmp = bufdiff(sent.data, rcvd.data);
        if (cmp) console.log("got var data %j %d:'%j' vs %j", cmp, (rcvd.data || []).length, rcvd.data, sent.data);
//        else console.log("no var data %j %d:'%s'", cmp, (rcvd.data || []).length, rcvd.data);
        this.sentbuf.consume(iorec);
        this.veribuf.consume(this.inbuf);
        sent = rcvd = null;
    }
}
*/

/*
    var ch, junk;
    for (;;)
        switch (iorec.veri_state || 'sync-both')
        {
            case 'sync-both':
                if (this.sentbuf.deque_byte()) != RenXt.RENARD_SYNC) throw "Sent junk before Sync?";
                while (this.sentbuf.deque_byte()) == RenXt.RENARD_SYNC); //skip over multiple Syncs
                --this.sentbuf.rdofs; //restore prev byte
                iorec.veri_state = 'sync-in';
                iorec.veri_ofs = this.sentbuf.rdofs;
                //fall thru
            case 'sync':
                junk = 0;
                while ((ch = this.veribuf.deque_byte()) & ~ REN_EOF != RenXt.RENARD_SYNC) ++junk;
                if (junk) console.log("ignoring junk loopback: %d", junk, this.inbuf.getContent(junk)); //consume junk so we don't need to look at it again
                if (ch & REN_EOF) return;
                while (this.veribuf.deque_byte()) == RenXt.RENARD_SYNC); //skip over multiple Syncs
                iorec.veri_state = 'adrs';
                //fall thru
            case 'adrs':
                var adrs = this.sentbuf.deque_byte();
                ch = this.veribuf.deque_byte();
                if ((adrs & 0x80) == (ch & 0x80))
                {
                    console.log("adrs mismatch: got 0x%s, expected 0x%s", ch.toString(16), adrs.toString(16));
                    if (adrs & 0x7F < ch & 0x7F) { iorec.veri_state = 'skip-sent
                }
                console.log("no sync for ctlr 0x%s @'0x%s", ctlr_adrs.toString(16), this.rdofs.toString(16)); return false; } //skip multiple syncs (useful for loopback test)
                if (this.sentbuf.isempty()) return;
            uint8 = this.deque_byte();
            if ((uint8 & 0x7F) != ctlr_adrs) { console.log("wrong controller: got 0x%s vs expected 0x%s @'0x%s", uint8.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
            else if (uint8 != (ctlr_adrs | 0x80)) { console.log("no response from controller 0x%s @'0x%s", ctlr_adrs.toString(16), this.rdofs.toString(16)); return false; } //continue; }
            uint8 = this.deque_byte();
            if (uint8 != RenXt.READ_REG) { console.log("wrong command: got 0x%s vs. expected 0x%s for ctlr 0x%s @'0x%s", uint8.toString(16), RenXt.READ_REG.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
            uint16 = this.deque_uint16();
            if (uint16 != mem_adrs) { console.log("wrong address: got 0x%s vs. expected 0x%s for ctlr 0x%s @'0x%s", uint16.toString(16), mem_adrs.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
            break;
        }
*/


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Transform stream:
//

const inherits = require('inherits');
const makenew = require('my-plugins/utils/makenew');
//const Elapsed = require('my-plugins/utils/elapsed');
//const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
const stmon = require('my-plugins/streamers/stmon').stmon;
//var split = require('split'); //https://github.com/dominictarr/split
const streamBuffer = require('stream-buffers'); //https://github.com/samcday/node-stream-buffer
const stream = require('stream');
//const Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
var Transform = stream.Transform || require('readable-stream').Transform;


//RenXt stream to transform serial loopback data to parsed pkts:
//this analyzes serial loopback data for comm or firmware errors
//runs async behind actual port I/O
//const RenXtLoopback = module.exports.RenXtLoopback =
function LoopbackStream(opts)
{
//debugger;
    if (!(this instanceof LoopbackStream)) return makenew(LoopbackStream, arguments);
//    this.objectMode = true; //requires source text stream to be split
//    this.objectMode = true; //one read/write per record on binary data (ignores length)
    if (typeof opts != 'object') opts = {};
    opts.writableObjectMode = false; //coming from serial port, receives chunks of chars
    opts.readableObjectMode = true; //writing parsed packets; NOTE: must be passed in thru ctor to work correctly
    Transform.call(this, opts); //arguments); //base class ctor

//NOTE: can instantiate custom stream directly; see http://stackoverflow.com/questions/21491567/how-to-implement-a-writable-stream
//however, we use derivation in order to allow multiple instances
//    this.on('end', function onend() { console.log("%d json objects read", count); });
    stmon(this, "RenXtLoopbackStream", true);
    if (opts.dest) this.pipe(opts.dest);
//debugger;

    this.elapsed = new Elapsed();
    this.fifo = new RenXtBuffer(4096); //TODO: replace with stream-buffer?
//    this.fifo.fr_count = 0;
    this.fifo.src = "loopbk";
//    this.fifo = new streamBuffer.WritableStreamBuffer(); //default size 8K; should be enough, but is growable anyway
//    this.fifo.buffer.fill = function filler(val) { if (this.size()) this.peek().fill(val); } //"this" == streamBuffer
//    Object.defineProperty(this.fifo.buffer, 'length', { get() { return this.size(); }});
//    this.fifo.buffer.slice = function slicer(start, end) { return this.size()? this.peek(start || 0, (end || this.size()) - (start || 0)): null; }
//    this.bufxt.rewind(); //already done
    var oldpush = this.push;
    this.push = function mypush(args) { logger(99, "push"); return oldpush.apply(this, arguments); }
}
inherits(LoopbackStream, Transform);


//kludge: replace input fifo with outbuf and run it thru analyser before trashing it:
LoopbackStream.prototype.non_xform =
function non_xform(morebuf)
{
    var svfifo = this.fifo;
    this.fifo = morebuf;
    this.fifo.rdlen = this.fifo.wrlen; //make it look like incoming
//debugger;
    this._transform(null, null, function nop() {}, false);
    this.fifo = svfifo;
}


LoopbackStream.prototype._transform =
function xform(chunk, encoding, done, eof)
{
//    var frdata = deserialize(chunk, encoding);
//    this.emit('frame', frdata); //TODO: keep this?
    if (chunk && !Buffer.isBuffer(chunk) /*typeof chunk == 'string'*/) chunk = new Buffer(chunk, encoding);
    if (chunk) { this.fifo.wrlen = this.fifo.rdlen; this.fifo.emit_rawbuf(chunk); this.fifo.rdlen = this.fifo.wrlen; } //kludge: reusing inbuf as outbuf
    logger(110, "loopback: incoming %s len %s, total fifo now %s, data: %s".blue, encoding, chunk? chunk.length: "(eof)", this.fifo.rdlen, unprintable(this.fifo.buffer.slice(0, this.fifo.rdlen).toString()));
    if (chunk) //no need to parse unless something important came in
    {
        if (chunk.indexOf(RENXt.RENARD_SYNC) == -1) { done(); return; } //packet should begin/end with Sync
        if (this.fifo.rdlen /*- this.fifo.rdofs*/ < 10) { done(); return; } //a packet can be shorter than 10 bytes, but it's not very likely
    }
//    this.fifo.rdlen = this.fifo.buffer.size();
    this.fifo.rdofs = 0; //start parsing at beginning of buf

//done(); return;
    var eatlen = 0;
    for (;;) //try to parse incoming packets back into data requests
    {
        var parsed = this.fifo.parse(true, !chunk && (eof !== false)); //{adrs, seqnum, lit, data}
        if (!parsed) break;
        parsed.src = this.fifo.src; //show where it came from
        if (!++this.fifo.fr_count /*isNaN*/) this.fifo.fr_count = 1;
        parsed.pktnum = this.fifo.fr_count;
        parsed.elaped = this.elapsed.now; //mainly for debug
        var opc = parsed.lit? parsed.lit[0]: null;
        if (opc) parsed.opc = OpcodeNames(opc) || ('#' + hex(opc, 2)); //mainly for debug
        parsed.litlen = (parsed.lit || []).length; //mainly for debug
        parsed.datalen = (parsed.data || []).length; //mainly for debug
        this.push(JSON.my_stringify(parsed) + '\n');
        logger(10, "loopback: parsed pkt# %s, %s remaining".cyan, parsed.pktnum, this.fifo.rdlen - this.fifo.rdofs);
        eatlen = this.fifo.rdofs; //remove valid packet from fifo
    }
    if (eatlen) this.fifo.remove(0, eatlen); //consume successfully parsed data
    done();
}


LoopbackStream.prototype._flush =
function flusher(done)
{
    logger(10, "renxt loopback flush".cyan);
    this.xform(null, null, done);
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Protocol helpers:
//

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
        .flush(function io_err(err)
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
            ctlrs.forEach(function found_each(ctlr, inx)
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
    if (!buf.readUInt32BE) buf.readUInt32BE = function byte_shuffle(ofs) { return (this[ofs] << 24) | (this[ofs + 1] << 16) | (this[ofs + 2] << 8) | this[ofs + 3]; }
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

//function buf_inspector_uint8ary(depth, opts) //make debug easier
//{
//    var buf = '';
//    if (!this.readUInt32BE) this.readUInt32BE = function byte_shuffle(ofs) { return (this[ofs] << 24) | (this[ofs + 1] << 16) | (this[ofs + 2] << 8) | this[ofs + 3]; }
//    for (var ofs = 0, limit = this.length; ofs < limit; ofs += 4)
//    {
//        if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (limit - ofs) / 4 + ' '; break; }
//        buf += ' #' + hex(this.readUInt32BE(ofs), 8);
//    }
//    return '<ARGB-buf:' + (limit / 4) + ' ' + buf + '>';
//}

function buf_inspector_uint32ary(depth, opts) //make debug easier
{
    var buf = '';
    for (var ofs = 0, limit = this.length; ofs < limit; ++ofs)
    {
        if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += ' ... ' + (limit - ofs) / 4 + ' '; break; }
        buf += ' #' + hex(this[ofs], 8);
    }
    return '<buf-uint32:' + limit + ' ' + buf + '>';
}


var color_cache = require('my-projects/models/color-cache').cache;
var argb_splitter = new Buffer(4);

function Brightness(color)
{
    color &= 0xFFFFFF; //drop A
    if (!color) return 0;
    var brightness = color_cache(color + '%', function brightness_compute()
    {
        argb_splitter.writeUInt32BE(color, 0);
        return Math.max(argb_splitter[1], argb_splitter[2], argb_splitter[3]); //TODO: use weighted value?
    });
    return brightness;
}


function hex(val, len)
{
    if (!len) len = 8;
    return ('00000000' + (val >>> 0).toString(16)).slice(-len);
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Protocol-aware port buffer:
//

var RenXt = RENXt; //require('my-plugins/hw/RenXt');
var Struct = require('struct'); //https://github.com/xdenser/node-struct
//var DataView = require('buffer-dataview'); //https://github.com/TooTallNate/node-buffer-dataview
//var makenew = require('my-plugins/utils/makenew');


//TODO: derive from stream buffer?
function RenXtBuffer(opts)
{
    if (!(this instanceof RenXtBuffer)) return makenew(RenXtBuffer, arguments); //{port, buflen}
//    this.port = opts.port;
    opts = (typeof opts !== 'object')? {buflen: opts}: opts || {};
    this.buffer = new Buffer(opts.buflen || 4096); //NOTE: ignore FPS restrictions to simplify special cases such as initial enum
    Object.defineProperty(this, 'usedbuf', {get() { return this.buffer.slice(0, this.wrlen); }});

//    this.dataview = new DataView(this.buffer);
    this.stats_opc = {length: 0}; //new Uint8ClampedArray(256); //Uint16Array(256);
    this.stats_interleave = {}; //padlen: 0, count: 0, changed: 0, unchanged: 0, loop: 0};
//    this.stats_opc.fill(0);
//    this.waits = {};
//    this.port.on('data', function port_rcv(data) //collect incoming data
//    {
//        this.latest = this.elapsed.now;
//        if (Buffer.isBuffer(data)) { data.copy(this.buffer, this.rdlen); this.rdlen += data.length; }
//        else { this.buffer.write(data, this.rdlen, data.length); this.rdlen += data.length; }
//    }.bind(this));
    this.rewind();
}


//if (sport.rewind) console.log("rewind was already there".red);
//NOTE: rewind() must be called before doing I/O
RenXtBuffer.prototype.rewind =
function rewind()
{
    this.rdofs = this.rdlen = this.wrlen = 0;
//    if (!this.buffer) this.buffer = new Buffer(4000); //NOTE: ignore FPS restrictions to simplify special cases such as initial enum
//    if (!this.dataview) this.dataview = new DataView(this.buffer);
//    if (!this.stats_opc) this.stats_opc = new Uint16Array(256);
    this.buffer.fill(0xee); //for easier debug
//no;preserve    this.stats_opc.fill(0);
    this.opc_blocks = {}; //{}; //length: 0};
    return this; //fluent
}

RenXtBuffer.prototype.hasroom =
function hasroom(len)
{
    return (this.wrlen + len <= this.buffer.length);
//    return Math.max(this.buffer.length - this.wrlen - (len || 0), 0); //0 => false
}

RenXtBuffer.prototype.isempty =
function isempty(len)
{
    return (this.rdofs + (len || 0) >= this.rdlen);
}

//RenXtBuffer.prototype.isempty =
//function usedlen()
//{
//    return this.rdlen - this.rdofs;
//}

//if (sport.flush) console.log("flush was already there".red);
RenXtBuffer.prototype.flush =
function flush(cb)
{
//write + drain:
    this.elapsed = new Elapsed();
    if (!cb) cb = function dummy_cb(err) { return err; }
    if (!this.wrlen) return process.nextTick(function cb_delayed() { cb(); }); //this.port.write_drain(this.buffer, this.wrlen);
    var outbuf = (this.wrlen < this.buffer.length)? this.buffer.slice(0, this.wrlen): this.buffer; //kludge: no len param to write(), so trim buffer instead
    if (this.wrlen > this.buffer.length) console.log("out buf overflow: %d (max %d)".red, this.wrlen, this.buffer.byteLength);
//    for (var ofs = 0; ofs < this.wrlen; ofs += 64)
//        console.log("write[%d/%d] ", ofs, this.wrlen, this.buffer.slice(ofs, 64));
    console.log("write %d ", this.wrlen, outbuf);
    return this.port.write(outbuf, function port_written(err, results)
    {
//        console.log(typeof outbuf);
        var outdesc = outbuf.length + ':"' + ((typeof outbuf === 'string')? outbuf: (outbuf.toString('utf8').substr(0, 20) + '...')).replace(/\n/g, "\\n") + '"';
        if (err) return cb(err); //{ console.log('write "%s" err after %s: '.red, outdesc, this.elapsed.scaled(), err); return cb(err); }
        console.log('write "%s" ok after %s; results %d:'.green, outdesc, this.elapsed.scaled(), results.length, results);
        this.port.drain(function port_drained(err)
        {
            if (err) return cb(err); //{ console.log('drain %s err '.red + err, outdesc); return cb(err); }
            console.log("drain %s completed after %s".green, outdesc, this.elapsed.scaled());
            setTimeout(function drain_delayed() //return data should be no more than 1 char time (44 usec) per controller, but allow extra due to USB timing
            {
                console.log("%d bytes avail, latest came at %d msec", this.rdlen, this.latest);
                console.log(this.buffer.slice(0, this.rdlen));
                return cb();
            }.bind(this), 1000); //should only need to wait 10 msec max for response, but USB latency is taking longer; //1000 * (1 + 8 + 1 + 1) / 242500 * 16
        }.bind(this));
    }.bind(this));
}

RenXtBuffer.prototype.EndOfOpcode =
function EndOfOpcode()
{
    if (typeof this.opc_blocks.latest != 'undefined') //mark end of previous block
        this.opc_blocks.latest.len = this.wrlen - this.opc_blocks.latest.stofs;
}

RenXtBuffer.prototype.SelectAdrs =
function SelectAdrs(adrs, sync_count)
{
//    /*if (this.waits.length)*/ this.waits.push({ofs: this.wrlen, adrs: adrs}); //allow all opc after first delayed to be reordered
    this.EndOfOpcode(); //mark end of previous block
    this.opc_blocks.latest = {stofs: this.wrlen, adrs: adrs}; //remember start of next block
    var opc_block = this.opc_blocks[adrs];
    if (!opc_block) opc_block = this.opc_blocks[adrs] = [];
    opc_block.push(this.opc_blocks.latest);
    this
        .emit_raw(RenXt.RENARD_SYNC, sync_count || 1)
        .emit_raw(adrs);
    return this; //fluent
}
//    var delayed = this.waits[adrs];
//    if (delayed) delayed.nxtofs = this.wrofs; //push({ofs: this.wrofs});
//    this.waits.forEach(function undelay(opc, inx, all)
//    {
//        if (this.wrlen >=
//    });
//    this.waits.push({ofs: this.wrlen, delay: 0, adrs: adrs});
/*
    var delayed = this.waits[0];
    if (!delayed); //no outstanding wait states; don't need to block next set of opcodes
    else if (adrs != delayed.adrs) //ins ahead of delayed opc
    {
        delayed.buf = new Buffer(this.wrlen - delayed.ofs);
        this.buffer.copy(delayed.buf, 0, delayed.ofs, this.wrlen);
        console.log("waits: move '%s..%s to holding buf[%s]", delayed.ofs, this.wrlen, 0);
        this.wrlen = delayed.ofs;
    }
    else if (this.wrlen < delayed.ofs + delayed.count) this.waits.push({ofs: this.wrlen, adrs: adrs}); //fence needed; previous wait state unsatisfied
    else //previous wait state satisfied
    {
debugger;
        console.log("waitst: shift opc from '%s to '%s..%s, fill '%s..%s, grows by %s", wait.ofs, wait.delay + wait.count, wait.ofs, wait.delay + wait.count, wait.delay + wait.count - wait.ofs);
        if (wait.count == 999) return;
        this.encbuf.buffer.copy(this.encbuf.buffer, wait.ofs, wait.delay + wait.count, wait.delay + wait.count + this.wrlen - wait.ofs);
        this.encbuf.buffer.fill(RENXt.NOOP, wait.ofs, wait.delay + wait.count);
        this.wrlen += wait.delay + wait.count - wait.ofs;
    }
*/

RenXtBuffer.prototype.SetConfig =
function SetConfig(adrs, node_type, node_bytes, sync_count)
{
//    if (typeof node_type == 'undefined') node_type = RenXt.WS281X(RenXt.SERIES);
    this
//        .emit_raw(RenXt.RENARD_SYNC, sync_count)
//        .emit_raw(adrs)
        .SelectAdrs(adrs, sync_count) //count > 1 to allow controllers to auto-detect baud rate or stop what they were doing first time
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
        .emit_opc(RenXt.SETTYPE(node_type || DefaultNodeType)) //changes value if nodes not already sent
//NOTE: 1.14 firmware does NOT do a SetAll after setting node type
        .emit_opc(RenXt.NODEBYTES) //sets node count to next byte (prep for clear-all or set-all); no wait states so group it with SetType
        .emit_byte(node_bytes || 16); //ABS(prop->desc.numnodes) / 2);
    return this; //fluent
}

RenXtBuffer.prototype.SetPal =
function SetPal(/*adrs,*/ colors, order)
{
//    if (arguments.length < 2) { colors = adrs; adrs = undefined; } //shuffle optional params
    if ((typeof colors != 'object') || !colors.length) colors = arguments; //if (!Array.isArray(colors)) colors = arguments;
//console.log("setpal isary? %s", Array.isArray(colors));
//console.log("setpal args", arguments);
    if ((colors.length < 1) || (colors.length > 16)) throw "Invalid palette length: " + colors.length;
//    if (typeof adrs != 'undefined') this //start new block
//        .emit_raw(RenXt.RENARD_SYNC)
//        .emit_raw(adrs);
    this.emit_opc(RenXt.SETPAL(colors.length));
//    Array.from/*prototype.slice.call*/(arguments).slice(1).forEach(function pal_each(color, inx)
    colors.forEach(function pal_each(color, inx)
    {
        var method = 'emit_' + (order || 'RGB').toLowerCase();
        if (!this[method]) throw "No " + method + " method";
        this[method](color >>> 0);
    }.bind(this));
    return this; //fluent
}

RenXtBuffer.prototype.NodeFlush =
function NodeFlush(wait_states) //adrs)
{
//    if (typeof adrs != 'undefined') this //start new block
//        .emit_raw(RenXt.RENARD_SYNC)
//        .emit_raw(adrs);
    this
        .emit_opc(RenXt.NODEFLUSH)
//latest: 5 MIPS: 48 => 8, 36 => 5, 20 => 2, 10 => 0
//timing: 16F1827 at 8 MIPS is taking 2 - 3 char times to set 640 nodes, so denominator above can be ~ 210
//???check this: 16F688 at 4.5 MIPS takes 2 - 3 char times for 40 nodes or 13 chars for 240 nodes
//        .pad(10); //TODO: interleave + wait states
        .delay_next(wait_states(RenXt.NODEFLUSH)); //force to end of packet to avoid idle comm time
    return this; //fluent
}

RenXtBuffer.prototype.SetAll =
function SetAll(/*adrs,*/ palinx, wait_states)
{
//    if (typeof adrs != 'undefined') this //start new block
//        .emit_raw(RenXt.RENARD_SYNC)
//        .emit_raw(adrs);
    this
        .emit_opc(RenXt.SETALL(palinx))
//        .pad(10); //TODO: interleave + wait states
        .delay_next(wait_states(RenXt.SETALL)); //force interleave to avoid idle comm time
    return this; //fluent
}

RenXtBuffer.prototype.emit_buf =
function emit_buf(buf, len)
{
//    if (typeof buf == 'string') buf = new Buffer(buf)
    if (arguments.length < 2) len = buf.length || 0;
//TODO: use buffer.indexOf to scan for special chars, then buffer.copy?
    for (var ofs = 0; ofs < len; ++ofs) this.emit_byte(buf[ofs]); //copy byte-by-byte to handle special chars and padding; escapes will be inserted as necessary
    return this; //fluent
}


RenXtBuffer.prototype.emit_rawbuf =
function emit_rawbuf(buf, len)
{
//    len = len || buf.length || 0;
    if (arguments.length < 2) len = buf.length || 0;
//    if (typeof buf == 'string') buf. //make caller do it
//    for (var ofs = 0; ofs < len; ++ofs) this.emit_raw(values[ofs]); //copy byte-by-byte to handle special chars and padding; caller is responsible for escapes
    /*if (this.wrlen + len <= this.buffer.length)*/ buf.copy(this.buffer, this.wrlen, 0, len);
    this.wrlen += len;
    return this; //fluent
}

RenXtBuffer.prototype.emit_rgb =
function emit_rgb(rgb) //ensure correct byte order
{
//NOTE: send each byte separately in case of special char conflict
    this.emit_byte(rgb >> 16); //RGB2R(rgb));
    this.emit_byte(rgb >> 8); //RGB2G(rgb));
    this.emit_byte(rgb); //RGB2B(rgb));
//    this.buffer.writeUInt32BE(rgb << 8, ofs); ofs += 3;
    return this; //fluent
}

RenXtBuffer.prototype.emit_grb =
function emit_grb(grb) //ensure correct byte order
{
//NOTE: send each byte separately in case of special char conflict
    this.emit_byte(grb >> 8); //RGB2G(rgb));
    this.emit_byte(grb >> 16); //RGB2R(rgb));
    this.emit_byte(grb); //RGB2B(rgb));
//    this.buffer.writeUInt32BE(rgb << 8, ofs); ofs += 3;
    return this; //fluent
}

RenXtBuffer.prototype.emit_bgr =
function emit_bgr(rgb) //ensure correct byte order
{
//NOTE: send each byte separately in case of special char conflict
    this.emit_byte(bgr); //RGB2B(rgb));
    this.emit_byte(bgr >> 8); //RGB2G(rgb));
    this.emit_byte(bgr >> 16); //RGB2R(rgb));
//    this.buffer.writeUInt32BE(rgb << 8, ofs); ofs += 3;
    return this; //fluent
}

RenXtBuffer.prototype.emit_uint32 =
function emit_uint32(val) //ensure correct byte order
{
//NOTE: send each byte separately in case of special char conflict; can't use raw 32 because val might contain special bytes that need to be escaped
    this.emit_byte(val >> 24); //val / 0x1000000);
    this.emit_byte(val >> 16); //val / 0x10000);
    this.emit_byte(val >> 8); //val / 0x100);
    this.emit_byte(val); //val);
//    this.buffer.writeUInt32BE(val, ofs); ofs += 4;
    return this; //fluent
}

RenXtBuffer.prototype.emit_uint16 =
function emit_uint16(val, count) //ensure correct byte order
{
    if (typeof count === 'undefined') count = 1;
    while (count-- > 0)
    {
        this.emit_byte(val >> 8); /// 0x100);
        this.emit_byte(val); // % 0x100);
    }
    return this; //fluent
}

RenXtBuffer.prototype.emit_uint16_raw =
function emit_uint16_raw(val, count) //ensure correct byte order
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

RenXtBuffer.prototype.emit_opc =
function emit_opc(value, count)
{
//    this.has_opc = true;
    if (!(this.stats_opc[value] += count || 1) /*isNaN*/) { this.stats_opc[value] = count || 1; ++this.stats_opc.length; }
    this.emit_raw(value, count); //NOTE: assumes opcode doesn't need to be escaped, which should be the case (only data bytes should need esc)
    return this; //fluent
}

RenXtBuffer.prototype.interleave =
function interleave()
{
//    this.opc_blocks.forEach(function enum_adrs(blocks_by_adrs, adrs) //set min delay for each opcode
//    {
//        var opc_ofs = 0;
//        blocks_by_adrs.forEach(function block_enum(opc_block) //, inx, all) //cycle thru all addresses
//        {
//            if (!opc_block.min_delay) opc_min.delay = opc_ofs;
//            opc_ofs += opc_block.len + (opc_block.delay_next || 0);
//        });
//    });
debugger;
    delete this.opc_blocks.latest; //mainly for debug; remove clutter
    var opc_bytes = new Buffer(this.buffer), outofs = 0, padlen = 0, numiter = 0;
    for (;;) //re-emit all opcodes; choose order to minimize delays by overlapping wait states
    {
        logger(150, "opc blocks: %s", JSON.stringify(this.opc_blocks)); //NOTE: already sorted by start time
        var next_opc = null;
        this.opc_blocks.forEach(function block_enum(opc_block) //, inx, all) //cycle thru next opcode for all addresses
        {
            if ((typeof opc_block != 'object') || !opc_block.length) return;
//            if (typeof opc_block.min_start == 'undefined') opc_block.min_start = outofs; //soonest that unspecified block can now
//            if (opc_block.delay_next)
            if ((next_opc !== null) && ((opc_block[0].min_start || outofs) >= next_opc.min_start)) return;
            next_opc = Object.assign({min_start: outofs}, opc_block[0]);
        });
        if (next_opc === null) break; //all opcodes re-emitted
        if (next_opc.min_start > outofs) //gap needed to satisfy wait state
        {
            padlen += next_opc.pad_len = next_opc.min_start - outofs; //mainly for debug
            this.buffer.fill(0, outofs, next_opc.min_start);
            outofs = next_opc.min_start;
        }
        opc_bytes.copy(this.buffer, outofs, next_opc.stofs, next_opc.stofs + next_opc.len);
        outofs += next_opc.len;
        this.opc_blocks[next_opc.adrs].shift();
        if (next_opc.delay_next && this.opc_blocks[next_opc.adrs].length) this.opc_blocks[next_opc.adrs][0].min_start = outofs + next_opc.delay_next;
        logger(120, "next opc: %s, new out ofs %d".blue, next_opc, outofs);
        if (!++this.stats_interleave.numiter) this.stats_interleave.numiter = 1;
    }
    if (!(this.stats_interleave.padlen += padlen)) this.stats_interleave.padlen = padlen;
    if (padlen) if (!++this.stats_interleave.count) this.stats_interleave.count = 1;
    var cmp = bufdiff(opc_bytes, this.buffer), cmp_rev = cmp? bufdiff.reverse(opc_bytes, this.buffer): 0;
    if (cmp) console.log("interleave: cmp: %d, %d".cyan, cmp, cmp_rev);
    if (cmp) { if (!++this.stats_interleave.changed) this.stats_interleave.changed = 1; }
    else { if (!++this.stats_interleave.unchanged) this.stats_interleave.unchanged = 1; }
/*
"2":
    {"stofs":0,"adrs":2,"len":13},
    {"stofs":13,"adrs":2,"delay_next":999,"len":8}
"3":
    {"stofs":21,"adrs":3,"len":13},
    {"stofs":34,"adrs":3,"delay_next":999,"len":8}
"4":
    {"stofs":42,"adrs":4,"len":13},
    {"stofs":55,"adrs":4,"delay_next":999,"len":8}
"5":
    {"stofs":63,"adrs":5,"len":13},
    {"stofs":76,"adrs":5,"delay_next":999,"len":8}
"6":
    {"stofs":84,"adrs":6,"len":13},
    {"stofs":97,"adrs":6,"delay_next":999,"len":8}
"85":
    {"stofs":105,"adrs":85,"len":13},
    {"stofs":118,"adrs":85,"delay_next":999,"len":8}
*/
}
/*
    this.rdofs = 0;
    this.rdlen = this.wrlen;
//    if (true) //interleave opcodes so wait states overlap with other processors (reduces serial bandwidth wastage)
    {
    }
//no interleave; just pad opcodes to enforce wait states
    for (;;)
    {
        var wait = this.waits.shift(); //{ofs, delay, adrs}
        if (!wait) break;
        this.rdofs = wait.ofs;
        var byte = this.deque_raw();
        if ((byte & ~REN_EOF) != RenXt.RENARD_SYNC) throw "Expected Sync after opcode with wait state";
        if (byte & REN_EOF) return; //all further wait states will be correct at end of packet

    }
    this.waits.push({ofs: this.wrlen, delay: count || 1}); //set wait state for current opcode
}
    console.log("wait states:", this.waits, "max delay inx: ", maxdel_inx);
/-*
   aAaaaAbBbbbBcCcccC
     ^   ^ ^   ^ ^   ^
   aAbBbbbBcCcccCaaaA
     ^   ^
*-/
    var maxdel_inx = this.waits.reduce(function find_latest(old_inx, wait, new_inx, all) { return ((wait.delay != 999) && (wait.delay > all[old_inx].delay))? new_inx: old_inx); });
    if (max_delay > this.encbuf.wrlen)
    {
        console.log("waitst: pad buf +%s for longest wait '%s", max_delay - this.encbuf.wrlen, max_delay);
        this.encbuf.emit_byte(RENXt.NOOP, max_delay - this.encbuf.wrlen); //pad outbuf to reach longest wait state
    }
    this.waits.forEach(function delay_opc(wait, inx, all) //interleave opcodes to reduce wait states
    {
debugger;
        if (!inx) return;
        var prior = all[inx - 1]; prior.buflen = wait.ofs - prior.ofs; //run 1 back for reduce
        if (prior.delay > this.encbuf.wrlen) this.encbuf.emit_byte(RENXt.NOOP, prior.delay - this.encbuf.wrlen);
        this.encbuf.buffer.copy(this.encbuf.buffer, prior.ofs, this.wrlen, this.wrlen + wait.ofs - prior.ofs);
        this.encbuf.buffer.copy(this.encbuf.buffer, wait.ofs, prior.ofs, this.wrlen + wait.ofs - prior.ofs);
        console.log("waitst: shift opc from '%s..%s to '%s, fill with '%s..%s", prior.ofs, wait.ofs, this.wrlen, wait.ofs, this.wrlen - this.ofs);

wait.delay + wait.count, wait.delay + wait.count + this.wrlen - wait.ofs);
        if (wait.count == 999) return;
        this.encbuf.buffer.fill(RENXt.NOOP, wait.ofs, wait.delay + wait.count);
        this.wrlen += wait.delay + wait.count - wait.ofs;
    });
//    if (this.waits.length) this.waits = [];
*/


RenXtBuffer.prototype.delay_next =
function delay_next(count)
{
    if (count < 1) return; //no need to delay next opcode
//    if (this.waits[count[1]]) throw "duplicate wait state for adrs " + count[1];
//    /*var delayed =*/ this.waits[count[1]] = {last_ofs: this.wrlen, delay: count[0] || 1}; //.push(); //set wait state for current opcode
//    this.waits.push({ofs: this.wrlen, delay: count[0] || 1, adrs: count[1]}); //fence; delay next opcode if necessary
//    opc_blocks.push(this.opc_latest = {ofs: this.wrlen});
    this.opc_blocks.latest.delay_next = count; //temporarily remember pad len until start of next opcode (if any)
    return this; //fluent
}

RenXtBuffer.prototype.pad =
function pad(count)
{
    this.since_pad = 0; //avoid recursion
    this.emit_raw(RenXt.RENARD_PAD, count);
//    stats_opc[RENARD_PAD] += count || 1;
//    debug(10, "pad @'0x%x, @rate %d", used, pad_rate);
    return this; //fluent
}

//if (sport.emit) console.log("emit was already there".red);
RenXtBuffer.prototype.emit_byte =
function emit_byte(value, count)
{
    if (RenXt.IsRenardSpecial(value)) this.emit_uint16_raw((RenXt.RENARD_ESCAPE << 8) | (value & 0xFF), count);
//            ++stats_opc[RENARD_ESCAPE];
//            if (doing_opcode && doing_opcode->enclen) ++doing_opcode->enclen; //include extra esc codes in count
    else this.emit_raw(value, count);
    return this; //fluent
}

//if (sport.emit_raw) console.log("emit_raw was already there".red);
RenXtBuffer.prototype.emit_raw =
function emit_raw(value, count)
{
    if (typeof count === 'undefined') count = 1;
    while (count-- > 0)
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

RenXtBuffer.prototype.readreq =
function readreq(ctlr_adrs, mem_adrs, len)
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


//remove part of buffer (intended for parsing):
RenXtBuffer.prototype.remove =
function remove(ofs, len)
{
    if (typeof ofs == 'undefined') ofs = 0;
    if (typeof len == 'undefined') len = (this.rdlen || this.wrlen) - ofs;
    if ((this.rdlen || this.wrlen) > ofs + len) this.buffer.copy(this.buffer, ofs, ofs + len, this.rdlen || this.wrlen);
    if (this.rdofs >= ofs + len) this.rdofs -= len;
    else if (this.rdofs >= ofs) this.rdofs = ofs;
    if (this.rdlen >= ofs + len) this.rdlen -= len;
    else if (this.rdlen >= ofs) this.rdlen = ofs;
}


//parse a packet:
//consists of: one or more syncs (optional, caller selectable), literal bytes/opcodes, variable (data) bytes for a read/status opcode
//since variable data opcodes must end with sync, there can only be one variable data field in each packet and it occurs at the end
RenXtBuffer.prototype.parse =
function parse(want_sync, ignore_trailer)
{
//debugger;
    var retval = {};
    retval.numsync = 0;
    if (this.isempty()) return null;
    var svofs = this.rdofs, byte, num_bytes;
    while ((byte = this.deque_byte()) == RenXt.RENARD_SYNC) ++retval.numsync; //skip over multiple Syncs
    if (!(byte & REN_EOF)) --this.rdofs; //preserve last non-sync byte
//    retval.numsync = this.rdofs - svofs;
    if (want_sync)
    {
        if (!retval.numsync) logger(120, "missing sync @'%d/%d: %s".blue, svofs, this.rdlen /*buffer.length*/, this.buffer.slice(svofs, this.rdlen).toString()); //this.buffer.length)); //TODO: discard?
        if ((want_sync === 1) && (retval.numsync > 1)) logger(120, "too many syncs %d @'%d/%d: %s", retval.numsync, svofs, this.rdlen /*this.buffer.length*/, this.buffer.slice(svofs, this.rdlen).toString()); //TODO: discard?
        retval.adrs = this.deque_byte();
        if (retval.adrs & REN_EOF) retval.adrs = null; //TODO: discard? can't be Sync (loop above ate all Syncs)
    }
    svofs = this.rdofs;
    num_bytes = 0;
    var opc_trailer = 0;
    for (;;)
    {
        if ((byte = this.deque_byte()) == RENXt.RENARD_SYNC) { --this.rdofs; break; } //preserve Sync for next packet
        if (byte & REN_EOF) break;
        ++num_bytes;
        if (opc_trailer && !--opc_trailer) break;
//TODO: ignore opcodes within NodeLists
//Const_RENXt('DataOpcodes', {RENXt.READ_REG: 2, RENXt.ACK: 0});
        if (!opc_trailer && (byte in RENXt.DataOpcodes)) opc_trailer = RENXt.DataOpcodes[byte]; //{ num_bytes += RENXt.DataOpcodes[byte]; break; } //include fixed length of opcode
    }
    this.rdofs = svofs;
    if (!num_bytes) logger(120, "no lit bytes @'%d/%d: %s".blue, svofs, this.rdlen /*this.buffer.length*/, this.buffer.slice(svofs, this.rdlen).toString()); //buffer.length));
    retval.lit = this.deque_buf(num_bytes); //(this.rdofs != svofs)? this.buffer.slice(svofs, this.rdofs): null;
    svofs = this.rdofs;
    num_bytes = 0;
    for (;;)
    {
        if ((byte = this.deque_byte()) == RENXt.RENARD_SYNC) { --this.rdofs; break; } //preserve Sync for next packet
        if (byte & REN_EOF) break;
        ++num_bytes;
    }
    this.rdofs = svofs;
    retval.data = this.deque_buf(num_bytes); //(this.rdofs != svofs)? this.buffer.slice(svofs, this.rdofs): null;
    if (this.deque_byte() == RENXt.RENARD_SYNC) { --this.rdofs; retval.ok = true; } //preserve Sync for next packet
    else
    {
        if (want_sync) logger(120, "incomplete packet (missing trailing Sync) @'%d/%d: %s".blue, svofs, this.rdlen /*this.buffer.length*/, this.buffer.slice(svofs, this.rdlen).toString()); //buffer.length));
        if (!ignore_trailer) retval = null; //don't give back partial packets //.ok = true;
    }
    return retval; //retval.ok? retval: null;
}


//RenXtBuffer.prototype.expect =
//function expect(char, eof_match)
//{
//}


RenXtBuffer.prototype.deque_sync =
function deque_sync(skip_junk)
{
//    debug(99, "deque_sync(skip? %s): used %s, rdofs 0x%s, buf 0x%s", skip_junk, used, rdofs.toString(16), ((rdofs < frbuf.size())? frbuf[rdofs]: -1).toString(16));
    if (!skip_junk) return (this.deque_raw() == RenXt.RENARD_SYNC);
    for (;;)
    {
        if (!this.isempty(1) /*(this.rdofs + 1 < this.rdlen)*/ && (this.buffer[this.rdofs] == RenXt.RENARD_ESCAPE)) { this.rdofs += 2; continue; } //not a real Sync
        if (this.deque_raw() != RenXt.RENARD_SYNC) continue;
        while (!this.isempty() /*(this.rdofs < this.rdlen)*/ && (this.buffer[this.rdofs] == RenXt.RENARD_SYNC)) ++this.rdofs; //consume multiple Sync if there
        return true;
    }
}

RenXtBuffer.prototype.deque_uint16 =
function deque_uint16() //ensure correct byte order
{
    var retval = this.deque_byte() << 8; //big endian
    retval |= this.deque_byte();
    return retval;
}

RenXtBuffer.prototype.deque_buf =
function deque_buf(len)
{
    if (len < 1) return null;
    var retbuf = new Buffer(len);
    for (var ofs = 0; ofs < len; ++ofs)
        retbuf[ofs] = this.deque_byte(); //copy byte-by-byte to handle special chars and padding
    return retbuf;
}

RenXtBuffer.prototype.deque_byte =
function deque_byte(eof_value)
{
    var esc_bit = 0;
    if (!this.isempty() /*(this.rdofs < this.rdlen)*/ && (this.buffer[this.rdofs] == RenXt.RENARD_ESCAPE)) { ++this.rdofs; esc_bit = 0x100; }
    return this.deque_raw(eof_value) | esc_bit; //adorn escaped chars so caller can distinguish Sync from data containing a Sync char
}

RenXtBuffer.prototype.deque_raw =
function deque_raw(eof_value)
{
    if (!this.isempty() /*this.rdofs < this.rdlen*/) return /*this.PrevByte =*/ this.buffer[this.rdofs++];
    return /*this.PrevByte =*/ ((typeof eof_value != 'undefined')? eof_value: RenXt.RENARD_SYNC) | 0x200; //simulate Sync if past end of buffer (trying for benign effect on parsing loops)
}

RenXtBuffer.prototype.deque_readreq =
function deque_readreq(ctlr_adrs, mem_adrs, len)
{
    var uint8, uint16;
    for (;;)
    {
        if (this.isempty()) return false;
        if (!this.deque_sync(true)) { console.log("no sync for ctlr 0x%s @'0x%s", ctlr_adrs.toString(16), this.rdofs.toString(16)); return false; } //skip multiple syncs (useful for loopback test)
        uint8 = this.deque_byte();
        if ((uint8 & 0x7F) != ctlr_adrs) { console.log("wrong controller: got 0x%s vs expected 0x%s @'0x%s", uint8.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
        else if (uint8 != (ctlr_adrs | 0x80)) { console.log("no response from controller 0x%s @'0x%s", ctlr_adrs.toString(16), this.rdofs.toString(16)); return false; } //continue; }
        uint8 = this.deque_byte();
        if (uint8 != RenXt.READ_REG) { console.log("wrong command: got 0x%s vs. expected 0x%s for ctlr 0x%s @'0x%s", uint8.toString(16), RenXt.READ_REG.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
        uint16 = this.deque_uint16();
        if (uint16 != mem_adrs) { console.log("wrong address: got 0x%s vs. expected 0x%s for ctlr 0x%s @'0x%s", uint16.toString(16), mem_adrs.toString(16), ctlr_adrs.toString(16), this.rdofs.toString(16)); continue; }
        break;
    }
//    while (len -- > 0) *(((byte*)buf)++) = out.deque_byte();
    return this.deque_buf(Math.floor(len * 1.2));
}


//eof
