#!/usr/bin/env node
//YALP color mgmt

"use strict"; //find bugs + typos easier
require('colors').enabled = true; //for console output (debug only)
const Path = require("path"); //only used for debug
require("magic-globals"); //__file, __line, __stack, __func, etc (debug only)
const {hsvToRgb/*: hsv2rgb*/, rgbToHex: rgb2hex, hexToRgb: hex2rgrb, rgbToHsv/*: rgb2hsv*/} = require("colorsys"); //https://github.com/netbeast/colorsys
const {isUN, isNUN, isobj, clamp, u32, srcline, fmt, hex} = require("./utils22");


//all color manip is done in HSV (for easier brightness + hue manipulation)
//only need to xlate HSV to RGB 1x at render time or for debug
//ARGB byte order is hardware-dependent (GPU + LEDs) -another reason for only converting 1x at final render

//naming conventions:
//lower-case hsv is an {H, S, V} or {h, s, v} obj
//upper-case HSV is a uint32 value: 0x1FF0000 H [0..360], 0x00FF00 S [0..100], 0x0000FF V [0..100] TODO: maybe [0..255]?
//upper-case H (hue) is 0..360, S (sat) is 0..100, V (brightness val) is 0..100 (or maybe 0..255)
//lower-case h, s, v are 0..1

//lower-case (a)rgb is an {A, R, G, B} or {a, r, g, b} obj
//upper-case (A)RGB is a uint32 value: 0xFF000000 A 0..255, 0x00FF0000 R 0..255, 0x0000FF00 G 0..255, 0x000000FF B 0..255
//upper-case A (alpha), R (red), G (green), B (blue) are 0..255
//lower-case a, r, g, b are 0..1

//x2y() converts "x" to "y"


/*
//get RGB color components:
//NOTE: caller always uses ARGB byte order (for simplicity)
//#define cbyte_1ARG(val)  ((val) & 0xFF)
//#define cbyte_2ARGS(val, shift)  cbyte_3ARGS(val, shift, 0xFF)
//#define cbyte_3ARGS(val, shift, mask)  (shiftlr(val, shift) & (mask))
function A(color) { return (color >> 24) & 0xFF; }
function R(color) { return (color >> 16) & 0xFF; }
function G(color) { return (color >> 8) & 0xFF; }
function B(color) { return color & 0xFF; }
//#define brightness(color)  (R(color) + G(color) + B(color)) //approximation; doesn't use HSV space (for perf)
function Abits(color) { return color & 0xFF000000; } //cbyte(color, -24) //-Ashift)
//#define RGBbits(color)  ((color) & 0x00FFFFFF) //((color) & ~ABITS(0xFFffffff))
//#define Rbits(color)  ((color) & 0x00FF0000) //cbyte(color, -16) //-Rshift)
//#define Gbits(color)  ((color) & 0x0000FF00) //cbyte(color, -8) //-Gshift)
//#define Bbits(color)  ((color) & 0x000000FF) //cbyte(color, -0) //-Bshift)
*/


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// palette:
//

my_exports({HUE: HUE(), PAL: PAL()}); //, PALRGB: PALRGB()}); //use func calls to hoist objects


//primary colors:
//values are 0..360
//const HUE =
function HUE() //kludge: wrap singleton in function to allow hoist
{
    const retval =
    {
        RED: 0, RED_WRAP: 360,
        YELLOW: 60,
        GREEN: 120,
        CYAN: 180,
        BLUE: 240,
        MAGENTA: 300,
    };
    return Object.assign(HUE, retval); //allow ref to obj props (~ namespace)
}


