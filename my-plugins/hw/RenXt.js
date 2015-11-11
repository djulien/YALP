//RenXT protocol consts
//based on ver 1.14 RenXT.h

'use strict';

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


//////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports.AddMixin = function(port)
{
    console.log("TODO: add RenXt protocol to port '%s'", port.name, port);
}

//eof
