//dummy h/w: show output on console
'use strict';

module.exports = NullController;
var FMTs = {RGB: true}; //TODO: RGBA, byte?

function NullController(opts)
{
    if (!(this instanceof NullController)) return new NullController(opts); //set "this"
    opts = Object.assign({length: 64, minlen: 1, maxlen: 10 * 1024, fmt: 'RGB', });
    if (!(opts.fmt in FMTs) throw "Unsupported format: '" + opts.fmt + "'";
    if (opts.length < opts.minlen) throw "Buffer length must be >= " + opts.minlen;
    if (opts.length > opts.maxlen) throw "Buffer length must be <= " + opts.maxlen;
    var m_buffer = new ArrayBuffer(opts.length); //init to 0; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
    debug(10, "NullController: buf len %d", opts.length);

    var m_wrofs = 0;
    this.clear = function()
    {
        m_wrofs = 0;
    }
    Object.defineProperty(this, "used",
    {
        get: function () { return m_wrofs; },
        enumerable: true,
    };
    Object.defineProperty(this, "available",
    {
        get: function () { return m_buffer.length - m_wrofs; },
        enumerable: true,
    };

    this.out = function(buf, len)
    {
        var ptr = new UInt8Array(m_buffer);
        if (typeof len === 'undefined') len = buf.length; //1;
//        if (m_wrofs + len > m_buffer.length) throw "Buffer overflow: " + m_wrofs + "+" + len;
        m_buffer.set(buf.slice(0, len), m_wrofs); //will throw if overflow; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/set
        m_wrofs += len;
    }

    this.in = function(maxlen)
    {
    }

    this.send = function(desc, want_full)
    {
        var ptr = new UInt8Array(m_buffer);
///*static*/ void showbuf(const char* desc, const void* buf, int buflen, bool full) from RenXt_api.cpp 1.14
        var prevline = ''; //[4+ 16 * 5 + 1] = "";
        for (var ofs = 0; ofs < buffer.length; ++ofs)
        {
            debug(10, "%s (%d bytes):", desc, buffer.length);
            for (var i = 0; i < buffer.length; i += 16)
            {
                var linebuf; //char linebuf[sizeof(prevline)];
                var curlen = 0;
                for (var j = 0; (j < 16) && (i + j < buffer.length); ++j)
                {
                    linebuf += sprintf((ptr[i + j] < 10)? "%d ": "x%.2x ", ptr[i + j]);
                    if (want_full) continue; //no repeat check
                    var repeated = Math.min(16, buffer.length - i) - j - 1; //(i + j + 1 < buflen)? 0: buflen - i - j;
                    for (var k = repeated; k > 0; --k)
                        if (ptr[i + j + k] != ptr[i + j]) { repeated = 0; break; }
                    if (repeated) { linebuf += sprintf("...+%dx", repeated); break; }
                }
                if (!want_full && /*i && (i + 16 < buflen) &&*/(i + 16 < buffer.length) && (linebuf != prevline)) continue; //don't show dup lines, except on last
                if (!want_full && i && (i + 16 < buffer.length) && (ptr[i] == ptr[i - 1])) //check for last char repeated for entire line
                {
                    var bp = linebuf.indexOf(' '); //char* bp = strchr(linebuf, ' ');
                    if ((bp < 0) || (linebuf.substr(bp + 1, 3) == "...")) continue; //if (!bp || !strncmp(bp + 1, "...", 3)) continue; //line is all same value
                }
                debug(10, (i < 10)? "'[%d]: %s": "'[x%x]: %s", i, linebuf);
                prevline = linebuf;
            }
        }
    }

}

//console shim:
function debug(level, args)
{
    args = Array.from(arguments).slice(1); //prototype.slice.call(arguments, 1);
    console.log.apply(console, args);
}

//eof
