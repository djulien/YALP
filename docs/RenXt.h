//RenXt protocol - Copyright (c) 2009 - 2013 Don Julien.
//RenXt api - Copyright (c) 2013 Don Julien.

//Key RenXt design parameters:
//1. simple, icon-like graphics (no high fidelity video).  therefore a smaller palette (~ 16 entries) can be used
//2. serial port (baud rate auto-detect).  since typical node I/O time is 30 usec, this allows <= 333k baud sustained; use 250k as max
//3. round-loop data.  serial out from last controller comes back to PC, for 2-way communication, comm error detection, auto-discovery of controllers, and performance analysis (downloadable stats)
//4. data compression.  raw channel data has plenty of redundant data (such as nulls), so high compression rates are possible
//5. higher hardware utilization.  use low-end PICs to handle larger numbers of nodes (7x or more compared to other controllers)
//6. reuse existing hardware.  RenXt firmware can be used to retrofit/upgrade existing Renard controllers.  provide firmware for common PICs: 16F688, 12F1840, 12F1825.  chipiplexing retrofit also works
//7. minimal cabling.  allow intermixing of GECE, WS2811, AC SSRs on same comm line, and serial daisy chain
//8. AC SSRs contain latching devices (Triacs), so utilize those for muxed I/O.  requires minimal holding current and allowx 7x as many channels per PIC
//9. auto-detect AC rate.  50 Hz vs. 60 Hz vs. none; anything above 10 Hz will be used
//10. reliable: optional ext clock, wdt to catch bugs
//11. free-running demo/test mode, interrupted by real data
//12. C source code

//provides wrappers to low-level functions to make integration with target sequencer (Vixen 2.x, Nutcracker/XLights, Vixen 3?, HLS?, etc) easier, since there are many choices now
//history:
// 1.0-1.12  8/28/13  DJ  re-created from earlier works
// 1.13  2/20/14  DJ  added start offset for GetBitmap (mainly for windowed GECE I/O); added Front Panel node type; bumped protocol version
//      10/27/14 DJ fix common cathode bit on Chplex + PWM
//
//Packet structure (Sync, Escape, Pad codes) is based loosely on the original Renard protocol by P. Short, but the similarity ends there
//RenXt packets contain streams of variable length "opcodes", which are interpreted by the firmware
//Not all uControllers support all opcodes, so some of them might be ignored; however, the minimal base set should be supported by all uControllers

//firmware has 3 modes:
//- demo/test mode: free-running hard-coded sequence, but listens for serial data to switch to live mode if comm port was clean during startup period (first 2 sec)
//- live mode: receiving data packets via serial port; decoded by protocol handler and acted upon
//- I/O busy: pass-thru mode during node I/O; not enough RAM for double buffering of smart nodes or instruction bandwidth for multi-tasking, so protocol handler is inhibited until node I/O is complete; pass-thru allows other controllers to receive their data
//normally all serial data is passed thru as-is; the only exceptions are address enum (where an available address is claimed), and memory reads (requested data sent)

//opcodes are grouped by upper nibble, with the lower nibble selecting an individual function or containing data
//this allows space-efficient decode/dispatch using short jump tables (16 entries each), or faster dispatch using one large jump table (256 entries)
//NOTE: do not change the value of an opcode after implementing it in firmware; jump table entry offsets will be messed up

//protocol summary:
//;In theory the Renard-RGB data packet format is compatible with the standard Renard protocol,
//;  allowing intermixing of Renard-RGB and Renard Classic on the same port or even same controller PCB.
//;However, Vixen does not allow multiple plug-ins to share the same COM port.  To compensate for this,
//;  Renard-RGB PWM mode can be used as a substitute for Renard Classic, in essence allowing them to be intermixed.
//;
//;The Renard-RGB data packet format is as follows:
//; - first byte = Sync (0x7E)
//; - second byte = Address byte; 0 = null address, 0xFF = all (broadcast), anything else = individual props
//; - TODO: maybe sequence#? (to check for dropped packets)
//; - third byte = Function code:
//					(list)
//; - last byte = Checksum (Xor of all bytes in packet)

