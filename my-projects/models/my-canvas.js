
'use strict';

const ndarray = require("ndarray"); //TODO
const makenew = require('my-plugins/utils/makenew');
const hex = require('my-projects/models/color-fx').hex;


//create a minimal graphics context so Cairo isn't needed:
//NOTE: y coordinate is upside down (origin top left rather than bottom left)
const Canvas = module.exports =
function Canvas(w, h)
{
    if (!(this instanceof Canvas)) return makenew(Canvas, arguments);
    this.getContext = function(ignored)
    {
//debugger;
        var m_stack = [];
        var m_settings = {fillstyle: 0};
        var m_ctx =
        {
//            fillStyle: '#000000',
            save: function save() { m_stack.push(this); },
            restore: function restore() { Object.assign(this, m_stack.pop()); },
            createImageData: function createImageData(w, h)
            {
//                return {width: w, height: h, data: new Uint32Array(Math.max(w, 1) * Math.max(h, 1))};
                var retval = {width: w, height: h, data: new Buffer(4 * Math.max(w, 1) * Math.max(h, 1))};
                retval.data.fill(0);
                return retval;
            },
            getImageData: function getImageData(x, y, w, h)
            {
                if ((x >= m_image.width) || (y >= m_image.height)) return;
                w = Math.min(w, m_image.width - x);
                h = Math.min(h, m_image.height - y);
                var retval = this.createImageData(w, h);
                for (var r = 0; r < h; ++r)
                    for (var c = 0; c < w; ++c)
                        try{
                            var src_ofs = 4 * (/*T2B*/(y + r) * m_image.width + x + c), dest_ofs = 4 * (r * w + c);
//                            console.log("get: x %s, y %s, c %s, r %s, w %s, h %s, '%s/%s => '%s/%s", x, y, c, r, w, h, src_ofs, 4 * m_image.width * m_image.height, dest_ofs, 4 * w * h);
                            retval.data.writeUInt32BE(m_image.data.readUInt32BE(src_ofs) >>> 0, dest_ofs);
                        }catch(exc){ console.log("get exc x %s, y %s, r %s, c %s, w %s, h %s, '%s/%s => '%s/%s, msg: %s", x, y, r, c, w, h, src_ofs, 4 * m_image.width * m_image.height, dest_ofs, 4 * w * h, exc.message || exc); return retval; }
                return retval;
            },
            putImageData: function putImageData(img, x, y, w, h)
            {
                if ((x >= m_image.width) || (y >= m_image.height)) return;
                w = Math.min(w, m_image.width - x);
                h = Math.min(h, m_image.height - y);
                for (var r = 0; r < h; ++r)
                    for (var c = 0; c < w; ++c)
                        try{
                            var src_ofs = 4 * (r * w + c), dest_ofs = 4 * (/*T2B*/(y + r) * m_image.width + x + c);
//                            console.log("put: x %s, y %s, c %s, r %s, w %s, h %s, '%s/%s => '%s/%s", x, y, c, r, w, h, src_ofs, 4 * w * h, dest_ofs, 4 * m_image.width * m_image.height);
                            m_image.data.writeUInt32BE(img.data.readUInt32BE(src_ofs) >>> 0, dest_ofs);
                        }catch(exc){ console.log("put exc x %s, y %s, r %s, c %s, w %s, h %s, '%s/%s => '%s/%s, msg: %s", x, y, r, c, w, h, src_ofs, 4 * w * h, dest_ofs, 4 * m_image.width * m_image.height, exc.message || exc); return; }
            },
            fillRect: function fillRect(x, y, w, h)
            {
                var color = parseInt(this.fillStyle.substr(1), 16) << 8 | 0xFF; //RGBA
                if ((x >= m_image.width) || (y >= m_image.height)) return;
                w = Math.min(w, m_image.width - x);
                h = Math.min(h, m_image.height - y);
                for (var r = 0; r < h; ++r)
                    for (var c = 0; c < w; ++c)
                        try{
                            var dest_ofs = 4 * (/*T2B*/(y + r) * m_image.width + x + c);
//                            console.log("fill: x %s, y %s, c %s, r %s, w %s, h %s, '%s/%s, color %s", x, y, c, r, w, h, dest_ofs, 4 * m_image.width * m_image.height, '#' + hex(color, 8));
                            m_image.data.writeUInt32BE(color >>> 0, dest_ofs);
                        }catch(exc){ console.log("fill exc x %s, y %s, r %s, c %s, w %s, h %s, '%s/%s, msg: %s", x, y, r, c, w, h, dest_ofs, 4 * m_image.width * m_image.height, exc.message || exc); return; }
            },
        };
        Object.defineProperty(m_ctx, 'fillStyle',
        {
            get() { return m_settings.fillstyle; },
            set(newval)
            {
//debugger;
                var color = parse_color(newval);
                m_settings.fillstyle = '#' + hex(color, 6);
//                console.log("in: " + typeof newval + " " + newval, "out: " + m_settings.fillstyle);
                return m_settings.fillstyle; //fluent?
            },
        });
        m_ctx.fillStyle = 'rgb(0, 0, 0)';
        return m_ctx;
    }
    var m_image = this.getContext().createImageData(w, h);
    function T2B(y) { return m_image.height - y - 1; } //CAUTION: canvas y coordinate is inverted; this applies that same convention to the simulated canvas
}


const hex_re = /^#([0-9A-F]{6})$/i;
const rgb_re = /^rgb\(([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\)$/i;
const rgba_re = /^rgba\(([0-9.]+),\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\)$/i;

function parse_color(str)
{
    var matches, color;
    if (matches = str.match(rgb_re)) color = (parseInt(matches[1], 10) << 16) | (parseInt(matches[2], 10) << 8) | parseInt(matches[3], 10);
    else if (matches = str.match(rgba_re)) color = (parseInt(matches[1], 10) << 16) | (parseInt(matches[2], 10) << 8) | parseInt(matches[3], 10); //TODO: just throw away A?
    else if (matches = str.match(hex_re)) color = parseInt(matches[1], 16);
    else throw "Invalid CSS color format: '" + str + "'";
//                var c = new Color(newval);
//                c = (c.r << 16) | (c.g << 8) | c.b; //context-2d seems to drop alpha
    return color;
}


//eof
