#!/usr/bin/env node
//color space utils, consts
//Copyright (c) 2020 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 1.20.11 DJ 12/20/20  move into separate file

'use strict'; //find bugs easier
const {hsvToRgb/*: hsv2rgb*/, rgbToHex/*: rgb2hex*/, hexToRgb/*: hex2rgb*/, rgbToHsv/*: rgb2hsv*/} = require("colorsys"); //https://github.com/netbeast/colorsys
const {uint32, isdef, hex, my_exports} = require("./utils");
const {TODO, debug} = require("./msgout");
//const assert = require('assert').strict; //https://nodejs.org/api/assert.html
//const {/*WS281x, CFG,*/ debug, debug_nested, debug_limit, srcline, plural, commas, hex, isdef} = require("gpuport"); //"../"); //npm link allows real module name to be used here
//debug.max_arg_len = 400;
//debug("here2");

//const { debug } = require('console');
//extensions(); //hoist for inline init usage below

//TODO("WS281x config calculator: clk 2.4MHz (overridable), 3 ppb/hblank (overridable), #null px, fps/frtime (selectable: 20/50ms, 30/33ms, 40/25ms, 100/10ms) => UNIV_LEN => xres (must be even, 3n-1), yres, aspect, nodes/row; vblank => tweak (down) fps");


//some are called a lot, so keep counter stats:
const stats = {};
my_exports({stats});


//primary RGB colors:
//external format (used by caller) is always (A)RGB
//however, HSV values are easier to manipulate (especially hue + brightness)

//max bright:
const RED = 0xFFff0000;
const RED_WRAP = 0x00FF00FF; //kludge: need to distinguish red hue fade from green (0) or fade from blue (360)
const GREEN = 0xFF00ff00;
const BLUE = 0xFF0000ff;
const YELLOW = 0xFFffff00;
const CYAN = 0xFF00ffff;
const MAGENTA = 0xFFff00ff;
const WHITE = 0xFFffffff;
const WARM_WHITE = 0xFFffffb4; //h 60/360, s 30/100, v 1.0 //try to simulate incandescent
const COOL_WHITE = 0xFFb4b4ff; //0xFFccccff));
//const PALETTE_primary = [RED, GREEN, BLUE, YELLOW, CYAN, MAGENTA];
const BLACK = 0xFF000000; //NOTE: alpha must be on to take effect
const XPARENT = 0; //NOTE: alpha off; used to merge/blend with bkg

//easier on the eyes for testing:
const RED_dim = RGBdim1(RED, 0.01); //0xFF020000;
const GREEN_dim = RGBdim1(GREEN, 0.01); //0xFF000200;
const BLUE_dim = RGBdim1(BLUE, 0.01); //0xFF000002;
const YELLOW_dim = RGBdim1(YELLOW, 0.01); //0xFF010100;
const CYAN_dim = RGBdim1(CYAN, 0.01); //0xFF000101;
const MAGENTA_dim = RGBdim1(MAGENTA, 0.01); //0xFF010001;
const WHITE_dim = RGBdim1(WHITE, 0.01); //0xFF010101;

Object.assign(module.exports,
{
    RED, GREEN, BLUE, YELLOW, CYAN, MAGENTA, WHITE, BLACK,
    RED_WRAP, WARM_WHITE, COOL_WHITE, XPARENT,
    RED_dim, GREEN_dim, BLUE_dim, YELLOW_dim, CYAN_dim, MAGENTA_dim, WHITE_dim,
//    hsv2rgb, rgb2hex, hex2rgb, rgb2hsv,
});
//debug("(ext) colors: red 0x%x, green 0x%x, blue 0x%x", RED, GREEN, BLUE);
//debug("0x%x, 0x%x, 0x%x, 0x%x, 0x%x, 0x%x", WARM_WHITE, COOL_WHITE, RED_dim, GREEN_dim, BLUE_dim, WHITE_dim); process.exit();
//console.log(module.exports); process.exit();


//color helpers:
//generate color palette based on current hue/color:
my_exports({palette_dim});
//console.log("pal", module.exports.palette_dim);
//process.exit();
//default palette is in increasing brightness order
function palette_dim(color, brlist)
{
    return (brlist || [1, 1/2, 1/4, 1/8, 1/16].reverse()).map((dim) => RGBdim1(color || Math.round(Math.random() * 360), dim));
}


