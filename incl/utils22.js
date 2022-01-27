#!/usr/bin/env node
//YALP utils

"use strict"; //find bugs + typos easier
require('colors').enabled = true; //for console output (debug only)
const fs = require("fs");
const Path = require("path");
const util = require("util"); //fmt() used by debug()
const {isMainThread, threadId, workerData, parentPort, Worker: Worker_sv} = require('worker_threads'); //elapsed() is thread-aware
extensions();

         
/////////////////////////////////////////////////////////////////
////
/// file helpers:
//

my_exports({name2file, writeln, await4close});
function name2file(name) //v2
{
    const name_fixup = name.replace(/[^\/a-z0-9_\-\.]+/gi, "_"); //name.replace(/\s+/g, "_"); //remove most special chars
    const folder = Path.dirname(name_fixup);
//    /*try*/ { 
    if (folder) fs.mkdirSync(folder, {recursive: true}); //make sure folder is there
    const retval = Object.assign(fs.createWriteStream(name_fixup),
    {
        writeln, 
        filename: name_fixup, 
        started: elapsed(), //msec
        await4close: async function() { await await4close(this, name_fixup); debug(`wrote ${commas(plural(this.numwrites))} line${plural()} to '${this.filename}' after ${milli(elapsed(this.started))} sec`.brightMagenta, srcline(+2)); }, //NOTE: srcline(+1) is in task queue
    });
    return retval;
//    }
//    catch (exc) { debout("exc:".brightRed, exc); }
}
//add method to writable streams:
function writeln(...args)
{
    const retval = this.write(...args);
    this.write("\n");
    ++this.numwrites || (this.numwrites = 1);
    return retval;
}
//wait for file to close:
async function await4close(stream, name)
{
//debug(typeof stream, stream.constructor.name);
//    if (!stream.is_done) { stream.is_done = true; stream.destroy(); }
    stream.end(); //kludge: in case caller hasn't called it yet
    return new Promise((resolve, reject) =>
    {
        stream
            .on("error", err => (console.error(`'${name}' error: ${err}`.brightRed), reject(err)))
            .on("close", () => (console.error(`'${name}' closed`.brightGreen), resolve())); //response to stream.end()
//??            .on("finish", () => (console.error(`'${name}' finished`.brightGreen), resolve()));
    });
}


/////////////////////////////////////////////////////////////////
////
/// formatting helpers:
//

//display commas for readability (debug):
//NOTE: need to use string, otherwise JSON.stringify will remove commas again
my_exports({fmt, datestr, commas, trunc, plural, milli});

function commas(val, padlen = 0)
{
//number.toLocaleString('en-US', {minimumFractionDigits: 2})
    if (isUN(val)) return "undefined"; //kludge: don't throw exc; allow caller to continue
//?    if (isNaN(val)) return val; //as-is
    return val.toLocaleString().padStart(padlen, " ");
}


//function trunc(val, len = 30)
function trunc(val, len) //v2
{
    return val
        .toString()
        .replace(new RegExp(`(?<=[^]{${len || 30},}\\b)[^]*$`), trimmed => ` ...(+${trimmed.length})`); //try to cut on word boundary
}


function plural(n, multi, single)
{
    if (isUN(n)) return plural.suffix;
    plural.suffix = (n != 1)? multi || "s": single || "";
    return n;
}


//show msec val to 3 dec places:
function milli(n) { return (n / 1e3).toFixed(3); }


//format a value for display/logging:
//typically used by CLI/unit tests
function fmt(val, opts = {})
{
//    return (Object.keys(val) || [val.toString()]).join(", ");
    const retval = //Array.isArray(val)? "[0.." + (val.length - 1) + "]":
        isobj(val)? [val.constructor.name + "!", 
            (typeof val == "function")? trim(val.toString()).replace(/(\n|\/\/)[\s\S]*$/, " ..."): //first line (signature) only
//            val.hasOwnProperty("length")?  "[0.." + (val.length - 1) + "]": //[Array.isArray(val)? "array": "array-like",
            ("length" in val)?  "[0.." + (val.length - 1) + "]": //[Array.isArray(val)? "array": "array-like",
            "{" + trim(Object.keys(val).join(", ")) + "}"]:
        (typeof val == "string")? ["string", "'" + trim(val) + "'"]:
//        (typeof val == "number")? ["number", val.toLocaleString()]: //use commas to group 1000s
//        [typeof val, val.toString()];
        [typeof val, (opts.base == 16)? hex(val): val.toLocaleString()];
    fmt.typeof = retval[0];
    return retval[1];
    function trim(thing) { return opts.truncate? trunc(thing, opts.truncate): thing; }
}


