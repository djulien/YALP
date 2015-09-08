'use strict';
//YALP plug-in to show some debug info

console.log("YALP starting from '" + __dirname + "'");

var args = process.argv.slice(2); //http://stackoverflow.com/questions/4351521/how-to-pass-command-line-arguments-to-node-js

//if (!args.length) console.log("usage:  node[js]  " + fileio.abs2rel(__filename) + "  serial-port  baud  config-bits");
for (var i = 0; i < args.length; ++i)
    console.log("arg[%d/%d]: '%s'", i, args.length, args[i]);

//eof