//;                 0x0F = PIC address: 0..15 in lower nibble; gives a max capacity of 16 PICs * 400 pixels = 6400 pixels per COM port.
//;                        After power-up, the PICs will consume the first data packet seen, and NOT pass it down-stream as is done with Renard Classic.
//;                        The first packet is used to assign an address to each PIC.  After assignment, PICs will pass *all* data packets downstream.
//;                        Multiple PICs can actually be assigned the same address if desired, for prop mirroring/multi-cast.
//;                        This is similar to how addressing is handled by the GECE protocol.
//;                 0xF0 = mode:
//;                        0x00 = null packet (discardable); used mainly for auto-baud detect or address setup
//;                        0x10 = transparent bitmap (overlay) mode: 1 bit per pixel, all 400 pixels specified (50 bytes), off bits remain unchanged
//;                        0x20 = RESERVED FOR: transparent bitmap (overlay) mode, 2 bits per pixel (100 bytes)
//;                        0x30 = macro function mode (TBD); probably a demo/test sequence
//;                        0x40 = RESERVED FOR: transparent bitmap (overlay) mode, 4 bits per pixel (200 bytes)
//;                        0x50 = PWM mode: 8 bytes of PWM channels for DIYCFloods (dual-node RGBW), LED strings, relays, etc (equivalent to Renard Classic PWM mode)
//;                        0x60 = transparent low nodelist (overlay) mode: 1 byte per pixel, variable length up to 256 bytes, unspecified pixels remain unchanged
//;                        0x70 = transparent high nodelist (overlay) mode: 1 byte per pixel, variable length up to 144 bytes, unspecified pixels remain unchanged
//;                        0x80 = Chipiplex mode: TBD (equivalent to 8-bit Renard-HC)
//;                        0x90 = opaque bitmap (refresh) mode: 1 bit per pixel, all 400 pixels are specified (50 bytes), off bits are cleared to background color
//;                        0xA0 = RESERVED FOR: opaque bitmap (refresh) mode, 2 bits per pixel (100 bytes)
//;                        0xB0 = TBD
//;                        0xC0 = RESERVED FOR: opaque bitmap (refresh) mode, 4 bits per pixel (200 bytes)
//;                        0xD0 = TBD
//;                        0xE0 = opaque low nodelist (refresh) mode: 1 byte per pixel, variable length up to 400 bytes, unspecified pixels set to background color
//;                        0xF0 = opaque high nodelist (refresh) mode: 1 byte per pixel, variable length up to 144 bytes, unspecified pixels set to background color
//; - color palette = 3 bytes per entry; #entries varies according to address mode:
//;                   - for transparent bitmap modes (1/2/4 bpp), there are 2^#bits - 1 palette entries
//;                   - for transparent nodelist mode (1 Bpp), there is 1 palette entry
//;                   - for opaque bitmap modes (1/2/4 bpp), there are 2^#bits palette entries; first entry is background color
//;                   - for opaque nodelist mode (1 Bpp), there are 2 palette entries; first entry is background color
//;                   - for GECE modes, the 3 bytes are in the format used by the GECE strings: Intensity (8 bits), Blue (4 bits), Green (4 bits), Red (4 bits), then 4 unused bits padding
//;                   - for PWM mode, the format is 4 bytes: red, green, blue, white; TBD: should white be substituted if red == green == blue?
//; - pixel values = byte array as follows:
//;                   - for transparent or opaque bitmap modes (1/2/4 bpp), fixed #bytes (50, 100, or 200), one entry for each pixel
//;                   - for transparent or opaque nodelist modes (1 Bpp), first byte = #bytes that follow, then the list of bytes representing pixel#s (0-based);
//;                     pixel#s are mod 256 (1 byte per pixel) and occur in increasing order, so a pixel# < previous pixel# is assumed to mean pixel#+256;
//;                     if the first pixel# > 255, then address mode high nodelist should be used (to force first pixel# to be interpreted as > 255)
//;The Renard-GE Vixen plug-in will insert a Pad char (0x7D) every 55 bytes, to prevent overrun errors if PC clock is slightly faster than PIC clock.  PIC will strip these out.
//;Any occurrence of Sync (0x7E) or Pad (0x7D) bytes within data packet will be escaped with a 0x7F in front (same as Renard classic protocol).
//;Using the same Sync, Pad and Escape chars as Renard allows Renard-RGB to be intermixed on the same COM port with Renard Classic (theoretically),
//;  although address/command byte and pass-thru still need to be reconciled.
//;Renard-RGB Vixen plug-in chooses the most concise addressing mode for a given frame in the sequence (hopefully).
//Interesting tips on protocol design: http://stackoverflow.com/questions/815758/simple-serial-point-to-point-communication-protocol
//hmmm, looks like Renard Sync came from HLDC?

#ifndef _RENXt_H
 #define _RENXt_H  0 //no protocol or API yet

//make warnings compatible with MSVC vs. other compilers:
//idea from http://stackoverflow.com/questions/471935/user-warnings-on-msvc-and-gcc
//Usage: #pragma message WARN("My message")
 #ifndef WARN
  #define TOSTR_INNER(str) #str
  #define TOSTR(str) TOSTR_INNER(str) //kludge: nested macro to force value substitution before string-ize
  #if _MSC_VER
   #define WARN(msg)  (__FILE__ "(" TOSTR(__LINE__) "): [WARNING] " msg)
  #else //__GNUC__ - may need other defines for different compilers
   #define WARN(msg)  ("[WARNING] " msg)
  #endif
 #endif // WARN
#endif //_RENXt_H


#if !(_RENXt_H & 1) //avoid multiple inclusions of protocol section
 #if _RENXt_H & 2
  #undef _RENXt_H
  #define _RENXt_H  (1 + 2)
 // #pragma message("defines")
 #else
  #undef _RENXt_H
  #define _RENXt_H  1
//  #pragma message("api")
 #endif //_RENXt_H


 //the following are mainly for use with compile-time consts:
#ifndef MIN
 #define MIN(a, b)  IIF((a) < (b), a, b)
#endif
#ifndef MAX
 #define MAX(a, b)  IIF((a) > (b), a, b)
#endif
#ifndef IIF
 #define IIF(compare, trueval, falseval)  ((compare)? trueval: falseval)
#endif


//special protocol bytes:
//these are carried over from the original Renard protocol from P. Short
#define RENARD_SYNC  0x7E //"~" start of packet
//trick from xLights: sender use 8N2 but receiver use 8N1; extra pad bit gives 10% padding but no instruction overhead to check for Pad char
#define RENARD_PAD  0x7D //"}" padding in case sender (usually the host PC) clock is too fast
#define RENARD_ESCAPE  0x7F //take next byte as-is, no special handling
//#define RENARD_SUBST  0x7C //substitute another byte in place of this char

//put Renard special chars in ascending order (for more efficient compares):
#ifdef RENARD_PAD //sender should periodically send a Pad char to compensate for different rx clock
 #pragma message WARN("Using explicit Renard Pad byte (allows sender-controlled pad rate)") //more processing overhead but more tunable
 #define RENARD_SPECIAL_MIN  MIN(MIN(RENARD_SYNC, RENARD_ESCAPE), RENARD_PAD)
 #define RENARD_SPECIAL_MID  (RENARD_SYNC ^ RENARD_ESCAPE ^ RENARD_PAD ^ MIN_RENARD_SPECIAL ^ MAX_RENARD_SPECIAL)
 #define RENARD_SPECIAL_MAX  MAX(MAX(RENARD_SYNC, RENARD_ESCAPE), RENARD_PAD)

 #if RENARD_SPECIAL_MAX - RENARD_SPECIAL_MIN == 2 //values are sequential; use simple range check
  #define IsRenardSpecial(ch)  (((ch) >= RENARD_SPECIAL_MIN) && ((ch) <= RENARD_SPECIAL_MAX))
 #else //disjoint; check each value
  #define IsRenardSpecial(ch)  (((ch) == RENARD_SYNC) || ((ch) == RENARD_PAD) || ((ch) == RENARD_ESCAPE))
 #endif