function datestr(date, opts)
{
    if (isUN(opts) && isobj(date) && !date.getTime) [date, opts] = [undefined, date];
//    const dateStyle = "short";
    const timeStyle = (opts || {}).want_time? {timeStyle: "short", dateStyle: "short"}: {}; //, year: "4-digit"}: {};
    return ((typeof date == "string")? new Date(date): (date || new Date()))
        .toLocaleDateString('en-US', timeStyle); //{/*dateStyle,*/ timeStyle}); //, { day: '2-digit', month: '2-digit', year: 'numeric'}); 
//see https://stackoverflow.com/questions/2035699/how-to-convert-a-full-date-to-a-short-date-in-javascript
//and https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat
}


/////////////////////////////////////////////////////////////////
////
/// data handling helpers:
//

my_exports({clamp, as_is, isUN, isNUN, isary, defunc, isobj, objcopy, methodsof, numkeys, replace_prop});

function clamp(val, max, min)
{
    const retval = Math.min(Math.max(val, min || 0), max); //min defaults to 0, no default for max
    return retval;
}

function as_is(val) { return val; }


//check for undefined or null:
//based on https://stackoverflow.com/questions/2647867/how-can-i-determine-if-a-variable-is-undefined-or-null
//alt vals can be lambdas to avoid premature eval
//function isUN(thing, unval)
//{
//    const retval = (thing == null);
//    return (unval === undefined)? retval: retval? unval: thing;
//}
function isNUN(thing, hasval, unval)
{
    const retval = (thing == null); //true for undef or null; see https://stackoverflow.com/questions/2647867/how-can-i-determine-if-a-variable-is-undefined-or-null
    return (hasval === undefined)? !retval: //return true/false
        retval? defunc(unval): defunc(defval); //return alternate value depending on undefined/null or not
}
function isUN(thing, unval, hasval)
{
    const retval = (thing == null); //true for undef or null; see https://stackoverflow.com/questions/2647867/how-can-i-determine-if-a-variable-is-undefined-or-null
    return (unval === undefined)? retval: //return true/false
        retval? defunc(unval): //return alternate value if undefined or null
            (hasval === undefined)? thing: defunc(hasval); //else return arg or alt value
}


//console.log(test.numpx, srcline());
//console.log(test.numpx, srcline());
//console.log(test.thing);


//check for array:
//my_exports({isary});
function isary(thing) { return Array.isArray(thing); }

function defunc(thing) { return (typeof thing == "function")? thing(): thing; }

//replace getter with its value:
//use only when prop value will no longer change
function replace_prop(value, name_override) //v3
{
//    try //???CAUTION: getter fails if something below throws???
//    {
    srcline(+1);
//debug(typeof srcline.getter, srcline.getter);
    const name = srcline.getter || name_override; //|| "??" + srcline.latest; //sometimes stack trace !show getter name; allow caller to set it
    if (!name) throw `can't get caller's name from ${srcline(+1)}`.brightRed;
//debug(srcline.stackline);
//debug(`replacing getter '${name}' with ${typeof value}`, trunc(JSON.stringify(value), 300), srcline(+1));
//console.log("persist", name, srcline.stackline, srcline.getter, srcline.filename, srcline.linenum, srcline.func);
    const retval = Object.defineProperty(this, name, {value, enumerable: true})[name];
    if (retval != this[name]) throw `replace_prop failed1: ${retval} != ${value}`.brightRed;
    if (retval != value) throw `replace_prop failed2: ${retval} != ${value}`.brightRed;
    return retval;
//console.log("pers2", Object.getOwnPropertyNames(retval), retval[name]);
//    Object.defineProperty(this, srcline.getter, {value, enumerable: true}); //[srcline.getter];
//    }
//    catch (exc) { debug("repl prop failed:".brightRed, exc, srcline(+1)); return value; }
}