my_exports({RGBblend});
function RGBblend(mix, color1, color2, brightness1)
{
    ++stats.RGBblend || (stats.RGBblend = 1); //perf stats
//NOTE: more accurate to blend hsv colors:
//    const rgb1 = RGB2rgb(color1), rgb2 = RGB2rgb(color2);
//    return rgb2RGB({r: combine(rgb1.r,rgb2.r), g: combine(rgb1.g, rgb2.g), b: combine(rgb1.b, rgb2.b)});
    const hsv1 = RGB2hsv(color1), hsv2 = RGB2hsv(color2);
//TODO: cache?
    const blended = {h: combine(hsv1.h, hsv2.h), s: combine(hsv1.s, hsv2.s), v: combine(hsv1.v, hsv2.v) * (brightness1 || 1)};
    return hsv2RGB(blended);

//    function combine(lhs, rhs) { return (1 - mix) * lhs + mix * rhs; } //* (brightness || 1); }
    function combine(lhs, rhs) { return lhs + (rhs - lhs) * mix; } //* (brightness || 1); }
}


//color order fixup:
//const u16bytes = new DataView(swapbuf, 1, 2);
my_exports({RGSWAP});
function RGSWAP(agrb)
{
    ++stats.RGBSWAP || (stats.RGBSWAP = 1); //perf stats
//    const gr = agrb & 0x00ffff00;
    return (agrb & 0xff0000ff) | ((agrb >> 8) & 0xff00) | ((agrb << 8) & 0xff0000);
//    const LITTLE_ENDIAN = true;
//    const swapbuf = new ArrayBuffer(4);
//    const u32bytes = new DataView(swapbuf, 0, 4);
//    u32bytes.setUint32(0, grb);
//    u32bytes.setUint16(1, u32bytes.getUint16(1, LITTLE_ENDIAN), !LITTLE_ENDIAN);
//    return u32bytes.getUint32(0);
}

//12V seems to be rotated
my_exports({GBR2RGB});
function GBR2RGB(agbr)
{
    ++stats.GBR2RGB || (stats.GBR2RGB = 1); //perf stats
//    return (abrg & 0xff000000) | ((abrg >> 16) & 0xff) | ((abrg << 8) & 0xffff00);
//    return (abrg & 0xff00ff00) | ((abrg >> 16) & 0xff) | ((abrg << 16) & 0xff0000);
//    return (abrg & 0xff000000) | ((abrg >> 16) & 0xff) | ((abrg << 8) & 0xffff00); //BRG => RGB
    return (agbr & 0xff000000) | ((agbr >> 8) & 0xffff) | ((agbr << 16) & 0xff0000); //GBR => RGB
}
//swap RGB byte order:
//function argb2abgr(color)
//{
//NOTE: bit shuffling is only 1 msec > buf read/write per frame
//    return 0xff000000 | (Math.floor(vec3[0] * 0xff) << 16) | (Math.floor(vec3[1] * 0xff) << 8) | Math.floor(vec3[2] * 0xff);
//    var retval = (color & 0xff00ff00) | ((color >> 16) & 0xff) | ((color & 0xff) << 16);
//if (++argb2abgr.count < 10) console.log(color.toString(16), retval.toString(16));
//    return retval;
//}


//modified hex for ARGB:
//show A in upper case if present, rgb in lower case:
my_exports({hex: my_hex});
function my_hex(...args)
{
    const [val, prefix] = args;
    if (prefix != "0xFF") return hex(...args);
    if (val < 10) return val.toString();
    const retval = (val >>> 0).toString(16).padStart(8, "0");
//if ((++my_hex.count || (my_hex.count = 1)) < 4) debug("my_hex: retval '%s', u01 '%s', rem '%s', trim '%s'", retval, retval.slice(0, 2).toUpperCase(), retval.slice(2), (retval.slice(0, 2).toUpperCase() + retval.slice(2)).replace(/^0{1,7}/, ""));
//    if (retval.length < 7) return "0x" + retval;
    return "0x" + (retval.slice(0, 2).toUpperCase() + retval.slice(2)).replace(/^0{1,7}/, "");
}


