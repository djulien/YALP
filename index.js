#!/usr/bin/env node
//GpuPort JS wrapper
"use strict";

//module mgmt:
const addon = require('bindings')('yalp-addon');
//const utils = require("./utils");
//console.log(typeof debug, JSON.stringify(Object.keys(debug)));
Object.assign(module.exports, addon); //, Debug); //re-export all add-on exports
Object.defineProperty(module.exports, "debout", //kludge: export setter also
{
    get() { return addon.debout; },
    set(newfd) { addon.debout = newfd; }, //console.log("new fd", typeof newfd, newfd); },
    enumerable: true,
});
module.exports.pkgpath = require.resolve("./package.json"); //my_exports({yalp}); //https://stackoverflow.com/questions/10111163/in-node-js-how-can-i-get-the-path-of-a-module-i-have-loaded-via-require-that-is

//console.log(Object.keys(module.exports));
//{
//debug utils:
//added here so caller can use them without any additional requires()
//    debug, srcline,
//these are defined by addon:
//    cfg, //config info (isXWindows, noGUI, isXTerm, isSSH, isRPi)
//    WS281X, //high-level WS281X formatting
//    Pivot24, //24-bit parallel port
//    FBPixels: //unfmted screen I/O
//    GpuPort, //low-level GPIO
//});

//debug info:
//const started = Date.now();
//require('colors').enabled = true; //for console output (all threads)
//require("magic-globals"); //__file, __line, __stack, __func, etc
//const Path = require("path");
////const { format } = require('path');
//function debug(...args)
//{
//    console.log(...args, `$${addon.thrinx} T+${(Date.now() - started) / 1e3} ${srcline(+1)}`.brightBlue);
//}
//function srcline(nested)
//{
//    const caller = __stack[nested + 1 || 1];
//    const retval = `  @${Path.basename(caller.getFileName().replace(__filename, "me"))}:${caller.getLineNumber()}`;
//    return retval;
//}


//high-level WS281X formatting:
//function WS281X() { }

//function FBPixels() { }

//low-level GPIO:
//function GpuPort() { }

//CLI (debug):
if (!module.parent)
{
    console.error(`To run, use "npm test" instead.`);
    console.log("exports: ", Object.entries(module.exports).map(([key, val]) => truncate(`${key} = ${typeof val}: ` + fmt(val), 65)));
//    addon.start.call(new Date(), function(clock) { console.log(this, clock); }, 5);
//console.log("js ret");
}

function fmt(val)
{
//    return (Object.keys(val) || [val.toString()]).join(", ");
    return (typeof val == "object")? Object.keys(val).join(", "): val.toString();
}

function truncate(val, len)
{
    return val
        .toString()
        .replace(new RegExp(`(?<=[^]{${len || 30},}\\b)[^]*$`), " ...");
}

//const s = new addon.testobj(5), s2 = new addon.testobj;
//addon.jsdebug(`s = ${s.i}, after func(5) = ${s.func(5)}, s = ${s.i}, s2 = ${s2.i}`);

//eof
