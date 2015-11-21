
'use strict';

var int24 = require('int24');
var buffer = require('buffer');

var Color = require('onecolor').color; //'tinycolor');
Color.RGB.prototype.isGray = function() { return (Math.floor(255 * this.red()) == Math.floor(255 * this.green())) && (Math.floor(255 * this.green()) == Math.floor(255 * this.blue())); }
Color.RGB.prototype.rgb24 = function() { return (Math.floor(255 * this.red()) << 16) | (Math.floor(255 * this.green()) << 8) | Math.floor(255 * this.blue()); }
Color.RGB.prototype.lightness = function() { return Math.floor(255 * Math.max(this.red(), this.green(), this.blue())); }

function isdef(thing) { return (typeof thing !== 'undefined'); }


module.exports.Mono = Mono;
module.exports.Bicolor = Bicolor;
module.exports.RGB = RGB;
module.exports.RGBW = RGBW;

//TODO: different color ordering (need GRB for WS281X)


//monochrome pixels:
//brightness is derived from RGB values and used as a single-byte value for each monochrome pixel
function Mono() {} //dummy ctor

//pre-convert color into correct node width and format:
Mono.prototype.color = function(color)
{
/*
        int brightness = RGB2R(rgb); //MAX(MAX(RGB2R(rgb), RGB2G(rgb)), RGB2B(rgb));
        int more_row = 0xff - rownum * 0x11; //scale up row# to fill address space; NOTE: this will sort higher rows first
//    rownum = 0x99 - rownum; //kludge: sort lower rows first to work like Vixen 2.x chipiplexing plug-in
//    if (brightness && (prop->desc.numnodes == 56))? (n / 7): 0; //chipiplexed row# 0..7 (always 0 for pwm); assume horizontal matrix order
        return RGB2Value(brightness, brightness? more_row: 0, brightness? rownum: 0); //tag dumb color with chipiplexed row# to force row uniqueness
*/
    switch (typeof color)
    {
        case 'boolean': return color? 255: 0;
        case 'null': return 0;
//        case 'undefined': throw "Color is undefined";
        case 'object':
            if (color instanceof Color) return color.lightness();
            //fall thru
        case 'string':
debugger;
            return Color(color).lightness();
//            //fall thru
//no        case 'number': //RGBA or 0xFF
//            return (color & 0xFFFFFF00)? Math.max((color >>> 24) & 0xFF, (color >>> 16) & 0xFF, (color >>> 8) & 0xFF): color & 0xFF; //Color(color).lightness(): color;
        case 'number': //RGB
            return Math.max((color >>> 16) & 0xFF, (color >>> 8) & 0xFF, color & 0xFF);
        default:
            throw "Unhandled: convert " + typeof color + " to monochrome";
    }
//    return ((typeof color !== 'object')? Color('#' + color.toString(16)): color).lightness();
}

Mono.prototype.toRGB = function(color)
{
    return (color << 16) | (color << 8) | color; //Color('#FFF').lightness(color / 255).rgb24();
}

Mono.prototype.fill = function(color)
{
    this.nodes.fill(color); //color2mono(color)); //TODO: this.nodes.?
    this.dirty = true;
    return this; //fluent
}

Mono.prototype.json = function(json)
{
//    if (!isdef(json)) return JSON.stringify(this.nodes, null, ' ');
//    this.nodes.copy(JSON.parse(json));
    if (!isdef(json)) //stringify //return JSON.stringify(this.nodes, function(key, val) { return key? '#' + val: val; /*+ val.toString(16)*/; }, ' ');
    {
        var buf = '';
        for (var ofs = 0; ofs < this.numch; ++ofs)
            buf += '", "#' + ('00' + this.nodes.readUInt8(ofs).toString(16)).slice(-2);
        return '[' + buf.substr(3) + '"]';
    }
//    var vals = JSON.parse(json.replace(/ /g, ''));
    if (typeof json === 'string') json = JSON.parse(json);
    if (!Array.isArray(json)) throw "Expected a JSON array";
//    debugger;
    for (var ofs = 0; ofs < this.numch; ++ofs)
    {
//        if (inx < json.length) console.log(json[inx] + ' => ' + this.color(json[inx]));
        var color = (ofs < json.length)? this.color(json[ofs]): 0;
        this.nodes.writeUInt8(ofs, color);
    }
    this.dirty = true;
    return this; //fluent
}

Mono.prototype.pixel = function(inx, color) //get/set node color
{
    if (!isdef(color)) return this.nodes[this.nodeofs(inx)]; //.readUInt8(this.nodeofs(i));
    this.nodes[this.nodeofs(inx)] = color; //color2mono(color); //.writeUInt8(this.nodeofs(i), color2mono(color));
    this.dirty = true;
    return this; //fluent
}
//Mono.prototype.inspect_nodes = function(depth, opts) {}



//bi-color pixels:
//could be used for red/green LEDs, not tested
function Bicolor() {} //dummy ctor