//color space conversions:
//"RGB" is uint32 with one byte for R, G, B
//"rgb" is struct with r, g, b elements
//"HSV" is uint32 with one byte for H, S, V (H is actually 9 bits)
//"hsv" is struct with h, s, v elements
//"hex" is HTML5/CSS3-compatible color strings

//Object.assign(module.exports,
//{
//    rgb2RGB, RGB2rgb, RGBdim,
//    hsv2HSV, HSV2hsv, hsvdim,
//color space conversions:
//    hsv2rgb, rgb2hex, hex2rgb, rgb2hsv,
//color order fixups:
//    RGSWAP, GBR2RGB,
//});

//add stats to colorsys functions, rename slightly:
my_exports({hsv2rgb});
function hsv2rgb(...args)
{
    ++stats.hsv2rgb || (stats.hsv2rgb = 1); //perf stats
    return hsvToRgb(...args);
}

my_exports({hsv2RGB});
function hsv2RGB(hsv)
{
    return rgb2RGB(hsv2rgb(hsv));
}

my_exports({rgb2hex});
function rgb2hex(...args)
{
    ++stats.rgb2hex || (stats.rgb2hex = 1); //perf stats
    return rgbToHex(...args);
}

my_exports({hex2rgb});
function hex2rgb(...args)
{
    ++stats.hex2rgb || (stats.hex2rgb = 1); //perf stats
    return hexToRgb(...args);
}

my_exports({rgb2hsv});
function rgb2hsv(...args)
{
    ++stats.rgb2hsv || (stats.rgb2hsv = 1); //perf stats
    return rgbToHsv(...args);
}

my_exports({RGB2hsv});
function RGB2hsv(ARGB)
{
    return rgb2hsv(RGB2rgb(ARGB));
}

//convert (r, g, b) to 32-bit ARGB color:
my_exports({rgb2RGB});
function rgb2RGB(rgb) //r, g, b, a)
{
    ++stats.rgb2RGB || (stats.rgb2RGB = 1); //perf stats
    return uint32(isdef(rgb.a, rgb.a << 24, 0xFF000000) | (rgb.r << 16) | (rgb.g << 8) | rgb.b); //>>> 0; //force convert to uint32
}


//function toargb(ARGB)
//also get A if it's there
my_exports({RGB2rgb});
function RGB2rgb(ARGB)
{
    ++stats.RGB2rgb || (stats.RGB2rgb = 1); //perf stats
    return {a: (ARGB >>> 24) & 0xFF, r: (ARGB >>> 16) & 0xFF, g: (ARGB >>> 8) & 0xFF, b: (ARGB >>> 0) & 0xFF}; //{a: A(ARGB), r: R(ARGB), g: G(ARGB)
}
//function toRGB(color) { return {a: A(color) || 0xFF, r: R(color), g: G(color), b: B(color)}; }


my_exports({hsv2HSV});
function hsv2HSV(hsv)
{
    ++stats.hsv2HSV || (stats.hsv2HSV = 1); //perf stats
//NOTE: hue can be 0..360 so it can be > 8 bits; not a problem since upper byte is empty
    return uint32((hsv.h << 16) | (hsv.s << 8) | hsv.v); //force convert to uint32
}


my_exports({HSV2hsv});
function HSV2hsv(HSV)
{
    ++stats.HSV2hsv || (stats.HSV2hsv = 1); //perf stats
    return {h: HSV >>> 16, s: (HSV >>> 8) & 0xFF, v: (HSV >>> 0) & 0xFF};
}


my_exports({hsvdim});
function hsvdim(hsv, dim)
{
    ++stats.hsvdim || (stats.hsvdim = 1); //perf stats
    return {h: hsv.h, s: hsv.s, v: hsv.v * dim};
}


//my_exports({RGBdim});
//function RGBdim(RGB, dim) { return dim? rgb2RGB(hsv2rgb(hsvdim(rgb2hsv(RGB2rgb(RGB)), dim))): BLACK; }

my_exports({RGBdim1});
function RGBdim1(RGB, dim)
{
    if (!dim) return BLACK;
    const [cache, key] = [RGBdimFF, (RGB << 8) | ((dim * 255) & 0xFF)];
    return (key in cache)?
        (++stats.RGBdim_hits || (stats.RGBdim_hits = 1), cache[key]):
        (++stats.RGBdim_misses || (stats.RGBdim_misses = 1), cache[key] = rgb2RGB(hsv2rgb(hsvdim(rgb2hsv(RGB2rgb(RGB)), dim))));
}

