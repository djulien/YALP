
'use strict';

module.exports = function unprintable(str, want_crlf)
{
    if (want_crlf) str = str.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\b/g, "\\b").replace(/\t/g, "\\t");
    return str.replace(/[^\x20-\x7F]/g, function(str) { return "\\x" + (str.charCodeAt(0) & 0xFF).toString(16); });
}


//eof