//from https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
function isobj(thing, objval)
{
//    const answer1 = (typeof thing == 'object' && thing !== null);
    const retval = (thing === Object(thing)); //from https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
//    if (answer1 != answer2) throw `disagree: ${answer1} ${answer2}${srcline()}`.brightRed;
    return (objval === undefined)? retval: //return true/false
        retval? defunc(objval): defunc(thing); //return alternate value depending on obj or not
}


//Object.assign but clone obj first:
function objcopy(obj, ...overrides) { return Object.assign(JSON.parse(JSON.stringify(obj)), ...overrides); } //CAUTION: mangles dates, arrays, etc


//get all methods of an obj (for debug):
//for more info see https://flaviocopes.com/how-to-list-object-methods-javascript/
function methodsof(thing)
{
    const retval = {};
    for (let obj = thing; obj; obj = Object.getPrototypeOf(obj))
        Object.getOwnPropertyNames(obj).forEach(name => !(name in retval) && (retval[name] = obj.constructor.name /*+ " " + typeof obj[name]*/)); //store first (closest) level only
    return Object.entries(retval);
}


function numkeys(obj) { return Object.keys(obj || {}).length; }


//length conversions:
my_exports({u32, u32bytes, u32inx, hex});

function u32(val) { return val >>> 0; }
//function uint32(val) { return val >>> 0; }

function u32bytes(u32inx) { return u32inx * Uint32Array.BYTES_PER_ELEMENT; }
//function bytelen(u32len) { return u32len * Uint32Array.BYTES_PER_ELEMENT; }
function u32inx(bytes) { return bytes / Uint32Array.BYTES_PER_ELEMENT; }

debug("TODO: make 0-9 abbrev optional".brightYellow);
function hex(val, prefix = "0x") { return /*isUN(pref, "0x")*/ (prefix + u32(val).toString(16)).replace(new RegExp("^" + prefix + "(\\d)$", ""), "$1"); } //force to uint32 for correct display value; leave 0..9 as-is


/////////////////////////////////////////////////////////////////
////
/// misc thread-aware helpers:
//

my_exports({elapsed, whoami});
elapsed(); //set epoch at load time

function elapsed(since) //v2 thread-aware
{
//console.log(typeof since, since, srcline(+1));
//    const now = Date.now();
    if (!elapsed.epoch) elapsed.epoch = (workerData || {}).epoch || Date.now(); //isMainThread? Date.now(): workerData.epoch; //use same time base for all threads
//    return "T+" + (((elapsed.latest = Date.now()) - (started || elapsed.started)) / 1e3).toFixed(3); }
    return ((elapsed.latest = Date.now()) - ((since || 0) + elapsed.epoch));// / 1e3;
}
//function elapsed_str(when) { return (elapsed(when) / 1e3).toFixed(3); }
//function elapsed(when) { let now; return ((when || now || (now = Date.now())) - (elapsed.epoch || (elapsed.epoch = now || (now = Date.now())))) / 1e3; }
//function TOMERGE_elapsed(started) { return !isUN(started)? fb.elapsed(started): fb.elapsed(); }
//function elapsed(...args) { return fb.elapsed.apply(fb, args); }
//function elapsed_str(when) { return "T+" + milli(elapsed(when)); } //msec -> sec


function whoami() { return "$" + threadId + "MT".charAt(+!isMainThread); }


/////////////////////////////////////////////////////////////////
////
/// debug helpers:
//

//for profiling see https://nodejs.org/en/docs/guides/simple-profiling/

my_exports({debug, warn, TODO, fatal, srcline});