my_exports({RGBdimFF});
function RGBdimFF(RGB, dim)
{
    if (!dim) return BLACK;
    const [cache, key] = [RGBdimFF, (RGB << 8) | (dim & 0xFF)];
    return (key in cache)?
        (++stats.RGBdim_hits || (stats.RGBdim_hits = 1), cache[key]):
        (++stats.RGBdim_misses || (stats.RGBdim_misses = 1), cache[key] = rgb2RGB(hsv2rgb(hsvdim(rgb2hsv(RGB2rgb(RGB)), dim / 255))));
}


//adjust hsv to maintain constant "brightness":
//hue 0..360
//amt 0..100; %brightness for 1 color element; 2 elements would be 1/2 of this (to keep brightness consistent)
my_exports({hsv_bradjust});
function hsv_bradjust(hue, amt)
{
    ++stats.hsv_bradjust || (stats.hsv_bradjust = 1); //perf stats
    return amt / (2 - Math.abs(hue % 120 - 60) * 50/60 /50);
}

if (false) //unit test
{
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 0, s: 100, v: bradjust(0, 25)})), bradjust(0, 25));
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 30, s: 100, v: bradjust(30, 25)})), bradjust(30, 25));
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 60, s: 100, v: bradjust(60, 25)})), bradjust(60, 25));
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 90, s: 100, v: bradjust(90, 25)})), bradjust(90, 25));
debug("0x%x, %f", rgb2RGB(hsv2rgb({h: 120, s: 100, v: bradjust(120, 25)})), bradjust(120, 25));
process.exit();
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 100, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 50, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 0, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 100, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 50, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 0, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 100, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 50, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 0, s: 0, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 100, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 50, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 0, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 100, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 50, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 0, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 100, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 50, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 60, s: 0, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 100, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 50, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 0, v: 100})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 100, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 50, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 0, v: 50})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 100, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 50, v: 0})));
debug("0x%x", rgb2RGB(hsv2rgb({h: 30, s: 0, v: 0})));
}


//color wheel effect:
//= slow fade across hues
//useful for setting ambient "mood"; looks nice on groups of LED props
TODO("finish this");
my_exports({color_wheel});
async function color_wheel(model, opts) //, await_until, step_cb, progress_cb)
{
    const {await_until, step, progress} = model;
    const DURATION = (opts || {}).duration || 360 / ((opts || {}).fps || 5); //def 5 fps gives nice smooth, gradual fade
    const FPS = (opts || {}).fps || DURATION / 360;
    const DIM = (opts || {}).dim || 20;
    const steplen = 1e3 / FPS;
    for (let hue = 0;; ++hue)
    {
        const color = rgb2RGB(hsv2rgb({h: hue % 360, s: 100, v: hsv_bradjust(hue % 360, DIM)}));
        if (!(hue % 20)) debug(`color_wheel loop[${hue}], hue %d, color 0x%x`, hue % 360, color); 
//        model.fill(color);
//        for (let u = 0; u < 24; ++u)
//            if (u == GIFT); else
//            ctlr.wsnodes[u].fill((u == FENCE)? GBR2RGB(color): need_swap[u]? RGSWAP(color): color); //BLACK;
//        ctlr.dirty = true;
//        await ctlr.out(5e3); //msec
        await await_until(hue * steplen); //ctlr.out(1e3/5); //msec
        step(hue);
        if (i % 200) continue;
        if (progress) progress(hue);
    }
}

