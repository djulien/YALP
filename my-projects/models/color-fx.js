
'use strict';


const Color = require('tinycolor2'); //'onecolor').color;
//TODO? const Color = require('parse-color'); //css color parser
const color_cache = module.exports.color_cache = require('my-projects/models/color-cache').cache;

var rgba_split = new Buffer([255, 255, 255, 255]);


//convert rgba color to hsv and then dim it:
module.exports.dim =
function dim(rgba, brightness)
{
    if (!brightness) return 0x000000FF; //solid black
    if (!rgba) throw "Dim: no color found"; //this will cause dropped data so check it first (need at least alpha set)
    if ((brightness == 255) && (typeof rgba == 'number')) return rgba; //no dimming needed
    rgba = color_cache(rgba + '^' + brightness, function()
    {
        var c;
//        if (brightness == 255) return rgba;
        if (typeof rgba != 'number') c = Color(rgba);
        else
        {
            rgba_split.writeUInt32BE(rgba, 0);
//    if (rgba_split[3] != 255) throw "Unusual color: " + rgba;
            c = Color({r: rgba_split[0], g: rgba_split[1], b: rgba_split[2], a: rgba_split[3]}); //color >> 24, g: color >> 16));
        }
//TODO?   c = Color(hex8(rgba)).hsv(); c.v *= brightness/255; c = c.rgba(); c.a *= 255;
        c = c.darken(100 * (255 - brightness) / 255).toRgb(); //100 => completely dark
        rgba_split[0] = c.r; rgba_split[1] = c.g; rgba_split[2] = c.b; rgba_split[3] = c.a * 255; //1.0 => 255
        return rgba_split.readUInt32BE(0); //>>> 0;
    });
    return rgba;
}


//eof