//pre-convert color into correct node width and format:
Bicolor.prototype.color = function(color)
{
    switch (typeof color)
    {
        case 'boolean': return color? 0xFFFF: 0;
        case 'null': return 0;
//        case 'undefined': throw "Color is undefined";
        case 'object':
            if (color instanceof Color) return (color.red() << 8) | color.green(); //2-byte value
            //fall thru
        case 'string':
            color = Color(color);
            return (color.red() << 8) | color.green();
//            //fall thru
        case 'number': //RGB
            return (color >>> 8) & 0xFFFF;
        default:
            throw "Unhandled: convert " + typeof color + " to monochrome";
    }
//    return ((typeof color !== 'object')? Color('#' + color.toString(16)): color).lightness();
}

Bicolor.prototype.toRGB = function(color)
{
    return color << 8; //Color({red: color >>> 8, green: color & 0xFF}).rgb24();
}

Bicolor.prototype.fill = function(color)
{
//    color = color2rg(color);
    for (var ofs = 0; ofs < this.numch; ofs += 2) this.nodes.writeUInt16BE(ofs, color);
    this.dirty = true;
    return this; //fluent
}

Bicolor.prototype.json = function(json)
{
    if (!isdef(json)) //stringify //return JSON.stringify(this.nodes, function(key, val) { return key? '#' + val: val; /*+ val.toString(16)*/; }, ' ');
    {
        var buf = '';
        for (var ofs = 0; ofs < this.numch; ofs += 2)
            buf += '", "#' + ('0000' + this.nodes.readUInt16BE(ofs).toString(16)).slice(-4);
        return '[' + buf.substr(3) + '"]';
    }
//    var vals = JSON.parse(json.replace(/ /g, ''));
    if (typeof json === 'string') json = JSON.parse(json);
    if (!Array.isArray(json)) throw "Expected a JSON array";
//    debugger;
    for (var ofs = 0, inx = 0; ofs < this.numch; ofs += 2, ++inx)
    {
//        if (inx < json.length) console.log(json[inx] + ' => ' + this.color(json[inx]));
        var color = (inx < json.length)? this.color(json[inx]): 0;
        this.nodes.writeUInt16BE(ofs, color);
    }
    this.dirty = true;
    return this; //fluent
}

Bicolor.prototype.pixel = function(inx, color) //get/set node color
{
    if (!isdef(color)) return this.nodes.readUInt16BE(this.nodeofs(inx));
    this.nodes.writeUInt16BE(this.nodeofs(inx), color); //color2rg(color));
    this.dirty = true;
    return this; //fluent
}

Bicolor.prototype.inspect_nodes = function(depth, opts)
{
    var buf = "";
    for (var ofs = 0; ofs < this.length /*numch*/; ofs += 2)
    {
        if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += " ... " + (this.length /*numch*/ - ofs) / 2 + " "; break; }
        buf += " " + ('0000' + this./*nodes.*/readUInt16BE(ofs).toString(16)).slice(-4);
    }
    return "<Bicolor-buf" + buf + ">";
}



//RGB pixels:
//most common case; 24-bit value used for R, G, B
function RGB() {} //dummy ctor

//pre-convert color into correct node width and format:
RGB.prototype.color = function(color)
{
    switch (typeof color)
    {
        case 'boolean': return color? 0xFFFFFF: 0;
        case 'null': return 0;
//        case 'undefined': throw "Color is undefined";
        case 'object':
            if (color instanceof Color) return color.rgb24();
            //fall thru
        case 'string':
            return Color(color).rgb24();
//            //fall thru
        case 'number': //RGB
            return color & 0xFFFFFF; // >>> 8; //drop alpha
        default:
            throw "Unhandled: convert " + typeof color + " to monochrome";
    }
//    return ((typeof color !== 'object')? Color('#' + color.toString(16)): color).lightness();
}

RGB.prototype.toRGB = function(color)
{
    return color; //.rgb24();
}

RGB.prototype.fill = function(color)
{
    for (var ofs = 0; ofs < this.numch; ofs += 3) int24.writeUInt24BE(this.nodes, ofs, color);
    this.dirty = true;
    return this; //fluent
}

RGB.prototype.pixel = function(inx, color) //get/set node color
{
    if (!isdef(color)) return int24.readUInt24BE(this.nodes, this.nodeofs(inx)); //this.nodes.readUInt24BE(this.nodeofs(i));
    int24.writeUInt24BE(this.nodes, this.nodeofs(inx), color); //this.nodes.writeUInt24BE(this.nodeofs(i), color);
    this.dirty = true;
    return this; //fluent
}

