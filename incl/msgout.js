#!/usr/bin/env node
//message output/debug functions
//Copyright (c) 2016-2018,2020,2021 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 0.9  DJ  10/3/16  initial version
//ver 0.95 DJ  3/15/17  cleaned up, refactored/rewritten for FriendsWithGpu article
//ver 1.0  DJ  3/20/17  finally got texture re-write working on RPi
//ver 1.0a DJ  9/24/17  minor clean up
//ver 1.0b DJ  11/22/17  add shim for non-OpenGL version of GpuCanvas
//ver 1.0.18 DJ  1/9/18  updated for multi-threading, simplified
//ver 1.0.18b DJ  6/6/18  minor api cleanup; misc fixes to multi-threading
//ver 1.0.20 DJ  10/20/20  rewrite/simplify for use with GpuPort addon

'use strict'; //find bugs easier
require('colors').enabled = true; //for console output (all threads)
require("magic-globals"); //__file, __line, __stack, __func, etc
//const OS = require('os'); //cpus()
const fs = require("fs");
const Path = require('path');
//const {blocking, wait} = require('blocking-style');
//const cluster = require('cluster');
const JSON = require('circular-json'); //CAUTION: replaces std JSON with circular-safe version
const {sprintf, vsprintf} = require('sprintf-js'); //https://www.npmjs.com/package/sprintf-js
//const {isMainThread, parentPort} = require('worker_threads');
const {jsdebug/*, thrinx*/} = require("yalp"); //"bindings")("gpuport"); //"../"); //npm link allows real module name to be used here; CAUTION: need bindings here to avoid recursive export
//CAUTION: circular deps
//any exports used by utils.js must be defined before including utils
//module.exports.debug = debug;
//module.exports.debug_nested = debug_nested;
//module.exports.debug_limit = debug_limit;
//module.exports.srcline = srcline;
//console.log("msgout: loading utlis");
const {my_exports, auto_obj, tostr, time2str, truncate, commas, isdef/*, throwx*/} = require("yalp/incl/utils"); //NOTE: also adds __stack and console colors
//console.log("msgout: loaded utlis", my_exports, elapsed);
//console.log("imports", my_exports, elapsed, tostr, truncate, commas, isdef);

//console.log(typeof jsdebug, Object.keys(require("gpuport")));
//const { debug } = require('console');
//extensions(); //hoist for inline init usage


////////////////////////////////////////////////////////////////////////////////
////
/// debug/message functions:
//


//message types/destinations:
const MSGTYPE =
{
//    STDOUT: 1,
//    STDERR: 2,
//    DEBUG: 1, DEBUG_NESTED: 101, DEBUG_LIMIT: 1001,
//    LOG: 3,
    debug: 1, debug_level: 11, debug_nested: 101, debug_limit: 1001,
    log: 2,
    errlog: 102,
    warn: 3,
    fmtstr: 5,
    TODO: 103,
    fatal: 109,
};
//for (const [key, val] of Object.entries(MSGTYPE)) console.log("msgout: exp", key);
for (const [key, val] of Object.entries(MSGTYPE)) my_exports({[key]: myprintf.bind(null, val)});
//aliases for easier use later in this module:
const debug = module.exports.debug;
const debug_level = module.exports.debug_level;
const debug_nested = module.exports.debug_nested;
const debug_limit = module.exports.debug_limit;
const log = module.exports.log;
const errlog = module.exports.errlog;
const TODO = module.exports.TODO;
const fatal = module.exports.fatal;

//inject leading myprintf arg in lieu of cpp macros:
//my_exports({debug: myprintf.bind(null, MSGTYPE.DEBUG)});
//my_exports({debug_nested: myprintf.bind(null, MSGTYPE.DEBUG_NESTED)});
//my_exports({debug_limit: myprintf.bind(null, MSGTYPE.DEBUG_LIMIT)});
//my_exports({TODO: myprintf.bind(null, MSGTYPE.DEBUG_LIMIT)});
//    return debug.with_opts({limit: 1, nested: +1}, "TODO: ".brightYellow, ...args);
//my_exports({txtout: myprintf.bind(null, MSGDEST.STDERR)});
//my_exports({log: myprintf.bind(null, MSGDEST.LOG)});
//my_exports({errlog: myprintf.bind(null, MSGDEST.ERRLOG)});