function debug(...args) //v22
{
if (false) //TODO: selectable simplified version?
{
    console.log(...args, srcline(+1));
    return (args.length > 1)? args: args[0]; //allow inline usage
}
//    args.forEach((arg, inx) => console.error("isbuf?", !isUN(isUN(arg, {}).byteLength)));
//    args.forEach((arg, inx) => !isUN(isUN(arg, {}).buffer) && args.splice(inx, 1, Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`))));
//    args.unshift(whoami());
    const want_srcline = true; //(debug.opts || {}).srcline; //__stack[] is useful but expensive; allow it to be turned off
    const [valargs, srcargs] = (want_srcline !== false)? args.reduce((partitioned, arg) => (partitioned[+isUN(arg, "").hasOwnProperty("isSrcline")].push(arg), partitioned), [[], [srcline(+1).toString()]]): [args, []];
//    valargs.push("T+" + milli(elapsed()), whoami(), ...srcargs); //, srcline(+1)); //TODO: remove redundant file names from srcargs
    console.log(...valargs.map(arg => fmt(arg)), "T+" + milli(elapsed()), whoami(), ...srcargs);
    return (args.length > 1)? args: args[0]; //allow inline usage

//    function fmt(val) { return !isUN(isUN(arg, {}).buffer)? Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`}): arg; }
    function fmt(val) { return util.formatWithOptions({maxArrayLength: 20, maxStringLength: 200, colors: true, getters: true}, val).replace(/(?<!0x|[\d\.a-f\/])\d+/gi, val => commas(+val)); } //don't add commas to hex, dec, dates; TODO: fix year in verbose date fmt
}
//[" 0x1234", "123"].forEach(str => console.log(str.replace(/(?<!0x|[\d\.])\d+/gi, val => "X" + val + "X"))); process.exit();

function warn(...args) { /*console.log*/debug("[WARNING]".brightYellow, ...args, srcline(+1)); }

function TODO(...args) { /*console.log*/debug(`[TODO ${srcline(+1)}]`.brightYellow, ...args); } //, srcline(+1)); }

function fatal(...args) { throw util.format(...args.map(arg => arg.toString().brightRed), srcline(+1)); }

function srcline(depth) //v3
{
    if (isNaN(depth += 2)) depth = 2;
//adapted from https://stackoverflow.com/questions/38435450/get-current-function-name-in-strict-mode
    const stack = new Error().stack.split("\n"); //[1] = here, [2] = caller
//console.log(depth, JSON.stringify(stack[depth]));
//at Object.get thing [as thing] (/home/dj/Documents/mydev/my-npm/YALP/yalp21js/stdalone.js:34:19)","    at Object.<anonymous> (/
//    const parse = stack[depth].match(/^\s*at\s+([^\s(:\[]+?)\s*(?:\[as\s+([^\]]+?)\])?\s*\([^):\/]+?)(\/[^:\/]+):(\d+)(?::(\d+))?\s*$/i);
//                                              0                    1                   2          3         4     5                      6
//regex101.com to the rescue :)
    const parse = stack[Math.floor(depth)].match(/^(?:\s*\[(?:as\s+)?([^\]]+)\]|\s*\(?(?:([^\)]+?)\/([^\/]+?):(\d+):(\d+))\)?|\s*(?:at\s+)?(\S+?))+$/i);
//    const parse = stack[Math.floor(depth)].match(/^(?:\s*\[(?:as\s+)?([^\]]+)\]|\s*\(?(?:([^\)]+?)\/([^\/]+?):(\d+):(\d+))\)?|\s*(?:at\s+)?)+$/i);
//    const parse = stack[Math.floor(depth)].match(/^(?:\s*\[(?:as\s+)?([^\]]+)\]|\s*\((?:([^\)]+?)\/([^\/]+?):(\d+):(\d+))\)|(?:at\s+)?([^\[\(]+)\s*)+$/i);
    if (!parse) throw `stack[${depth}] '${srcline.stackline}' parse error`.brightRed;