/*
//TODO("rgb2hsv, hsv2rgb");
function hsv(h, s, v) { return [isdef(h, h, 0), isdef(s, s, 100), isdef(v, v, 100)]; }


//convert color space:
//HSV is convenient for color (hue) or brightness (saturation) selection during fx gen
//display hardware requires RGB
function hsv360_2rgb(h, s, v) { return hsv2rgb(h / 360, s / 100, v / 100); }
function hsv2rgb(h, s, v)
//based on sample code from https://stackoverflow.com/questions/3018313/algorithm-to-convert-rgb-to-hsv-and-hsv-to-rgb-in-range-0-255-for-both
{
    h *= 6; //[0..6]
    const segment = uint32(h); // >>> 0; //(long)hh; //convert to int
    const angle = (segment & 1)? h - segment: 1 - (h - segment); //fractional part
//NOTE: it's faster to do the *0xff >>> 0 in here than in toargb
    const p = uint32((v * (1.0 - s)) * 0xff); //>>> 0;
    const qt = uint32((v * (1.0 - (s * angle))) * 0xff); //>>> 0;
//redundant    var t = (v * (1.0 - (s * (1.0 - angle))) * 0xff) >>> 0;
    v = uint32(v * 0xff); //>>> 0;

    switch (segment)
    {
        default: //h >= 1 comes in here also
        case 0: return toargb(v, qt, p); //[v, t, p];
        case 1: return toargb(qt, v, p); //[q, v, p];
        case 2: return toargb(p, v, qt); //[p, v, t];
        case 3: return toargb(p, qt, v); //[p, q, v];
        case 4: return toargb(qt, p, v); //[t, p, v];
        case 5: return toargb(v, p, qt); //[v, p, q];
    }
}


//from https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript
//input: r,g,b in [0,1], out: h in [0,360) and s,v in [0,1]
function rgb2hsv(r, g, b)
{
//    assert(false); //TODO
//    vec4 p = IIF(LT(rgb.g, rgb.b), vec4(rgb.bg, K_rgb.wz), vec4(rgb.gb, K_rgb.xy));
//    vec4 q = IIF(LT(rgb.r, p.x), vec4(p.xyw, rgb.r), vec4(rgb.r, p.yzx));
//    float d = q.x - min(q.w, q.y);
//    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e_rgb)), d / (q.x + e_rgb), q.x);
    const val = Math.max(r, g, b), chroma = val - Math.min(r, g, b);
    const hue = chroma && ((val == r) ? (g - b) / chroma : ((val == g) ? 2 + (b - r) / chroma : 4 + (r - g) / croma));
    return [60 * ((hue < 0) ? hue + 6 : hue), val && chroma / val, val];
}
*/


//return A/R/G/B portion of color:
//caller always use ARGB order
//function A(color) { return (color >>> 24) & 0xFF; }
//function R(color) { return (color >>> 16) & 0xFF; }
//function G(color) { return (color >>> 8) & 0xFF; }
//function B(color) { return (color >>> 0) & 0xFF; }
//function RGB_of(color) { return color & 0xFFFFFF; }

//TODO: these should probably be clamp(0..255) instead:
//function Abits(a) { return (a & 0xFF) << 24; }
//function Rbits(r) { return (r & 0xFF) << 16; }
//function Gbits(g) { return (g & 0xFF) << 8; }
//function Bbits(b) { return (b & 0xFF) << 0; }

//function fromRGB(r, g, b, a) //{ return ((a || 0xFF) << 24) | (r << 16) | (g << 8) | (b << 0); }
//{
//    const buf = new ArrayBuffer(4);
//    const u8 = new Uint8ClampedArray(buf);
//    const u32 = new Uint32Array(buf);
//    u8[0] = 
//    const color = Uint8ClampedArray.of(a || 0xFF, r, g, b);
//    const argb = new Uint32Array(color.buffer);
//    const retval = argb[0];
//debug(r, g, b, a, hex(retval, "0x"));
//    return retval;
//}
//function toRGB(color) { return {a: A(color) || 0xFF, r: R(color), g: G(color), b: B(color)}; }
//{
//    const argb = new Uint32Array(1);
//    const bytes = new Uint8Array(argb.buffer);
//    argb[0] = color;
//    const retval = {a: bytes[0] || 0xFF, r: bytes[1], g: bytes[2], b: bytes[3]};
//debug(hex(color, "0x"), retval);
//    return retval;
//}
//fromRGB(1, 2, 3, 4);
//fromRGB(0x11, 0x22, 0x33);
//toRGB(0x11223344);
//toRGB(0x010203);
//process.exit();