//output msgs:
//2 styles of messages:
//- printf-style with fmt str
//- console style with individual args
//show values and return single or array (for in-line usage)
//module.exports.debug = debug; //must be defined before including any circular deps
//const {my_exports, tostr, truncate, commas} = require("yalp21/incl/utils"); //NOTE: also adds __stack and console colors
function myprintf(dest, ...args)
{
//	const blue = "&&".brightBlue.split("&&"); //color code start+end
//    const caller = srcline((debout.depth || 0) + 1);
//get extra type-specific params:
    if (!~Object.values(MSGTYPE).indexOf(dest)) throwx("unknown msg type: %d", dest);
    const depth = (dest == MSGTYPE.debug_nested)? args.shift(): 0;
    const detail = (dest == MSGTYPE.errlog)? -1: (dest == MSGTYPE.debug_level)? args.shift(): 0;
    const limit = (dest == MSGTYPE.TODO)? 1: (dest == MSGTYPE.debug_limit)? args.shift(): 0;
    const label = (dest == MSGTYPE.errlog)? "ERROR: ".brightRed:
        (dest == MSGTYPE.fatal)? "FATAL: ".brightRed:
        (dest == MSGTYPE.TODO)? "TODO: ".brightYellow:
        (dest == MSGTYPE.warn)? "WARNING: ".brightYellow:
        (dest == MSGTYPE.log)? "LOG: ":
        "DEBUG: "; //.brightBlue; //`DEBUG ${args.length}: `;
    const info = srcline(/*(debug.depth || 0)*/ depth + 1); // + ` T+${elapsed() / 1e3}`;
//    const [fmt, ] = args;
//console.log(dest, label, info);
//console.log(dest, escnp(label, {colors: false, newlines: false, spaces: false}), info);

    const UNDEF = "undefined".brightRed.brightBlue; //kludge: don't make entire debug msg red
//    const undefs = Object.entries(args).filter(([inx, arg]) => !isdef(arg));
//    if (undefs.length) console.log(("undefined args: " + undefs.map(([inx,]) => inx).join(", ") + srcline(+1)).brightRed);
//    if (!extensions.installed) console.log(...args);
    if (debug.enabled === false); //default (undef) on
    else if (limit && ++(myprintf.count || (myprintf.count = auto_obj({}, 0)))[info] > limit);
    else
    {
//        const fmt = tostr(args[0]);
        const has_fmt = (args.length > 1) && Array.from(tostr(args[0]).matchAll(/(^|[^%])%([^%]|$)/g)).length; // /(?<!%)%/g)).length; //look for printf-style fmts ("%X")
//console.log(args.length, typeof has_fmt, has_fmt, !!tostr(args[0]).match(/%%/));
        let argcount = 0;
//console.log(want_printf, srcline());
        if (has_fmt) args[0] = args[0] //fix up args to work around sprintf.js limitations
            .replace(/(?<!%)%lu/g, "%u") //%lu not supported by sprintf.js :(
            .replace(/(?<!%)%(('[udf])|[\d.]*[^%])/g, (argfmt, want_commas) => !isdef(args[++argcount])? (args[argcount] = UNDEF, "%s"): want_commas? (args[argcount] = commas(args[argcount]), "%s"): argfmt); //kludge: convert "%'d" to strings; sprintf.js doesn't handle comma separators; also refmt undef args
//if (has_fmt == 8) console.log(args[0]);
//console.log(want_printf, JSON.stringify(args[0]), srcline());
//console.log(args, srcline());
        const valstr = //append sprintf result + remaining non-sprintf args
            (has_fmt? //(tostr(args[0]).match(/%/) && (args.length > 1))?
                [sprintf(...args)].concat(args.slice(has_fmt + 1)): //sprintf-style: first arg = fmt string
                args).map((arg) => isdef(arg)? truncate(fmt(arg), isdef(debug.max_arg_len, +debug.max_arg_len, 100)): UNDEF).join(" "); //!isNaN(debug.max_arg_len)? debug.max_arg_len: 100)).join(" ");
//        if (!blue[0].length) console.log(label, ...args.map((arg) => fmt(arg)), caller);
//        else console.log(label.brightBlue.slice(0, -blue[1].length), ...args.map((arg) => replaceAll(fmt(arg), blue[1], blue[0])), caller.brightBlue.slice(blue[0].length));
//console.log(typeof outstr, typeof outstr.color_nest);
        if (dest == MSGTYPE.fmtstr) return valstr;
//const escnp_debug = color_nest.want_debug = srcline(+1).match(/@player\.js:(97|525)/);
//if (escnp_debug) console.log("orig", label + valstr + info);
//if (escnp_debug) console.log("orig-esc", escnp(label + valstr + info, {colors: false, newlines: false, xspaces: false}));
        const outstr = color_nest(label + valstr + info) //.brightBlue;
            .replace(/\r(.*)$/, `$1 ${CLREOL()} \r`); //issue clear-to-eol + move \r to end of line
//      if (!isMainThread) parentPort.postMessage(outstr); //kludge: worker threads can't use console; delegate to main thread
//      else if (outstr_fixup != outstr) process.stderr.write(outstr_fixup); //kludge: preserve \r
//      else console.log(outstr); //label + msg + caller);
//if (escnp_debug) console.log(outstr.replace(/[^\x20-\x7e]/g, ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0")));
//if (escnp_debug) console.log(">nest", outstr);
//if (escnp_debug) console.log(">nest-esc", escnp(outstr, {colors: false, newlines: false, xspaces: false}));
        const outbuf = color_nest(jsdebug(outstr)); //add-on will append thread/elapsed time info; add color if none
//if (escnp_debug) console.log(">jsdeb", outbuf);
//if (escnp_debug) console.log(">jsdeb-esc", escnp(outbuf, {colors: false, newlines: false, xspaces: false}));
//color_nest.want_debug = false;
        if (dest == MSGTYPE.errlog || dest == MSGTYPE.log) //insert timestamp
        {
            const first = !myprintf[dest + "_init"]; myprintf[dest + "_init"] = true;
            const has_color = outbuf.match(ANSI_re());
            const ofs = has_color? has_color.index + has_color[0].length: 0; //where to insert timestamp
//            outbuf.replace(ANSI_re, "$&" + logtime);
            const logbuf = outbuf.slice(0, ofs) + "[" + time2str(null, first) + "] " + outbuf.slice(ofs);
//console.log(escnp(outbuf, {colors: false, newlines: false, spaces: false}));
            fs.appendFileSync("./data/yalp.log", (first? "\n": "") + logbuf + "\n", "utf8"); //TODO: async?
        }
        if (dest == MSGTYPE.fatal) throw outbuf;
    }
//    debug.depth = 0; //reset for next time
    debug.timestamp = Date.now(); //simplify casual benchmarking/progress indicator
    return (args.length < 2)? args[0]: args; //return first arg; allows non-intrusive inline usage
//    function fmt(thing) { return json_tidy(JSON.stringify(thing)); } //escnp(thing)

    function fmt(arg)
    {
        const str = tostr(arg);
        return str.match(/@[^:]+:\d+ T\+[\d.]+$/i)? str: escsp(escnp(str)); //kludge: don't fmt if already
    }
}
//module.exports.jsdebug = jsdebug; //also export inner
//module.exports.debug = debug;

//variants:
//my_exports({debug_nested});
//function debug_nested(depth, ...args)
//{
//    ++debug.depth || (debug.depth = 1);
//    debug.depth += depth;
//    return debug(...args);
//}
//module.exports.debug_nested = debug_nested;

//my_exports(debug_limit);
//function debug_limit(count, ...args)
//{
//    const key = srcline(+1);
//    if ((++debug_limit[key] || (debug_limit[key] = 1)) <= count) debug_nested(+1, ...args);
//}
//module.exports.debug_limit = debug_limit;


//unit test:
if (!module.parent) setImmediate(unit_test); //allow inline init to finish first
function unit_test()
{
    jsdebug("here1");
    debug(1, 2, 3);
    debug("int: %d, float: %f, str: '%s', hex 0x%x", 1, 2.3, "hi", 0x1234);
    debug("begin".brightGreen, "and more", "end");
    debug("begin", "and more", "end".brightRed);
    debug("exports:", Object.entries(module.exports).map(([key, val]) => truncate(`${key} = ${typeof val}: ` + fmt(val), 65)));
    TODO("more testing");
    errlog("error");
    log("log msg");
    for (let i = 0; i < 4; ++i) debug_limit(2, "repeated message");
    debug_nested(+1, "nested msg");

    function fmt(val)
    {
//    return (Object.keys(val) || [val.toString()]).join(", ");
        return (typeof val == "object")? Object.keys(val).join(", "): val.toString();
    }
}


//reminder msg (dev):
//my_exports({TODO});
//function TODO(...args)
//{
//    /*if (!TODO[msg]*/ ++debug.depth || (debug.depth = 1);
//    return debug.with_opts({limit: 1, nested: +1}, "TODO: ".brightYellow, ...args);
//    return debug_limit(1, "TODO: ".brightYellow, ...args);
//}


//my_exports({txtout});
//function txtout(...args)
//{
//    console.error(sprintf(...args), `[T+${elapsed() / 1e3}]`, srcline(+1));
//    return (args.length < 2)? args[0]: args; //return first arg; allows non-intrusive inline usage
//}


//my_exports({log});
//function log(...args)
//{
//TODO("write to file");
//    return txtout(...args);
//}


//my_exports({errlog});
//function errlog(...args)
//{
//TODO("write to file");
//    return txtout(...args);
//}


////////////////////////////////////////////////////////////////////////////////
////
/// helpers:
//
//TODO: move to utils?


//esc codes:
//https://en.wikipedia.org/wiki/ANSI_escape_code#Escape_sequences
//kludge: these are functions to allow hoisting
/*const*/ function CLREOL() { return "\x1B[0K"; } //CSI 0 K 
/*const*/ function ANSI_re() { return /\x1B\[([\d;]+)m/g; } //ANSI color codes
//const all_ANSI_re = new RegExp(ANSI_re.source, "g");
/*const*/ function EOCOLOR() { return "39"; } //"0"; //used with ANSI color code


//esc non-printable chars:
//console.log(escnp(`init: frtime ${1234}, ready ${0xff00}`, {spaces: false})); process.exit();
my_exports({escnp});
function escnp(str, opts) //{colors: true, newlines: false, spaces: true})
{
    const keeps = [];
    if ((opts || {}).colors !== false) keeps.push(ANSI_re().source);
    if ((opts || {}).newlines !== false) keeps.push("\n");
    if ((opts || {}).spaces !== false) keeps.push(" ");
//    const specialchar_re = new RegExp(`[^\x20-${!spaces? "\\xb6\\xb8": ""}\x7e\r${!newlines? "\\n": ""}]`, "g"); //match non-printable chars but preserve (capture) ANSI color codes
    const specialchar_re = new RegExp(`${keeps.length? "(" + keeps.join("|") + ")|": ""}[^\x20-\x7e\r\n]`, "g"); //match non-printable chars but preserve (capture) ANSI color codes
//    let keep_cr = 0;
//console.log("sp char re", specialchar_re.source, srcline());
//console.log("inbuf", tostr(str).replace(/[^\x20-\x7e]/g, ch => "\\x" + ch.charCodeAt(0).toString(16).padStart(4, "0")));
    const retval = tostr(str)
//        .replace(/\r\s*$/, () => (++keep_cr, ""))
//        .replace(/\r/g, "\\r")
        .replace(/\r(?!\s*$)/g, "\\r") //esc \r but not at end of line
        .replace(/\t/g, "\\t")
//        .replace(/\n/g, "\\n".brightCyan) //TODO: pop color
//        .replace(/(\x1b\[([\d;]+)m)|[^\x20-\x7e\r\n]/g, (ch, keep) => keep || `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`) //preserve color codes + \r \n; esc all others
        .replace(specialchar_re, (ch, keep) => keep || `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`) //preserve color codes + \r \n; esc all others
        .replace(/\\u00/g, "\\x"); //abbreviate utf8
//console.log("outbuf", retval.replace(/[^\x20-\x7e]/g, ch => "\\x" + ch.charCodeAt(0).toString(16).padStart(4, "0")));
    return ((opts || {}).spaces !== false)? escsp(retval): retval;
}
//module.exports.escnp = escnp;


//esc whitespace:
//easier for whitespace debug
//separate from escnp to allow separate usage
my_exports({escsp});
function escsp(str)
{
    return tostr(str).replace(/ /g, "\xb7"); //non-printable space (shows as dot)
}
//module.exports.escsp = escsp;


//nested colors:
//propagate previous color after end of current color
//also spread first color to start of string (to cover uncolored prefix)
my_exports({color_nest});
function color_nest(str)
{
//    const retval = str
//        .replace(ANSI_re(), (cmd, color) => (color != EOCOLOR())?
//             (stack.push(cmd), cmd):
//             (stack.pop(), stack.at(-1) || cmd))
//        .replace(new RegExp(`^(.*?)(${ANSI_re().source})`, ""), (_, prefix, color) => color + prefix)
//        .replace(abc(?!.*abc)
//prefix broken    const prefixANSI_re = new RegExp(`(^.*?)?(${ANSI_re.source})`, "g"); ///(^.*?)?(\x1B\[([\d;]+)m)/g,
//    const prefixANSI_re = new RegExp(`(^[^\x1B]*|)(${ANSI_re().source})`, "g"); ///(^.*?)?(\x1B\[([\d;]+)m)/g,
    const aroundANSI_re = new RegExp(`(^[^\x1B]*|)(${ANSI_re().source})(|[^\x1B]*$)`, "g"); ///(^.*?)?(\x1B\[([\d;]+)m)/g,
    const stack = []; //, save = [];
    const deb = color_nest.want_debug || ""; //? str => str: str => "";
//console.log(prefixANSI_re.source);
//console.log("color_nest", escnp(str, {colors: false, newlines: false, spaces: false}));
//console.log("color nest", prefixANSI_re.source, str.replace(/[^\x20-\x7e]/g, ch => "\\x" + ch.charCodeAt(0).toString(16)));
    const retval = str
        .replace(aroundANSI_re, (_, prefix, cmd, color, suffix) => (color != EOCOLOR())?
            (stack.push(cmd), (deb && `PUSH[${stack.length} '${color}']`) + cmd + (prefix || "")): //start color < prefix
            (stack.at(-2) && stack.pop(), (deb && `POP[${stack.length} '${color}']`) + stack.at(-1) + (suffix? suffix + cmd: ""))); //pop color or end color > suffix
//console.log(prefANSI_re.source, srcline());
//console.log(JSON.stringify(str), srcline());
//console.log(JSON.stringify(retval), srcline());
//console.log("result", retval.replace(/[^\x20-\x7e]/g, ch => "\\x" + ch.charCodeAt(0).toString(16)));
    return retval;
}
//module.exports.color_nest = color_nest;
//const re = /(^[^\x1B]*|)(\x1B\[([\d;]+)m)/g;
//const str = "qw\x1b[93mTODO:  \x1b[39mfinish";
//console.log("repl", str.replace(re, (_, pref, keep, code) => `pref(${(pref || "NONE").replace(/\x1b/g, "ESC")}),keep(${(keep || "NONE").replace(/\x1b/g, "ESC")}),code(${(code || "NONE").replace(/\x1b/g, "ESC")})`)); process.exit();
                               

//return location called from:
//optional nesting goes higher in stack
//replace self with "me" for readability
my_exports({srcline});
function srcline(nested)
{
//    const srcline = `  @${Path.basename(caller.getFileName().replace(__filename, "me"))}:${caller.getLineNumber()}`;
//    const info = __stack.map(caller => ` @${Path.basename((caller.getFileName() || NOFILE).replace(srcline.me || __filename, "me"))}:${caller.getLineNumber()}`).map((srcline, inx) => (inx == 1)? srcline.brightCyan: srcline).join("");
    const callers = __stack; //getter has overhead; save in temp
//    const NOFILE = "noframe?"; //TODO: find out why
    const NOSTKFR = {getFileName: () => `??DEPTH${nested}??`, getLineNumber: () => -1};
    const level = !isdef(nested)? 0+1: //default = next level up
        (nested == Math.trunc(nested))? nested + 1: //caller-specified depth
        ((callers[Math.floor(nested)] || NOSTKFR).getFileName() == (callers[Math.ceil(nested)] || NOSTKFR).getFileName())? Math.ceil(nested) + 1: //caller optional 1 more level
        Math.floor(nested) + 1; //caller
//    const caller = __stack[nested_fixup] || NOFR;
//console.log(nested, level, callers.length);
    const retval = ` @${Path.basename((callers[level] || NOSTKFR).getFileName()/*.replace(srcline.me || __filename, "me")*/ || "?lambda?")}:${(callers[level] || NOSTKFR).getLineNumber()}`;
//    if (~retval.indexOf("@loader.js")) //TODO: fix this
//    return `  @${nested +1 || 1}` + __stack/*.slice(nested + 1 || 1)*/.map((frame, inx) => `[${inx}]${Path.basename((frame.getFileName() || NOFILE).replace(srcline.me || __filename, "me"))}:${frame.getLineNumber()}`).join(" -> "); //TODO: fix this
    return retval;
}
//module.exports.srcline = srcline;

//console.log("msgout eof", Object.keys(module.exports));
//eof