//commonly used colors:
//const PAL =
function PAL() //kludge: wrap singleton in function to allow hoist
{
    const enumerable = true;
    const defbr = 3/255; //easier on the eyes
    const retval =
    {
        OFF: {V: 0}, //no alpha, in case it matters
        BLACK: {A: 0, V: 0}, //0% brightness (any color)
//primary colors (default brightness):
//        RED: {H: HUE.RED, S: 100, v: defbr}, //1},
//        GREEN: {H: HUE.GREEN, S: 100, v: defbr}, //1},
//        BLUE: {H: HUE.BLUE, S: 100, v: defbr}, //1},
//        YELLOW: {H: HUE.YELLOW, S: 100, v: defbr * 2/3}, //0.5},
//        CYAN: {H: HUE.CYAN, S: 100, v: defbr * 2/3}, //0.5},
//        MAGENTA: {H: HUE.MAGENTA, S: 100, v: defbr * 2/3}, //0.5},
//        WHITE: {S: 0, v: defbr * 1/3}, //0.5}, //0% sat, <1% brightness (any color)
//primary colors (full brightness):
//useful starting point when dimming
        RED: {H: HUE.RED, S: 100, V: 100},
        GREEN: {H: HUE.GREEN, S: 100, V: 100},
        BLUE: {H: HUE.BLUE, S: 100, V: 100},
        YELLOW: {H: HUE.YELLOW, S: 100, V: 100},
        CYAN: {H: HUE.CYAN, S: 100, V: 100},
        MAGENTA: {H: HUE.MAGENTA, S: 100, V: 100},
        WHITE: {S: 0, V: 100}, //0% sat, 100% brightness (any color)
//misc extra colors:
        ORANGE: {H: 30, V: 100}, //R:G:B ~= 16:4:1, HSV: R == G, B = 0
        GOLD: {H: 45, V: 100}, //R:G ~= 4:3, B = 0
        FOREST_GREEN: {H: HUE.GREEN, V: 75}, //G 75%
        BROWN: {H: 45, V: 75}, //dim orange
        INCAND_WHITE: {H: HUE.YELLOW, S: 50, V: 100},
        ICE_WHITE: {H: HUE.CYAN, S: 25, V: 100},
        WARM_WHITE: {H: HUE.YELLOW, S: 15, V: 100},
        COOL_WHITE: {H: HUE.BLUE, S: 15, V: 100},
        XPARENT_todo: {},
    };
    Object.values(retval)
        .map(hsv => Object.defineProperties(/*debug*/(hsv),
        {
            RGB: {value: hsv2RGB(hsv), enumerable, },
            dim: {value: function(br) { return Object.assign({}, this, {V: isUN(br, defbr)}); }, }, //don't change original obj
        }))
        .forEach(hsv => Object.freeze(hsv));
//            get() { return replace_prop.call(this, hsv2RGB(this)); }, enumerable: true, configurable: true,  } )); 
    return Object.assign(PAL, retval); //allow ref to obj props (~ namespace)
}


//function PALRGB() //kludge: wrap singleton in function to allow hoist
//{
//    const retval = Object.entries(PALhsv()).reduce((pal, [name, hsv]) => Object.assign(pal, {[name]: hsv2RGB(hsv)}), {});
//    return Object.assign(PALRGB, retval); //allow ref to obj props (~ namespace)
//}


/*
const PAL_RGB_obsolete = //always use hsv
{
//dim (easier on eyes):
    OFF: 0xFF000000,
    RED: 0xFF030000,
    GREEN: 0xFF000300,
    BLUE: 0xFF000003,
    YELLOW: 0xFF010100,
    CYAN: 0xFF000101,
    MAGENTA: 0xFF010001,
    WHITE: 0xFF010101,
//bright:
    RED_FULL: 0xFFff0000,
    GREEN_FULL: 0xFF00ff00,
    BLUE_FULL: 0xFF0000ff,
    YELLOW_FULL: 0xFFffff00,
    CYAN_FULL: 0xFF00ffff,
    MAGENTA_FULL: 0xFFff00ff,
    WHITE_FULL: 0xFFffffff,
};
*/


/////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// color space conversion:
//