RGB.prototype.json = function(json)
{
    if (!isdef(json)) //stringify //return JSON.stringify(this.nodes, function(key, val) { return key? '#' + val: val; /*+ val.toString(16)*/; }, ' ');
    {
        var buf = '';
        for (var ofs = 0; ofs < this.numch; ofs += 3)
        {
            var hex = ('000000' + int24.readUInt24BE(this.nodes, ofs).toString(16)).slice(-6);
            hex = hex.replace(/^(.)\1(.)\2(.)\3$/, "$1$2$3"); //abbreviated hex format
            buf += '", "#' + hex;
        }
        return '[' + buf.substr(3) + '"]';
    }
//    var vals = JSON.parse(json.replace(/ /g, ''));
    if (typeof json === 'string') json = JSON.parse(json);
    if (!Array.isArray(json)) throw "Expected a JSON array";
//    debugger;
    for (var ofs = 0, inx = 0; ofs < this.numch; ofs += 3, ++inx)
    {
//        if (inx < json.length) console.log(json[inx] + ' => ' + this.color(json[inx]));
        var color = (inx < json.length)? this.color(json[inx]): 0;
        int24.writeUInt24BE(this.nodes, ofs, color); //this.nodes.writeUInt24BE(this.nodeofs(i), color);
    }
    this.dirty = true;
    return this; //fluent
}

RGB.prototype.inspect_nodes = function(depth, opts)
{
    var buf = "";
    for (var ofs = 0; ofs < this.length /*numch*/; ofs += 3)
    {
        if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += " ... " + (this.length /*numch*/ - ofs) / 3 + " "; break; }
        buf += " " + ('000000' + int24.readUInt24BE(this/*.nodes*/, ofs).toString(16)).slice(-6);
    }
    return "<RGB-buf" + buf + ">";
}



//4-channel pixels:
//typically used for floods which have a separate W channel in addition to R, G, B; unclear when to use W vs. R/G/B combined
function RGBW() {} //dummy ctor

//pre-convert color into correct node width and format:
RGBW.prototype.color = function(color)
{
    switch (typeof color)
    {
        case 'boolean': return color? 0xFF: 0; //just set white channel
        case 'null': return 0;
//        case 'undefined': throw "Color is undefined";
        case 'object':
            if (color instanceof Color) return color.isGray()? color.red(): color.rgb24() << 8; //set white channel for grayscale or R/G/B if non-gray
            //fall thru
        case 'string':
            color = Color(color);
            return color.isGray()? color.red(): color.rgb24() << 8;
//            //fall thru
        case 'number': //RGB
            return ((color >>> 8 ^ color) & 0xFFFF)? color << 8: color & 0xFF; //color vs. grayscale
        default:
            throw "Unhandled: convert " + typeof color + " to monochrome";
    }
}

RGBW.prototype.toRGB = function(color)
{
    if (color & 0xFFFFFF00) return color >>> 8; //RGB
    return (color << 16) | (color << 8) | color; //grayscale
}

RGBW.prototype.fill = function(color)
{
    for (var ofs = 0; ofs < this.numch; ofs += 4) this.nodes.writeUInt32BE(ofs, color); //color2rgbw(color));
    this.dirty = true;
    return this; //fluent
}

RGBW.prototype.json = function(json)
{
    if (!isdef(json)) //stringify //return JSON.stringify(this.nodes, function(key, val) { return key? '#' + val: val; /*+ val.toString(16)*/; }, ' ');
    {
        var buf = '';
        for (var ofs = 0; ofs < this.numch; ofs += 4)
            buf += '", "#' + ('00000000' + this.nodes.readUInt32BE(ofs).toString(16)).slice(-8);
        return '[' + buf.substr(3) + '"]';
    }
//    var vals = JSON.parse(json.replace(/ /g, ''));
    if (typeof json === 'string') json = JSON.parse(json);
    if (!Array.isArray(json)) throw "Expected a JSON array";
//    debugger;
    for (var ofs = 0, inx = 0; ofs < this.numch; ofs += 4, ++inx)
    {
//        if (inx < json.length) console.log(json[inx] + ' => ' + this.color(json[inx]));
        var color = (inx < json.length)? this.color(json[inx]): 0;
        this.nodes.writeUInt32BE(ofs, color);
    }
    this.dirty = true;
    return this; //fluent
}

RGBW.prototype.pixel = function(inx, color) //get/set node color
{
    if (!isdef(color)) return this.nodes.readUInt32BE(this.nodeofs(inx));
    this.nodes.writeUInt32BE(this.nodeofs(inx), color); //color2rgbw(color));
    this.dirty = true;
    return this; //fluent
}

RGBW.prototype.inspect_nodes = function(depth, opts)
{
    var buf = "";
    for (var ofs = 0; ofs < this.length /*numch*/; ofs += 4)
    {
        if (ofs >= buffer.INSPECT_MAX_BYTES) { buf += " ... " + (this.length /*numch*/ - ofs) / 4 + " "; break; }
        buf += " " + ('00000000' + this./*nodes.*/readUInt32BE(ofs).toString(16)).slice(-8);
    }
    return "<RGBW-buf" + buf + ">";
}


//eof
