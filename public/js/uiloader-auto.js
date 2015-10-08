
var numfiles = 0;

var path = require('path');
var require_glob = require('node-glob-loader').load; //https://www.npmjs.com/package/node-glob-loader
var ROOTDIR = path.dirname(require.main.filename); //__dirname
//require_glob(ROOTDIR + '/my-plugins/ui/*[!-bk].js', {strict: true, noself: true}, function(exported, filename)
require_glob(ROOTDIR + '/my-plugins/ui/!(*-bk).js', {strict: true, noself: true}, function(exported, filename)
{
//        var relpath = path.relative(process.cwd() /*__dirname*/ /*path.dirname(require.main.filename)*/, filename);
//        console.log("route", filename, __filename);
//        if (path.basename(filename) == path.basename(__filename)) return; //skip self
    console.log("ui plugin[%d] '%s'".blue, numfiles++, path.relative(ROOTDIR, filename)); //, exported);
})./*done*/ then(function() { console.log("ui-plugins found: %d".green, numfiles); });

//eof