#else //sender must use 8N1.5 or 8N2 to compensate for differences between tx and rx clocks
 #pragma message WARN("Using implicit Renard byte padding (pad ratio hard-coded at 5% or 10%)") //fewer protocol char collisions
 #define RENARD_SPECIAL_MIN  MIN(RENARD_SYNC, RENARD_ESCAPE)
 #define RENARD_SPECIAL_MAX  MAX(RENARD_SYNC, RENARD_ESCAPE)

 #define IsRenardSpecial(ch)  (((ch) == RENARD_SYNC) || ((ch) == RENARD_ESCAPE))
#endif


//pseudo-controller addresses:
#define ADRS_NONE  0 //all controllers should ignore this packet; might be intended for host
#define ADRS_ALL  0xFF //this packet is for all controllers to process
//#define ADRS_UNKNOWN  0xFF //this controller has not been assigned an address; respond to all non-0 addresses
//#define ADRS_UNASSIGNED  0xFF //NOTE: this value matches ADRS_ALL so unassigned controllers will respond if pkt is for all


//palette format:
//for series strings (chained off of 1 single I/O pin):
// each palette entry represents an RGB value; 3 bytes per entry (R, G, B values)
// @4 bpp, each node takes 1 nibble (24:4 == 6:1 compression ratio)
// slower refresh rates + longer busy time; smaller, simpler palette
//for parallel strings (connected on up to 8 I/O pins):
// each palette entry represents 8 parallel R, G, or B values; 8 bytes per entry
// @4 bp8p, each group of 8 parallel nodes takes 3 bytes (192:12 == 16:1 compression)
// faster refresh rates + shorter busy time; bigger, more complex palette
#if 0
parallel palette entries: 8 x 8 parallel bits = 8 bytes/entry
max parallel palette space: 512 bytes (even byte boundaries)
node data: 3 bytes (3 parallel palette entries) / 8 parallel nodes == 8x24:3x8 == 192:24 == 8:1 compression (excl palette)

256 nodes (32x8) == 96 node bytes (32*3) + max 144 palette bytes (18x8) == 240 bytes (16f688, 12f1840)
400 nodes (50x8) == 150 node bytes (50*3) + max 90 palette bytes (11x8) <= 240 bytes
512 nodes (64x8) == 192 node bytes (64*3) + max 176 palette bytes (22x8) == 368 bytes (16f1827)
1360 nodes (170x8) == 510 node bytes (170*3) + max 512 palette bytes (64x8) <= 1008 bytes (16f1825)
 or 4K nodes (512x8) == 512 node bytes + max 512 palette bytes (21x24) <= 1008 bytes
2K nodes (256x8) == 768 node bytes (256*3) + max 240 palette bytes (30x8) == 1008 bytes
2400 nodes (300x8) == 900 node bytes (300*3) + max 108 palette bytes (13x8) <= 1008 bytes
300 n * 30 usec == 9 msec

parallel palette entry: 24 x 8 parallel bits = 24 bytes/entry
node data: 1 nibble/8 parallel nodes = 2x8 nodes/byte (192:4 == 48:1 compression excl palette)
256 nodes (32x8) == 384 (16x24) palette bytes + 16 node bytes (32/2) == 400 bytes
320 nodes (40x8) == 384 (16x24) palette + 20 nodes (40/2) == 404 bytes
400 nodes (50x8) == 384 (16x24) palette + 25 nodes (50/2) == 409 bytes
800 nodes (100x8) == 384 (16x24) palette + 50 nodes (100/2) == 434 bytes
1K nodes (128x8) == 384 (16x24) palette + 64 nodes (128/2) == 448 bytes
2K nodes (256x8) == 384 (16x24) palette + 128 nodes (256/2) == 512 bytes
4K nodes (512x8) == 384 (16x24) palette + 256 nodes (512/2) == 640 bytes
vs.
parallel palette entry: 8 x 8 parallel bits = 8 bytes/entry
node data: 3 nibbles/8 parallel nodes = 2/3x8 nodes/byte (192:12 == 16:1 compression excl palette)
256 nodes (32x8) == 128 palette bytes (16x8) + 48 node bytes (32*1.5) == 176 bytes
320 nodes (40x8) == 128 palette (16x8) + 60 nodes (40*1.5) == 188 bytes
400 nodes (50x8) == 128 palette (16x8) + 75 nodes (50*1.5) == 203 bytes
512 nodes (64x8) == 128 palette (16x8) + 96 nodes (64*1.5) == 224 bytes
800 nodes (100x8) == 128 palette (16x8) + 150 nodes (100*1.5) == 278 bytes
1K nodes (128x8) == 128 palette (16x8) + 192 nodes (128*1.5) == 320 bytes
2K nodes (256x8) == 128 palette (16x8) + 384 nodes (256*1.5) == 512 bytes **cross-over w 24 b palent
4K nodes (512x8) == 128 palette (16x8) + 768 nodes (512*1.5) == 1K bytes
vs.
node data: 3 bytes/8 parallel nodes = 1/3x8 nodes/byte (192:24 == 8:1 compression excl palette)
256 nodes (32x8) == 128 palette bytes (16x8) + 96 node bytes (32*3) == 224 bytes
320 nodes (40x8) == 128 palette (16x8) + 120 nodes (40*3) == 248 bytes
400 nodes (50x8) == 128 palette (16x8) + 150 nodes (50*3) == 278 bytes
512 nodes (64x8) == 128 palette (16x8) + 192 nodes (64*3) == 320 bytes
1K nodes (128x8) == 128 palette (16x8) + 384 nodes (128*3) == 512 bytes
2K nodes (256x8) == 128 palette (16x8) + 768 nodes (256*3) == 896 bytes
4K nodes (512x8) == 128 palette (16x8) + 1536 nodes (512*3) == 1664 bytes
#endif