my_exports({rgb2RGB, RGB2rgb, hsv2HSV, HSV2hsv, hsv2rgb, hsv2RGB, HSV2rgb, rgb2hex, hex2rgrb, rgb2hsv, rgb2HSV, RGB2hsv, asRGB});

//shims:
function hsv2rgb(ahsv)
{
//CAUTION: rsvToRgb !like missing/null values
    const hsv_in = {h: isUN(ahsv.H, isUN(ahsv.h, 0) * 360), s: isUN(ahsv.S, isUN(ahsv.s, 1) * 100), v: isUN(ahsv.V, isUN(ahsv.v, 1) * 100)};
//    console.log(hsv_in, srcline());
    const retval = hsvToRgb(hsv_in);
    return {A: isNUN(ahsv.A)? ahsv.A: isNUN(ahsv.a)? ahsv.a * 255: 255, R: retval.r, G: retval.g, B: retval.b};
}

function hsv2RGB(ahsv) { return rgb2RGB(hsv2rgb(ahsv)); }
function HSV2rgb(AHSV) { return hsv2rgb(HSV2hsv(AHSV)); }

function rgb2hsv(argb)
{
    const retval = rgbToHsv({r: isUN(argb.R, argb.r * 255), g: isUN(argb.G, argb.g * 255), b: isUN(argb.B, argb.b * 255)});
    return {A: isNUN(argb.A)? argb.A: isNUN(argb.a)? argb.a * 100: 100, H: retval.h, S: retval.s, V: retval.v};
}
function rgb2HSV(argb) { return hsv2HSV(rgb2hsv(argb)); }
function RGB2hsv(ARGB) { return rgb2hsv(RGB2rgb(ARGB)); }
    

//convert (r, g, b) to 32-bit ARGB color:
//only used for debug?
function rgb2RGB(argb) //{a, r, g, b} or {A, R, G, B}
{
//    const ARGB = new Uint8ClampedArray(4);
    const A = clamp(isNUN(argb.a)? argb.a * 255: isUN(argb.A, 255), 255); //default to full alpha if absent (else color won't show?)
    const R = clamp(isNUN(argb.r)? argb.r * 255: isUN(argb.R, 0), 255);
    const G = clamp(isNUN(argb.g)? argb.g * 255: isUN(argb.G, 0), 255);
    const B = clamp(isNUN(argb.b)? argb.b * 255: isUN(argb.B, 0), 255);
//    console.log({A, R, G, B}, srcline());
    return u32((A << 24) | (R << 16) | (G << 8) | B); //force convert to uint32
}

//function toargb(ARGB)
//also get A if it's there
function RGB2rgb(ARGB)
{
    return {A: (ARGB >>> 24) || 255, R: (ARGB >>> 16) & 0xFF, G: (ARGB >>> 8) & 0xFF, B: (ARGB >>> 0) & 0xFF}; //default alpha to 255
}
//function toRGB(color) { return {a: A(color) || 0xFF, r: R(color), g: G(color), b: B(color)}; }

function hsv2HSV(ahsv)
{
//NOTE: hue can be 0..360 so it can be > 8 bits; not a problem since upper byte is empty or has 7-bit alpha
    const A = clamp(isNUN(ahsv.a)? ahsv.a * 100: isUN(ahsv.A, 100), 100); //clamp to [0..100]; default to 100% is absent; TODO: is this needed?
    const H = Math.round((isNUN(ahsv.h)? ahsv.h * 360: isUN(ahsv.H, 0)) % 360); //allow hue to wrap around color wheel
    const S = clamp(isNUN(ahsv.s)? ahsv.s * 100: isUN(ahsv.S, 100), 100); //clamp to [0..100]; default to 100% if absent
    const V = clamp(isNUN(ahsv.v)? ahsv.v * 100: isUN(ahsv.V, 1), 100); //clamp to [0..100]; default to 1% if absent
    return u32((A << 25) | (H << 16) | (S << 8) | (V << 0));
}

