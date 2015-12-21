
'use strict';


const Color = require('tinycolor2'); //'onecolor').color;
//TODO? const Color = require('parse-color'); //css color parser
const color_cache = module.exports.color_cache = require('my-projects/models/color-cache').cache;

var argb_split = new Buffer([255, 255, 255, 255]);

module.exports.hex =
function hex(val, len)
{
    if (!len) len = 8;
    return ('00000000' + (val >>> 0).toString(16)).slice(-len);
}


//convert argb color to hsv and then dim it:
module.exports.dim =
function dim(argb, brightness)
{
    if (!brightness) return 0xFF000000; //solid black
    if (!argb) throw "Dim: no color found"; //this will cause dropped data so check it first (need at least alpha set)
    if ((brightness == 255) && (typeof argb == 'number')) return argb; //no dimming or parsing needed
    argb = color_cache(argb + '^' + brightness, function()
    {
        var c;
//        if (brightness == 255) return rgba;
        if (typeof argb != 'number') c = Color(argb); //wants ARGB or RGB value, or "rgba..." or "rgb..."
        else
        {
            argb_split.writeUInt32BE(argb, 0);
//    if (rgba_split[3] != 255) throw "Unusual color: " + rgba;
            c = Color({r: argb_split[1], g: argb_split[2], b: argb_split[3], a: argb_split[0]}); //color >> 24, g: color >> 16));
        }
//TODO?   c = Color(hex8(rgba)).hsv(); c.v *= brightness/255; c = c.rgba(); c.a *= 255;
        c = c.darken(100 * (255 - brightness) / 255).toRgb(); //100 => completely dark
        argb_split[1] = c.r; argb_split[2] = c.g; argb_split[3] = c.b; argb_split[0] = c.a * 255; //1.0 => 255
        return argb_split.readUInt32BE(0); //>>> 0;
    });
    return argb;
}


//eof