//manifest data:
//this can be used to get more info about controllers
#define RENXt_MANIF_END  0x800 //ends at end of first page
 #define RENXt_MANIF_CONFIG  (RENXt_MANIF_END - 1) //config bits/ccp options
 #define RENXt_MANIF_CLOCK  (RENXt_MANIF_CONFIG - 2) //ext clock freq (if any); little endian
 #define RENXt_MANIF_MAXBAUD  (RENXt_MANIF_CLOCK - 2) //max baud rate (won't fit in 14 bits); little endian
 #define RENXt_MANIF_TOTALRAM  (RENXt_MANIF_MAXBAUD - 1) //total RAM available for node + palette data
 #define RENXt_MANIF_DIMSTEPS  (RENXt_MANIF_TOTALRAM - 1) //#steps (resolution) of dimming curve
 #define RENXt_MANIF_IOTYPES  (RENXt_MANIF_DIMSTEPS - 1) //which node I/O types supported
 #define RENXt_MANIF_PINS  (RENXt_MANIF_IOTYPES - 1) //#I/O pins available for nodes, which I/O pin for series nodes
 #define RENXt_MANIF_DEVICE  (RENXt_MANIF_PINS - 1) //device code (which uController)
 #define RENXt_MANIF_VERSION  (RENXt_MANIF_DEVICE - 1) //firmware version#
  #define RENXt_VERSION  0x1E //protocol version 1.14
 #define RENXt_MANIF_STAMP  (RENXt_MANIF_VERSION - 3) //magic/stamp "RenXt\0"
#define RENXt_MANIF_ADDR  RENXt_MANIF_STAMP //start address of internal controller manifest data; near end of first code page


//function opcodes:
//NOTE: function codes can be used as jumptable offsets
#define RENXt_NOOP  0x00 //0x00 (0) = noop

#define RENXt_SETNODE_OPGRP  0x1F //0x0# (0..15) = set node values (in memory)
 #define RENXt_BITMAP(bpp)  (0x10 + MIN(4, bpp)) //0x02 (2) = use remaining bytes as full bitmap 1bpp/2bpp/4bpp for smart pixels
  #define BPP  //dummy keyword for readability
 #define RENXt_CLEAR_ALL  RENXt_BITMAP(0 BPP) //0xF0 (240) = clear all nodes to black (overwrites first palette entry)
//NOTE: CLEAR_ALL requires padding (~1 NOOP per 50 nodes on a 5 MIPS PIC)
 #define RENXt_DUMBLIST  0x1D //0x05 (5) = use remaining bytes as dumb pixel display event list (chplex/pwm)
// #define RENXt_TEXT  0x16 //0x06 (6) = use remaining bytes as text string
 #define RENXt_NODEBYTES  0x1E //0x05 (5) = set node count to next byte (prep for clear-all or set-all)

// #define RENXt_NODELIST  0x15 //0x01 (1) = use remaining bytes 1..200 as sparse list of node#s (> 200 are esc codes); node# < prev will offset all later node#s by 200
// #define RENXt_NODESTR  0x17 //0x07 (7) = parallel ledstrip strings
// #define RENXt_UNUSED_08  0x08 //0x08 (8) = unused
// #define RENXt_UNUSED_09  0x09 //0x09 (9) = unused
// #define RENXt_UNUSED_0A  0x0A //0x0A (10) = unused
// #define RENXt_UNUSED_0B  0x0B //0x0B (11) = unused
// #define RENXt_UNUSED_0C  0x0C //0x0C (12) = unused
// #define RENXt_UNUSED_0D  0x0D //0x0D (13) = unused
// #define RENXt_UNUSED_0E  0x0E //0x0E (14) = unused
// #define RENXt_UNUSED_0F  0x0F //0x0F (15) = unused
//#define RENXt_NODEESC_OPGRP  0xFF //0xF# (240..255) = various node list escape codes
// #define RENXt_SET_ALL  0xF1 //0xF1 (241) = set all (remaining) nodes to currently select palette entry#
// #define RENXt_SET_ROWS  0xF2 //0xF2 (242) = set string mask; following 2 bytes = bitmask of I/O pins to duplicate
// #define RENXt_SET_UNUSED_F3  0xF3 //0xF3 (243) = unused
// #define RENXt_UNUSED_F4  0xF4 //0xF4 (244) = unused
// #define RENXt_UNUSED_F5  0xF5 //0xF5 (245) = unused
// #define RENXt_UNUSED_F6  0xF6 //0xF6 (246) = unused
// #define RENXt_UNUSED_F7  0xF7 //0xF7 (247) = unused
// #define RENXt_UNUSED_F8  0xF8 //0xF8 (248) = unused
// #define RENXt_UNUSED_F9  0xF9 //0xF9 (249) = unused
// #define RENXt_UNUSED_FA  0xFA //0xFA (250) = unused
// #define RENXt_UNUSED_FB  0xFB //0xFB (251) = unused
// #define RENXt_UNUSED_FC  0xFC //0xFC (252) = unused
// #define RENXt_UNUSED_FD  0xFD //0xFD (253) = unused
// #define RENXt_UNUSED_FE  0xFE //0xFE (254) = unused
// #define RENXt_UNUSED_FF  0xFF //0xFF (255) = unused

#define RENXt_SETPAL(numents)  (0x20 + ((numents) & 0xF)) //0x2# (32..47) = set palette; lower nibble = #palette entries to set (values follow, 3 bytes each, 16 entries max)

#define RENXt_SETALL(palent)  (0x30 + ((palent) & 0xF)) //_ALL_IMMED_RGB  0xF2 //0xF1 (241) = set all (remaining) nodes to the following value
//NOTE: SETALL requires padding (~1 NOOP per 50 nodes on a 5 MIPS PIC)

#define RENXt_SETTYPE(nodetype)  (0x40 + ((nodetype) & 0xF)) //0x4# (64..79) = set node type if not already set

//#define RENXt_FXFUNC_OPGRP  0x3F //0x4# (64..79) = various "smart prop" fx functions
// #define RENXt_SNOW  0x30 //0x40 (64) = snow
// #define RENXt_GRADIENT  0x31 //0x41 (65) = gradient (ramp/fade)
// #define RENXt_SCROLL  0x32 //0x42 (66) = scroll
// #define RENXt_UNUSED_43  0x43 //0x43 (67) = unused
// #define RENXt_UNUSED_44  0x44 //0x44 (68) = unused
// #define RENXt_UNUSED_45  0x45 //0x45 (69) = unused
// #define RENXt_UNUSED_46  0x46 //0x46 (70) = unused
// #define RENXt_UNUSED_47  0x47 //0x47 (71) = unused
// #define RENXt_UNUSED_48  0x48 //0x48 (72) = unused
// #define RENXt_UNUSED_49  0x49 //0x49 (73) = unused
// #define RENXt_UNUSED_4A  0x4A //0x4A (74) = unused
// #define RENXt_UNUSED_4B  0x4B //0x4B (75) = unused
// #define RENXt_UNUSED_4C  0x4C //0x4C (76) = unused
// #define RENXt_UNUSED_4D  0x4D //0x4D (77) = unused
// #define RENXt_UNUSED_4E  0x4E //0x4E (78) = unused
// #define RENXt_UNUSED_4F  0x4F //0x4F (79) = unused