function HSV2hsv(AHSV)
{
    return {A: (AHSV >>> 25) || 100, H: (AHSV >>> 16) & 0x1FF, S: (AHSV >>> 8) & 0xFF, V: (AHSV >>> 0) & 0xFF}; //default alpha to 100%
}


function asRGB(color)
{
    return isUN(color)? isUN(PAL.OFF.RGB, hsv2RGB(PAL.OFF)):
        !isobj(color)? color:
        ("RGB" in color)? color.RGB:
        ("v" in color || "V" in color)? hsv2RGB(color):
        rgb2RGB(color);
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// dimming/blending:
//

my_exports({hsvdim, RGBdim, hsvgrad}); //, RGBblend});


function hsvdim(ahsv, dim) { return Object.assign({}, ahsv, {v: ahsv.v * dim, V: ahsv.V * dim}); } //TODO: add hsv method?
function RGBdim(ARGB, dim) { return rgb2RGB(hsv2rgb(hsvdim(rgb2hsv(RGB2rgb(ARGB)), dim))); } //expensive

//should use HSV:
function todo_RGBblend(mix, color1, color2, brightness)
{
    const rgb1 = RGB2rgb(color1), rgb2 = RGB2rgb(color2);
    return rgb2RGB({r: combine(rgb1.r,rgb2.r), g: combine(rgb1.g, rgb2.g), b: combine(rgb1.b, rgb2.b)});
    function combine(lhs, rhs) { return ((1 - mix) * lhs + mix * rhs) * (brightness || 1); }
}


//generate stepped gradient:
//increase hue (color wheel CW) if #steps > 0
//decrease hue (color wheel CCW) if #steps < 0
function hsvgrad(from_hsv, to_hsv, num_steps)
{
    const [hfrom, hto] = [(from_hsv.h * 360 || from_hsv.H || 0) % 360, (to_hsv.h * 360 || to_hsv.H || 0) % 360]; //, hstep = (hto - hfrom) / Math.abs(num_steps);
//wrap and CW vs CCW:
//hfrom < hto, #steps > 0 => from,from+step,...to
//hfrom > hto, #steps > 0 => from,from+step,...to+360
//hfrom > hto, #steps < 0 => from,from-step,...,to
//hfrom < hto, #steps < 0 => from+360,from+360-step,...,to
    const [hfrom2, hto2] = [hfrom + 360 * (hfrom < hto && num_steps < 0), hto + 360 * (hfrom > hto && num_steps > 0)];
    const hstep = (hto2 - hfrom2) / Math.abs(num_steps);
    const [sfrom, sto] = [from_hsv.s * 100 || from_hsv.S || 0, to_hsv.s * 100 || to_hsv.S || 0], sstep = (sto - sfrom) / Math.abs(num_steps);
    const [vfrom, vto] = [from_hsv.v * 100 || from_hsv.V || 0, to_hsv.v * 100 || to_hsv.V || 0], vstep = (vto - vfrom) / Math.abs(num_steps);
    const retval = Array.from({length: Math.abs(num_steps) + 1}, (_, n) => ({H: (hfrom2 + n * hstep) % 360, S: sfrom + n * sstep, V: vfrom + vstep}));
    console.log("grad", {from_hsv, to_hsv, hfrom2, hto2, hstep, sfrom, sto, sstep, vfrom, vto, vstep}, srcline());
    return retval;
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// color order:
//


my_exports({RGSWAP});

//color order fixup:
//const u16bytes = new DataView(swapbuf, 1, 2);
function RGSWAP(agrb)
{
//    const gr = agrb & 0x00ffff00;
    return (agrb & 0xFF0000ff) | ((agrb >> 8) & 0xff00) | ((agrb << 8) & 0xff0000);
//    const LITTLE_ENDIAN = true;
//    const swapbuf = new ArrayBuffer(4);
//    const u32bytes = new DataView(swapbuf, 0, 4);
//    u32bytes.setUint32(0, grb);
//    u32bytes.setUint16(1, u32bytes.getUint16(1, LITTLE_ENDIAN), !LITTLE_ENDIAN);
//    return u32bytes.getUint32(0);
}

//12V seems to be rotated
function todo_GBR2RGB(agbr)
{
//    return (abrg & 0xff000000) | ((abrg >> 16) & 0xff) | ((abrg << 8) & 0xffff00);
//    return (abrg & 0xff00ff00) | ((abrg >> 16) & 0xff) | ((abrg << 16) & 0xff0000);
//    return (abrg & 0xff000000) | ((abrg >> 16) & 0xff) | ((abrg << 8) & 0xffff00); //BRG => RGB
    return (agbr & 0xff000000) | ((agbr >> 8) & 0xffff) | ((agbr << 16) & 0xff0000); //GBR => RGB
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// module:
//


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }


//CLI/unit test (debug):
//to validate use https://www.rapidtables.com/convert/color/rgb-to-hsv.html
// or https://www.rapidtables.com/convert/color/hsv-to-rgb.html
if (!module.parent)
{
    console.log(`Use "npm test" rather than running index.js directly.`.brightCyan, srcline());
    console.log("exports:".brightBlue, Object.entries(module.exports)
        .map(([key, val]) => `${key} = ${fmt(val, {truncate: 50, base: key.match(/mask|map/i)? 16: 10})} (${fmt.typeof})`), srcline());
    console.log("unit tests:".brightCyan, srcline());
    console.log("rgb2RGB", hex(rgb2RGB({A: 0x11, R: 0x22, G: 0x33, B: 0x44})), 0x11, 0x22, 0x33, 0x44, srcline());
    console.log("rgb2RGB", hex(rgb2RGB({a: 1/2, r: 1/3, g: 1/4, b: 1/5})), hex(255/2), hex(255/3), hex(255/4), hex(255/5), srcline());
    console.log("RGB2rgb", RGB2rgb(0x556677), 0x55, 0x66, 0x77, srcline());
    console.log("rgb2hsv", rgb2hsv({R: 255, G: 64, B: 16}), rgb2hsv({r: 255/255, g: 64/256, b: 16/256}), srcline());
    console.log("hsv2rgb", hsv2rgb({H: 60, V: 90}), 255 * 0.9, hsv2rgb({h: 7/6, v: 0.8}), 255 * 0.8, srcline());
    console.log("RGBdim", hex(RGBdim(0x4488CC, 1/4)), srcline());
    console.log("hsvgrad", hsvgrad(PAL.YELLOW, PAL.MAGENTA, 4), hsvgrad(PAL.YELLOW, PAL.MAGENTA, -4), srcline());
    console.log("hsvgrad", hsvgrad(PAL.GREEN, PAL.RED, 3), hsvgrad(PAL.GREEN, PAL.RED, -3), srcline());
    console.log("dim", PAL.WHITE, hex(hsv2RGB(PAL.WHITE)), PAL.WHITE.dim(50), hex(hsv2RGB(PAL.WHITE.dim(50))), srcline());
//    console.log("PAL.WHITE_DIM", hsv2rgb(PAL.WHITE_DIM), hex(hsv2RGB(PAL.WHITE_DIM)), PAL.WHITE_DIM, srcline()); //, {S: 100, V: 1}, //100% sat (any color)
//    console.log("cool/warm WHITE", hex(hsv2RGB(PAL.COOL_WHITE_FULL)), hex(hsv2RGB(PAL.WARM_WHITE_FULL)), PAL.COOL_WHITE_FULL, PAL.WARM_WHITE_FULL, srcline());
    console.log("palette:".brightBlue, srcline());
    Object.entries(PAL).forEach(([name, hsv]) => console.log("hsv2RGB", name, hsv, hex(hsv2RGB(hsv)), hex(hsv.RGB), RGB2hsv(hsv.RGB), srcline()));
}

//eof