//console.log(stack[depth].match(/\[as\s+([^\]]+)\]/i));
//console.log(stack[depth].match(/\[at\s+([^\]\(]+?)[\]\(]/i));
    if (!parse[1]) parse[1] = (stack[Math.floor(depth)].match(/\[as\s+([^\]]+)\]/i) || [])[1]; //kludge: match() not returning this one
    if (!parse[6]) parse[6] = (stack[Math.floor(depth)].match(/at\s+([^\[\(]+?)[\[\(]/i) || [])[1]; //kludge: match() not returning this one
//console.log("srcline", JSON.stringify(parse));
    [srcline.stackline, srcline.getter, srcline.folder, srcline.filename, srcline.linenum, srcline.colnum, srcline.func] = parse;
//console.log("srcline parsed", srcline.filename, srcline.linenum, srcline.func);
    const retval = ` @${srcline.filename}:${srcline.linenum}`; //Object.defineProperty(new String(` @${srcline.filename}:${srcline.linenum}`), "isSrcline", {value: true}); //tag for debug()
//console.log("srcline retval", retval);
    return srcline.latest = retval;
}
//function good_srcline(depth = 0) { return ` @:${(__stack[depth + 1] || {getLineNumber: () => -1}).getLineNumber()}`; }
//function srcline(depth = 0)
//{
//    if (!isUN(srcline.bypass)) return srcline.bypass; //__stack[] is useful but expensive; allow it to be turned off
//    const stkfr = __stack[depth + 1] || {getFileName: () => "??", getLineNumber: () => "?"};
////    process.stdout.write(util.format(typeof stkfr, isobj(stkfr, stkfr.constructor.name) || "none", "\n"));
////    process.stdout.write(util.format(((stkfr || {}).getFilename || (() => "??"))(), "\n"));
////    process.stdout.write(util.format(((stkfr || {}).getLinenumber || (() => -1))(), "\n"));
////    try { return " @" + Path.basename(((stkfr || {}).getFilename || (() => "??"))()) + ":" + ((stkfr || {}).getLineNumber || (() => -1))(); }
////no worky    try { return " @" + Path.basename(stkfr.getFilename()) + ":" + stkfr.getLineNumber(); }
////    try { return " @" + Path.basename(stkfr.getFilename()) + ":" + stkfr.getLineNumber(); }
////    catch { return " @!!:!"; }
////console.log(typeof stkfr, (stkfr.constructor || {}).name, typeof stkfr.getFileName, typeof (stkfr.prototype || {}).getFileName);
////console.log(stkfr.getFileName(), stkfr.getFileName().constructor.name);
//    const retval = " @" + Path.basename(stkfr.getFileName()) + ":" + stkfr.getLineNumber(); //CAUTION: CallSite method names are camel case
//    return Object.defineProperty(new String(retval), "isSrcline", {value: true}); //allow mult (nested) srcline to be detected; need obj for prop; !enum
//}
//function isSrcline(str) { return isUN(str, "").toString().match(/^ @[^^&{}[\]\$=()%]+:\d+$/); }


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//prototype extensions:
function extensions()
{
    if (extensions.ready) return;
    Object.defineProperties(Array.prototype,
    {
        at: {value: function(inx) { return this[(inx < 0)? this.length + inx: inx]; }}, //assumes inx >= -length
        chunks: {value: function(chunklen) { return Array.from({length: Math.ceil(this.length / chunklen)}, (_, inx) => this.slice(inx * chunklen, (inx + 1) * chunklen)); }},
    });
    extensions.ready = true;
}
        

//CLI/unit test (debug):
//to validate use https://www.rapidtables.com/convert/color/rgb-to-hsv.html
// or https://www.rapidtables.com/convert/color/hsv-to-rgb.html
if (!module.parent)
{
    console.log(`Use "npm test" rather than running index.js directly.`.brightCyan, srcline());
    console.log("exports:".brightBlue, Object.entries(module.exports)
        .map(([key, val]) => `${key} = ${fmt(val, {truncate: 50, base: key.match(/mask|map/i)? 16: 10})} (${fmt.typeof})`), srcline());
    console.log("unit tests:".brightCyan, srcline());
    console.log("TODO".brightYellow);
}


//eof