//#define RENXt_UNUSED_BX  0xBF //0xB# (176..191) = unused
//#define RENXt_UNUSED_5X  0x5F //0x5# (80..95) = unused
//#define RENXt_UNUSED_6X  0x6F //0x6# (96..111) = unused

#define RENXt_CTLFUNC_OPGRP  0x7F //0x7# (112..127) = controller functions; these are < 0x80 for easier use with Putty (for debug/test)
// #define RENXt_ENUM  0x70 //0x70 (112) enumerate/assign address
// #define RENXt_GET_STATUS  0x71 //0x71 (113) = read controller status
 #define RENXt_CLEARSTATS  0x70 //clear run-time stats; useful for perf analysis/debug
 #define RENXt_READ_REG  0x71 //0x72 (114) = read registers, address and length follow
 #define RENXt_WRITE_REG  0x72 //0x73 (115) = write registers, address, length and data follow
  #define INROM(ofs)  (0x8000 | (ofs)) //max 32K, so use top bit to denote ROM address space
  #define INRAM(ofs)  (0x4000 | (ofs)) //max 1K on larger devices, < 256B on smaller devices
  #define INEEPROM(ofs)  (0x2000 | (ofs)) //max 256B typically
   #define WORKING_REGS  0x70
//   #define RENXt_EEADR  0x4000

  #define IOH_REG  ?? //I/O handler select; I/O handler DOES NOT start immediately so remaining I/O can be overlapped if desired - waits for flush opcode so all updates can be synced
//I/O handler values:
   #define RENXt_NULLIO  0x00 //0x10 (16) = null I/O
   #define RENXt_FRPANEL  0x01 //TODO: front panel (custom); can be connected to any PIC to show diagnostic/status info
//CAUTION: only bottom bit should be different for PWM or CHPLEX variants
   #define RENXt_PWM(polarity)  (0x02 + IsActiveHigh(polarity)) //IIF(IsCommonCathode(polarity), 0x03, 0x02) //IIF(((polarity) & 0xF) != 0xC, 0x02, 0x01) //0x11 (17) = pwm (dedicated I/O pins), Common Anode or Common Cathode
   #define RENXt_CHPLEX(polarity)  (0x04 + IsActiveHigh(polarity)) //IIF(IsCommonCathode(polarity), 0x05, 0x04) //IIF(((polarity) & 0xF) != 0xC, 0x04, 0x03) //0x13 (19) = chplex (chipiplexed I/O pins), Common Anode or Common Cathode
   #define LAST_DUMBIO  MAX(MAX(RENXt_PWM(ACTIVE_HIGH), RENXt_PWM(ACTIVE_LOW)), MAX(RENXt_CHPLEX(ACTIVE_HIGH), RENXt_CHPLEX(ACTIVE_LOW))) //highest dumb I/O type
   #define IsDumb(nodetype)  ((nodetype) <= LAST_DUMBIO)
   #define IsChplex(nodetype)  ((nodetype) >= MIN(RENXt_CHPLEX(ACTIVE_HIGH), RENXt_CHPLEX(ACTIVE_LOW)))
//CAUTION: only bottom bit should be different for series vs. parallel variants:
   #define RENXt_GECE(orientation)  (0x06 + IsParallel(orientation)) //IIF(IsParallel(orientation), 0x07, 0x06) //(0x06 + (orientation)) //0x15 (21) = GECE strings (max 63 ct); always parallel since max str len is limited
//   #define RENXt_LPD6803(orientation)  (0x06 + (orientation)) //0x16 (22) = LPD6803 strings
//   #define RENXt_TM1809(orientation)  (0x08 + (orientation)) //0x18 (24) = TMS1809 LED strip
   #define RENXt_WS2811(orientation)  (0x0A + IsParallel(orientation)) //IIF(IsParallel(orientation), 0x0B, 0x0A) //(0x0A + (orientation)) //0x18 (24) = WS2811 LED strip
//   #define RENXt_WS2801(orientation)  (0x0C + (orientation)) //0x17 (23) = WS2801 strings
//polarity:
//   #define COMMON_ANODE  0xCA
//   #define COMMON_CATHODE  0xCC
   #define ACTIVE_HIGH  1
   #define ACTIVE_LOW  0
   #define IsActiveHigh(polarity)  ((polarity) & 1) //((((polarity) & 0xF) % 11) & 1) //can use 0xA/0xC or 0/1
//orientation:
   #define SERIES  0
   #define PARALLEL  1
   #define IsParallel(orientation)  ((orientation) & 1)

  #define INTERLEAVE_REG  ?? //0xC# (192..207) = set #parallel strings; lower nibble = #parallel strings; used even if it exceeds #I/O pins (otherwise incoming caller addressing will be messed up)

  #define STATS_REG  ??
// #define RENXt_UNUSED_1A  0x1A //0x1A (26) = unused
// #define RENXt_UNUSED_1B  0x1B //0x1B (27) = unused
// #define RENXt_UNUSED_1C  0x1C //0x1C (28) = unused
// #define RENXt_UNUSED_1D  0x1D //0x1D (29) = unused
// #define RENXt_UNUSED_1E  0x1E //0x1E (30) = unused
// #define RENXt_UNUSED_1F  0x1F //0x1F (31) = unused
// #define RENXt_READ_STATS  0x74 //0x74 (116) = read stats
// #define RENXt_CLEAR_STATS  0x75 //0x75 (117) = clear stats
 #define RENXt_SAVE_EEPROM  0x73 //0x76 (118) = save current palette + node values to EEPROM