/*
//TODO("rgb2hsv, hsv2rgb");
function hsv(h, s, v) { return [isdef(h, h, 0), isdef(s, s, 100), isdef(v, v, 100)]; }


//convert color space:
//HSV is convenient for color (hue) or brightness (saturation) selection during fx gen
//display hardware requires RGB
function hsv360_2rgb(h, s, v) { return hsv2rgb(h / 360, s / 100, v / 100); }
function hsv2rgb(h, s, v)
//based on sample code from https://stackoverflow.com/questions/3018313/algorithm-to-convert-rgb-to-hsv-and-hsv-to-rgb-in-range-0-255-for-both
{
    h *= 6; //[0..6]
    const segment = uint32(h); // >>> 0; //(long)hh; //convert to int
    const angle = (segment & 1)? h - segment: 1 - (h - segment); //fractional part
//NOTE: it's faster to do the *0xff >>> 0 in here than in toargb
    const p = uint32((v * (1.0 - s)) * 0xff); //>>> 0;
    const qt = uint32((v * (1.0 - (s * angle))) * 0xff); //>>> 0;
//redundant    var t = (v * (1.0 - (s * (1.0 - angle))) * 0xff) >>> 0;
    v = uint32(v * 0xff); //>>> 0;

    switch (segment)
    {
        default: //h >= 1 comes in here also
        case 0: return toargb(v, qt, p); //[v, t, p];
        case 1: return toargb(qt, v, p); //[q, v, p];
        case 2: return toargb(p, v, qt); //[p, v, t];
        case 3: return toargb(p, qt, v); //[p, q, v];
        case 4: return toargb(qt, p, v); //[t, p, v];
        case 5: return toargb(v, p, qt); //[v, p, q];
    }
}


//from https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript
//input: r,g,b in [0,1], out: h in [0,360) and s,v in [0,1]
function rgb2hsv(r, g, b)
{
//    assert(false); //TODO
//    vec4 p = IIF(LT(rgb.g, rgb.b), vec4(rgb.bg, K_rgb.wz), vec4(rgb.gb, K_rgb.xy));
//    vec4 q = IIF(LT(rgb.r, p.x), vec4(p.xyw, rgb.r), vec4(rgb.r, p.yzx));
//    float d = q.x - min(q.w, q.y);
//    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e_rgb)), d / (q.x + e_rgb), q.x);
    const val = Math.max(r, g, b), chroma = val - Math.min(r, g, b);
    const hue = chroma && ((val == r) ? (g - b) / chroma : ((val == g) ? 2 + (b - r) / chroma : 4 + (r - g) / croma));
    return [60 * ((hue < 0) ? hue + 6 : hue), val && chroma / val, val];
}
*/


//return A/R/G/B portion of color:
//caller always use ARGB order
//function A(color) { return (color >>> 24) & 0xFF; }
//function R(color) { return (color >>> 16) & 0xFF; }
//function G(color) { return (color >>> 8) & 0xFF; }
//function B(color) { return (color >>> 0) & 0xFF; }
//function RGB_of(color) { return color & 0xFFFFFF; }

//TODO: these should probably be clamp(0..255) instead:
//function Abits(a) { return (a & 0xFF) << 24; }
//function Rbits(r) { return (r & 0xFF) << 16; }
//function Gbits(g) { return (g & 0xFF) << 8; }
//function Bbits(b) { return (b & 0xFF) << 0; }

//function fromRGB(r, g, b, a) //{ return ((a || 0xFF) << 24) | (r << 16) | (g << 8) | (b << 0); }
//{
//    const buf = new ArrayBuffer(4);
//    const u8 = new Uint8ClampedArray(buf);
//    const u32 = new Uint32Array(buf);
//    u8[0] = 
//    const color = Uint8ClampedArray.of(a || 0xFF, r, g, b);
//    const argb = new Uint32Array(color.buffer);
//    const retval = argb[0];
//debug(r, g, b, a, hex(retval, "0x"));
//    return retval;
//}
//function toRGB(color) { return {a: A(color) || 0xFF, r: R(color), g: G(color), b: B(color)}; }
//{
//    const argb = new Uint32Array(1);
//    const bytes = new Uint8Array(argb.buffer);
//    argb[0] = color;
//    const retval = {a: bytes[0] || 0xFF, r: bytes[1], g: bytes[2], b: bytes[3]};
//debug(hex(color, "0x"), retval);
//    return retval;
//}
//fromRGB(1, 2, 3, 4);
//fromRGB(0x11, 0x22, 0x33);
//toRGB(0x11223344);
//toRGB(0x010203);
//process.exit();

//eof
