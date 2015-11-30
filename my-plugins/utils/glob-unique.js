
'use strict';

const path = require('path');
const glob = module.exports = require('glob');


//add a function to get a unique file:
glob.unique = function(pattern, cb)
{
    pattern = path.resolve(process.cwd(), pattern);
    if (cb) return glob(pattern, function(err, files) { results(err, files, cb); });
    return results(null, glob.sync(pattern), function(err, filename) { if (err) throw err; return filename; });

    function results(err, files, cb)
    {
        if (err) return cb(err);
        switch (files.length)
        {
            case 0: return cb(new Error("No matches for '" + pattern  + "'"));
            case 1: return cb(null, files[0]);
            default: return cb(new Error("Too many matches for '" + pattern + "': " + files.length));
        }
    }
}

//eof