// #define RENXt_DEMO  0x74 //0x77 (119) = return to demo mode (free-running demo/test pattern)
 #define RENXt_ACK  0x74 //return pkt status to sender in following byte
 #define RENXt_RESET  0x75 //0x78 (120) = reset controller; will return to demo mode
 #define RENXt_REFLASH  0x76 //0x79 (121) = bootloader (reflash)
 #define RENXt_NODEFLUSH  0x77 //0x79 (121) = send out node data
 #define RENXt_ZCRESAMPLE  0x7A //0x79 (121) = resample ZC rate
 #define RENXt_TTYACK  0x7B //0x79 (121) = tty test

// #define RENXt_UNUSED_7A  0x7A //0x7A (122) = unused
// #define RENXt_UNUSED_7B  0x7B //0x7B (123) = unused
// #define RENXt_UNUSED_7C  0x7C //0x7C (124) = unused
// #define RENXt_UNUSED_7D  0x7D //0x7D (125) = unused; DON'T USE = Pad (7D)
// #define RENXt_UNUSED_7E  0x7E //0x7E (126) = unused; DON'T USE = Sync (7E)
// #define RENXt_UNUSED_7F  0x7F //0x7F (127) = unused; DON'T USE = Escape (7F)

//#define RENXt_UNUSED_8X  0x8F //0x8# (128..143) = unused
//#define RENXt_UNUSED_9X  0x9F //0x9# (144..159) = unused
//#define RENXt_UNUSED_AX  0xAF //0xA# (160..175) = unused

//#define RENXt_REPEAT  0xEF //0xE# (224..239) = set repeat count; lower nibble = repeat count - 2; TBD: interpret as 2 ^ count rather than count?

//#define RENXt_PALENT  0xDF //0xD# (208..223) = set palette entry#; lower nibble = palette entry#

//#define RENXt_NODEOFS  0xBF //0xB# (176..191) = set start node; lower nibble = ofs * 4 * 16 (50?); node# < prev automatically increments this by 4

//TODO: NodeRange,start-node#,count to replace NodeList,node,node+1,node+2,...,node+count-1
#define RENXt_NODERANGE(palent)  (0xE0 + ((palent) & 0xF))

#define RENXt_NODELIST(palent)  (0xF0 + ((palent) & 0xF)) //0xF0..0xFF (240..255) = inverted node lists; start of node list or jump to next node bank (add 240 to node#s)
 #define RENXt_NODELIST_END  RENXt_NODELIST(0) //end of inverted node lists (bkg palette entry is never explicitly addressed, so use it as an end-of-list marker)
//nodes are divided into "banks" due to 8-bit addresses (transparent to caller)
 #define RENXt_NODELIST_BANKSIZE  RENXt_NODELIST(0)
 #define NodeBank(nodenum)  ((nodenum) / RENXt_NODELIST_BANKSIZE)
 #define NodeOffset(nodenum)  ((nodenum) % RENXt_NODELIST_BANKSIZE)
 #define MakeNode(bank, offset)  ((bank) * RENXt_NODELIST_BANKSIZE + ((offset) % RENXt_NODELIST_BANKSIZE))

#endif //_RENXt_H

//===================================================================================================================
//API definitions

#ifdef WANT_API
 #if !(_RENXt_H & 2) //avoid multiple inclusions of api section
  #if _RENXt_H & 1
   #undef _RENXt_H
   #define _RENXt_H  (1 + 2)
  #else
   #undef _RENXt_H
   #define _RENXt_H  2
  #endif //_RENXt_H

  #if WANT_API < 0 //outbound
   #define DLL_ENTPT  __declspec(dllexport)
  #else //inbound
   #define DLL_ENTPT  __declspec(dllimport)
  #endif

//not needed?
#ifdef __cplusplus
 #define IFCPP(stmt)  stmt
#else
 #define IFCPP(stmt)
// #pragma WARN("not c++")
#endif

#ifdef WANT_DEBUG
 #define IFDEBUG(stmt)  stmt
#else
 #define IFDEBUG(stmt)
#endif

#ifndef byte
 #include <stdint.h>
 #define byte  uint8_t //unsigned char
#endif


//#ifdef WANT_STRICMP
//#include <ctype.h>
//kludge: stricmp is missing, so just define one here:
//static int stricmp(const char* str1, const char* str2)
//{
//    while (*str1 || *str2)
//    {
//        int retval = (*str1? toupper(*str1++): 0) - (*str2? toupper(*str2++): 0);
//        if (retval) return retval;
//    }
//    return 0;
//}
//#endif


//#define FALSE  0
//#define TRUE  1 //(-1) ;"-1" is safer, but "1" avoids loss-of-precision warnings when assigning to a bit var
//#define MAYBE  2  //;not FALSE and not TRUE; used for tri-state logic
//#define DONT_CARE  FALSE  //;arbitrary, but it's safer to turn off a don't-care feature than to leave it on

//convert #def symbols to bool value:
//#define ASBOOL(symbol)  concat(BOOLVAL_, symbol) //CAUTION: nested macro must be used here to force macro value to be substituted for name
//#define concat(pref, suff)  pref##suff //inner macro level to receive macro values rather than names
//#define concat3(pref, middle, suff)  pref##middle##suff //inner macro level to receive macro values rather than names
//#define BOOLVAL_  TRUE //default to TRUE if symbol is defined but doesn't have a value
//#define BOOLVAL_1  TRUE
//#define BOOLVAL_0  FALSE


//#define StopBits  1 //do we ever need to change this?
#define BAUD  //dummy keyword for readability
#define FPS  //dummy keyword for readability
#define MaxFrameSize(baud, DataParityStopBits, fps)  ((baud) / (1 + DataParityStopBits) / MAX(fps, 1)) //max #bytes at given baud rate and frame rate
#define K  * 1000

#define UnPercent(p)  ((p)? 100/(p): 0) //% to fractional number (for pad rate)


//#ifdef RGB
// #undef RGB  //avoid conflict with Windows defs
//#endif

#include <fstream>

//IFCPP(extern "C")
typedef struct
{
    byte r, g, b;
} RGBColor;


//selectable RGB order by controller:
//some pixel types have different RGB order; for example, WS2811 LED strip vs. strings
#define RGB_ORDER  0x524742 //"RGB"
#define RBG_ORDER  0x524247 //"RBG"
#define GRB_ORDER  0x475242 //"GRB"
#define GBR_ORDER  0x474252 //"GBR"
#define BGR_ORDER  0x424752 //"BGR"
#define BRG_ORDER  0x425247 //"BRG"
//map RGB to monochrome pixels:
#define MONO_RED  0x52 //"R"
#define MONO_GREEN  0x47 //"G"
#define MONO_BLUE  0x42 //"B"
#define MONO_ANY  1 //equiv to using HSV value
#define MONO_AVG  3 //(R + G + B)/3
#define MONO_RGBW  0x52474257 //"RGBW"; special case for 4-channel PWM
//on/off channels:
#define BOOL_RED  0x7200 //"r" + threshold in lower byte
#define BOOL_GREEN  0x6700 //"g"
#define BOOL_BLUE  0x6200 //"b"
#define BOOL_ANY  0x100

//various ways to generate RGB values:
#define RGB2Value(r, g, b)  ((MIN(r, 255) << 16) | (MIN(g, 255) << 8) | MIN(b, 255))
#define RGBW2Value(r, g, b, w)  ((MIN(w, 255) << 24) | RGB2Value>(r, g, b))
#define RGB2Struct(r, g, b)  {r, g, b} //initializer for RGBColor struct
#define RG2RGB(r, g)  RGB2RGB(r, g, 0)
#define R2RGB(r)  RGB2RGB(r, 0, 0)
#define RGB2R(rgb)  (((rgb) >> 16) & 0xFF)
#define G2RGB(g)  RGB2RGB(0, g, 0)
#define RGB2G(rgb)  (((rgb) >> 8) & 0xFF)
#define B2RGB(b)  RGB2RGB(0, 0, b)
#define RGB2B(rgb)  ((rgb) & 0xFF)
#define W2RGB(bright)  RGB2RGB(bright, bright, bright)
#define CW2RGB(bright)  RGB2RGB((bright)*3/4, bright, bright) //cool white
#define WW2RGB(bright)  RGB2RGB(bright, bright, (bright)*3/4) //warm white

#define HSV2Value(h, s, v)  (h << 16) | (MIN(s, 255) << 8) | MIN(v, 255))
#define HSV2H(hsv)  ((hsv) >> 16)
#define HSV2S(hsv)  (((hsv) >> 8) & 0xFF)
#define HSV2V(hsv)  ((hsv) & 0xFF)
//use one or the other of these:
//#define RGB2RGB(r, g, b)  RGB2Value(r, g, b)
//#define RGB2RGB(r, g, b)  RGB2Struct(r, g, b)

//HSV:
//#define HSV2Value(h, s, v)  ((MIN(h, 360) << 20) | (MIN(s, 360) << 10) | MIN(v, 360)) //leave enough room for full hue range, but still fit in 32 bits

//simplified RenXt protocol provides no virtual prop support or port I/O management
//all props are treated as one large block, so caller is responsible for mapping custom models to RGB nodes and then to R, G, B channel triplets

//set debug level:
//-1 => off
//>= 0 => max debug level to display (detail increases)
//IFCPP(extern "C")
extern int RenXt_debug_level;//(int level);
//IFCPP(extern "C")
extern std::string RenXt_debug_file;

extern std::string RenXt_LastErrorText;

#ifdef WANT_DEBUG
//IFCPP(extern "C")
void RenXt_debug(int level, int where, const char* fmt, ...);

 #ifndef ABS
  #define ABS(val)  (((val) < 0)? -(val): (val))
 #endif // ABS

 #pragma message WARN("compiled for debug")
// #define debug(level, ...)  RenXt_debug(level, __LINE__, __VA_ARGS__)
 #define debug(level, ...)  if (ABS(level) <= ABS(RenXt_debug_level)) RenXt_debug(level, __LINE__, __VA_ARGS__)
 #define debug_from(line, level, ...)  if (ABS(level) <= ABS(RenXt_debug_level)) RenXt_debug(level, line, __VA_ARGS__)
 #define debug_more(level, ...)  RenXt_debug(-1, __LINE__, __VA_ARGS__)
 #define debug_function(level)  FuncDebug func_debug(level, __func__, __LINE__)
 #define error(...)  RenXt_debug(0, __LINE__, __VA_ARGS__)
 class FuncDebug
 {
 public:
    int svlevel, svline;
    std::string svname;
//    static std::string nesting;
 public:
    FuncDebug(int level, const char* name, int line): svlevel(level), svline(line), svname(name) { RenXt_debug(svlevel, svline, "%s enter ...", svname.c_str()); }
    ~FuncDebug(void) { RenXt_debug(svlevel, svline, "... %s exit", svname.c_str()); }
//    MyDebug(int level, const char* name, int line): svlevel(level), svline(line), svname(name) { Message(svlevel, 0, svline, "enter %s", svname.c_str()); nesting += "    "; }
//    ~MyDebug(void) { nesting.resize(nesting.size() - 4); Message(svlevel, 0, svline, "exit %s", svname.c_str()); }
 };
#else // DEBUG
 #define debug(level, ...)
 #define debug_more(level, ...)
 #define debug_function(level)
 #define error(...)
#endif //def WANT_DEBUG


//how to handle palette overflow:
//< 0 => max freq to drop
//0 => no action (return error)
//> 0 => max closeness to blend
//IFCPP(extern "C")
extern int RenXt_palovfl;//(int level);


//IFCPP(extern "C")
typedef struct
{
    char name[24];
    byte address, uctlr_type, fwver, node_type;
    uint16_t num_nodes, pins, ram, ioerrs, protoerrs; //, last_prerr;
    uint32_t max_baud, clock, iochars;
} RenXt_Ctlr;

typedef struct
{
    enum PaletteTypes {Mono, Normal, Parallel, NumTypes};
    size_t reduce[NumTypes]; //#palette reductions
    size_t maxpal[NumTypes]; //largest of each palette type
    size_t reduce_failed[NumTypes]; //#times failed to reduce to required size
    long total_inbytes, total_outbytes, total_ovfl, null_frames;
    size_t first_outbytes, max_outbytes, max_occur, max_frame, min_outbytes, min_occur, min_frame;
    size_t total_palents[NumTypes], num_palettes[NumTypes];
    size_t num_encodes, enc_frame, num_ovfl, num_error, error_frame;
    time_t started, elapsed;
//    enum SelectedOpcodes {Ack, SetPal, SetAll, DumbList, NodeList, Bitmap, NodeFlush, ReadReg, WriteReg, SetType, NodeBytes, NumOpcodes};
    long num_opc[256 /*NumOpcodes*/]; //keep stats on selected opcodes
} RenXt_Stats;


//IFCPP(extern "C")
typedef struct
{
    int width, height;
    byte node_type;
    int order;
    int numnodes;
    int ctlrnodes; //#channels/controller; NOTE: prop can span controllers
    size_t maxpal, maxpal_parallel; //max #entries in palette before reducing (series + parallel if applicable)
    size_t noderam; //amount of ram being used by nodes
    size_t ramscale; //ram scale factor; 1 for <= 256 bytes, 2 for <=512 bytes, 4 for <= 1K
    char frameset[24]; //name of this set of related frames (used to select color map)
    char propname[24]; //name of prop or controller
    int age; //age of cached data
//    RenXt_Stats stats;
} RenXt_Prop;

//IFCPP(extern "C")
struct FileInfo
{
    std::ifstream stream;
    std::string path;
};


//IFCPP(extern "C")
bool find_file(const char* inipath, const char* curpath, FileInfo& infile);

//IFCPP(extern "C")
void showbuf(const char* desc, const void* buf, int buflen, bool full);

bool RenXt_wrstats(const std::string& stats_file, const RenXt_Stats* stats);

//open a port:
//parameters:
// port = comm port to use
// baud = baud rate
// data_parity_stop = #data bits, parity, #stop bits (normally 8N1)
// pad_rate = how often to send pad char (0 for no padding); NOTE: ignored if RENARD_PAD not used
//return value:
// > 0 => port opened; buffer size
// = 0 => was already open
// < 0 => error#
//IFCPP(extern "C")
int RenXt_open(const char* port, int baud, const char* data_parity_stop, int pad_rate, int fps);


//reopen port using prev settings:
//parameters:
// port = comm port to use
//return value:
// > 0 => port opened; buffer size
// = 0 => was already open
// < 0 => error#
//IFCPP(extern "C")
int RenXt_reopen(const char* port);


//encode Renard nodes (channel triplets) into RenardRGB format:
//parameters:
// inbuf = raw Renard channels (bytes); RGB nodes are triplets in R, G, B order; monochrome nodes are 1 byte
// proplen = list of prop sizes (#nodes); each prop is a separate controller (with a distrinct address); first is shared palette; -1 denotes end of list
// outbuf = RenardRGB-encoded byte stream; should use one per COM port
// outlen = size of outbuf; must be <= max #bytes that can be sent at given baud rate and frame rate
// pad_rate = how often to send pad char (0 for no padding)
//return value:
// actual size of outbuf used (# bytes)
//IFCPP(extern "C")
int /*DLL_EXPORT*/ RenXt_encode(const /*byte*/ void* inbuf, const /*byte*/ void* prev_inbuf, size_t inlen, const RenXt_Prop* propdesc, RenXt_Stats* stats, byte* outbuf, size_t outlen, int pad_rate, int seqnum);

//alternate version to open port first:
//IFCPP(extern "C")
int /*DLL_EXPORT*/ RenXt_port_encode(const char* port, const /*byte*/ void* inbuf, const /*byte*/ void* prev_inbuf, size_t inlen, const RenXt_Prop* propdesc, int seqnum);


//enumerate controllers/props on a port:
//parameters:
// port = comm port to use
// baud = baud rate
// data_parity_stop = #data bits, parity, #stop bits (normally 8N1)
// fps = #frames / second
// props = array of props returned
// maxprops = max #entries to return
//return value:
// actual number of props found
//IFCPP(extern "C")
int RenXt_enum(const char* port, RenXt_Ctlr* ctlrs, int maxctlr);


//check if any controllers are out there listening:
//IFCPP(extern "C")
int RenXt_discover(const char* port, byte* adrsptr, int maxadrs);


//enqueue command byte(s) to a controller:
//NOTE: bytes are not flushed
//parameters:
// port = comm port to use
// ctlr = controller address
//return value:
// none
// >= 0 => #bytes enqueued
// < 0 => error#
//IFCPP(extern "C")
int RenXt_command(const char* port, byte ctlr, const byte* bytes, size_t numbytes);


//close one or all ports:
//parameters:
// port = comm port to use; NULL => all
//return value:
// none
// >= 0 => closed
// < 0 => error#
//IFCPP(extern "C")
int RenXt_close(const char* port);


#if 0 //WANT_API > 1 //advanced API

#define node_value  uint32_t //allows for RGBW or subset

//return values:
//#define RENXt_NO_ERROR  0


//IFCPP(extern "C" {)


//open INI file containing port info and prop projections, allocate internal I/O buffers:
#define RenXt_open(inifile, curpath, fps)  RenXt_open_(inifile, curpath, fps, RENXt_VERSION)
int RenXt_open_(const char* inifile, const char* curpath, int fps, int version);


//dump out internal info about port, controller, or prop (for debug):
int RenXt_info(const char* name);


//TBD:
//int RenXt_enum(byte* addresses);


//update in-memory node values for a virtual prop (does not send yet):
int RenXt_setnodes(const char* propname, const /*byte*/void* values, int nodelen, int numnodes);


//encode a command into output buffer (does not send yet):
int RenXt_command(const char* propname, byte command, ...);


//write registers/memory in controller:
int RenXt_wrmem(const char* propname, int adrs, const byte* buf, int buflen);


//read registers/memory from controller:
int RenXt_rdmem(const char* propname, int adrs, const byte* buf, int buflen);


//flush output buffer:
int RenXt_send(const char* propname);


//dealloc buffers:
int RenXt_close(void);


//IFCPP(})
#endif // WANT_API > 1 //advanced API
#endif // _RENXt_H
#endif // WANT_API
//eof
