#!/usr/bin/env node
// YALP utils

'use strict'; //find bugs easier
require('colors').enabled = true; //for console output (all threads)
require("magic-globals"); //__file, __line, __stack, __func, etc
const fs = require("fs");
const glob = require("glob");
const Path = require("path");
const {sprintf} = require('sprintf-js'); //https://www.npmjs.com/package/sprintf-js
const assert = require('assert').strict; //https://nodejs.org/api/assert.html
//don't load until needed (circ dep): const {debug, debug_limit, srcline/*, isdef, commas, plural*/} = re_export(require("yalp21/incl/debug"));
//delay load until needed (circ dep and hoist):
//CAUTION: circular deps
//any exports used by msgout.js must be defined before including msgout
//module.exports.my_exports = my_exports;
//module.exports.elapsed = elapsed;
//module.exports.tostr = tostr;
//module.exports.truncate = truncate;
//module.exports.commas = commas;
//module.exports.isdef = isdef;
//const {jselapsed} = require("yalp21"); //"bindings")("gpuport"); //"../"); //npm link allows real module 
my_exports({my_exports, auto_obj, tostr, time2str, truncate, commas, isdef}); //circ dep: any exports used by msgout.js must be defined before including msgout
//console.log("utlis: loading msgout");
const {debug, debug_limit, debug_nested, fatal, srcline} = require("yalp21/incl/msgout");
const {jselapsed} = require("yalp21"); //"bindings")("gpuport"); //"../"); //npm link allows real module 
//console.log("utlis: loaded msgout", debug, srcline);
//debug.max_arg_len = 300;

//const lame = require('lame');
//const Speaker = require('speaker');
//const {PassThrough} = require('stream');
//const Sound = require('node-mpg123');

extensions();


////////////////////////////////////////////////////////////////////////////////
////
/// Helpers:
//

//export function or object:
//functions can be hoisted, objects/scalars can't
//NOTE: must use caller's module.exports: don't import/export this function
//NOTE: caller must wrap non-function things in "{}" so name comes in here; trick from https://stackoverflow.com/questions/3404057/determine-original-name-of-variable-after-its-passed-to-a-function
//"{}" also allows export(s) to be renamed
my_exports({my_exports});
//module.exports.my_exports = my_exports;
function my_exports(thing) //, rename)
{
//debugger;
    const caller =
    {
        frame: __stack[1], //expensive; just do this 1x
        get exports() { return require(this.frame.getFileName()); }, //CAUTION: must use caller's module.exports
        get where() { return shortpath(this.frame.getFileName()) + ":" + this.frame.getLineNumber(); },
    };
//if (typeof thing != "object") console.log("export non-obj", thing.name, caller.where);
//else console.log("exp name/vals", ...Object.entries(thing), caller.where);
    if (typeof thing != "object")
    {
        const name = thing.name || "export@" + caller.where;
        if (caller.exports[name] && caller.exports[name] != thing) fatal("dupl export: " + name, caller.where);
        return caller.exports[name] = thing;
    }
    for (const [name, val] of Object.entries(thing))
    {
        if (caller.exports[name] && caller.exports[name] != val) fatal("dupl export: " + name, caller.where);
        caller.exports[name] = val;
    }
//console.log("my exports", Object.keys(module.exports).map(key => truncate(key, 30)));
//console.log("caller exports", Object.keys(caller.exports).map(key => truncate(key, 30)));
    return thing; //allow inline usage
//    const use_name = rename ||
//        (typeof thing == "function")? thing.name: "" ||
//        "export" + srcline(+1).replace(/^ /, ""); //default name if unknown
//    if (!isdef(thing)) throw `export ${use_name} !found`.brightRed;
//    return caller_exports[use_name] = thing; //allow inline usage
}


//re-export imports:
//NOTE: must use caller's module.exports: don't import/export this function
my_exports({re_export});
function re_export(obj)
{
    const caller_exports = require(__stack[1].getFileName());
    Object.assign(caller_exports, obj);
    return obj; //allow inline usage
}


//const UINT32_MAX = -1 >>> 0; //(() => (new Uint32Array(1))[0] = -1)();
//my_exports(UINT32_MAX, "UINT32_MAX");
//debug(UINT32_MAX); debug("max %u", UINT32_MAX); process.exit();
my_exports({uint32});
function uint32(val) { return val >>> 0; }


//OCD/grammar police helper: :)
my_exports({plural});
function plural(n, multi, single)
{
    if (!isdef(n)) return plural.suffix;
    plural.suffix = (n != 1)? multi || "s": single || "";
    return n;
}
//module.exports.plural = plural;


//text msg out:
//TODO: color + formatting
my_exports({txtout});
function txtout(...args) { return console.log(...args); }


//display commas for readability (debug):
//NOTE: need to use string, otherwise JSON.stringify will remove commas again
my_exports({commas});
function commas(val)
{
//number.toLocaleString('en-US', {minimumFractionDigits: 2})
    return val.toLocaleString();
}
//module.exports.commas = commas;


//my_exports(TODO);
//function TODO(msg) { /*if (!TODO[msg]*/ ++debug.depth || (debug.depth = 1); return debug_limit(1, "TODO: ".brightYellow + msg); }


my_exports({sleep});
async function sleep(msec)
{
debug("sleep %'d msec", msec);
    return new Promise((resolve, reject) => setTimeout(resolve, msec)); //() => { resolve(); }, msec));
}


//add method to writable streams:
my_exports({writeln});
function writeln(...args)
{
    const retval = this.write(...args);
    this.write("\n");
    ++this.numwrites || (this.numwrites = 1);
    return retval;
}


my_exports({name2file});
function name2file(name)
{
    const name_fixup = name.replace(/\s+/g, "_");
//    /*try*/ { 
    const retval = Object.assign(fs.createWriteStream(name_fixup),
    {
        writeln, 
        filename: name_fixup, 
        started: elapsed(), 
        wait4close: async function() { await wait4close(this, name_fixup); debug(`wrote ${commas(plural(this.numwrites))} line${plural()} to '${this.filename}' after ${elapsed() - this.started} msec`); },
    });
    return retval;
//    }
//    catch (exc) { debout("exc:".brightRed, exc); }
}


//wait for file to close:
my_exports({wait4close});
async function wait4close(stream, name)
{
    return new Promise((resolve, reject) =>
    {
        stream
            .on("error", (err) => (console.error(`'${name}' error: ${err}`.brightRed), reject(err)))
            .on("close", () => (console.error(`'${name}' closed`.brightGreen), resolve()));
//            .on("finish", () => (console.error(`'${name}' finished`.brightGreen), resolve()));
    });
}


//write a csv file:
//assumes relative small
//TODO: async version for large or long-running data?
my_exports({rpt2csv});
function rpt2csv(filename, rptlines)
{
//    const csv = new name2file(shortname(__file) + "-layout.csv");
    fs.writeFileSync(filename, [Object.keys(rptlines[0])] //ins col hdings
        .concat(rptlines)
        .map(row => Object.values(row).map(col => `"${col}"`).join(","))
        .join("\n"));
    debug("%'d line%s written to '%s'", plural(rptlines.length + 1), plural(), filename);
}


//my_exports({mp3play});
function x_mp3play(filename, cb)
{
//put these in here so they won't be loaded unless needed:
    const lame = require('lame');
    const Speaker = require('speaker');
//    fs.createReadStream(file)
//      .pipe(new lame.Decoder)
//      .on('format', console.log)
//      .pipe(new Speaker);

//    new Sound('/path/to/the/file/filename.mp3').play();
    if (!filename) return; //caller just wanted preload/check?
    assert(fs.existsSync(filename), `'${filename}' !found`);
// with ability to pause/resume:
//    elapsed(0);
//    const music = new Sound(filename);
//    setTimeout(function () { music.pause(); }, 5000);
//    setTimeout(function () { music.resume(); }, 7000);
// you can also listen for various callbacks:
//    music
//    const pt = new Pas
//    const pt = new PassThrough()
//        .on("format", function(...args) { const [fmt] = args; debug("fmt", fmt); this.emit(...args); })
//        .on("data", function(...args) { const [data] = args; debug("data", data.length); this.emit(...args); })
//        .on('error', function (...args) { debug(`error @T+${commas(elapsed())} msec`.brightRed, ...args); this.emit(...args); })
//        .on('progress', function (...args) { debug(`progress at ${commas(elapsed())} msec`.brightGreen, ...args); })
//        .on('finish', function (...args) { console.log(`finish @T+${commas(elapsed())} msec`.brightGreen, ...args); this.emit(...args); })
//        .on('complete', function (...args) { console.log(`complete @T+${commas(elapsed())} msec`.brightGreen, ...args); this.emit(...args); });
//    let total = 0, bps = 0;
    const retval = fs.createReadStream(filename)
        .pipe(new lame.Decoder())
//        .pipe(new PassThrough() .on("format", (fmt) => debug("fmt", fmt))
        .on("data", progress)
        .on('format', function format(fmt)
        {
            this.bps = Math.round(fmt.sampleRate * fmt.channels * fmt.bitDepth / 8); //CD quality is 2 channel, 16-bit audio at 44,100 samples/second
            debug("fmt", fmt, "bps", commas(this.bps));
            if (cb) cb(); //allow caller to sync with audio
            /*await*/ progress.call(this, []); //generate evt at start of decoded data; TODO: hold up for caller?
            this.pipe(new Speaker(fmt));
        })
//        .on('progress', function (...args) { debug(`mp3 progress at ${commas(elapsed())} msec`.brightGreen, ...args); })
        .on('open', function (...args) { debug(`speaker opened @T+${commas(elapsed())} msec`.brightGreen, ...args); })
        .on('flush', function (...args) { debug(`speaker flushed @T+${commas(elapsed())} msec`.brightGreen, ...args); })
        .on('close', function (...args) { debug(`speaker closed @T+${commas(elapsed())} msec`.brightGreen, ...args); })
//        .on('finish', function (...args) { debug(`decode/enqueue finished after ${commas(elapsed())} msec, total data ${commas(this.datalen)} bytes`.brightGreen, ...args); })
//        .on('complete', function (...args) { debug(`decode/enqueue complete after ${commas(elapsed())} msec`.brightGreen, ...args); })
        .on('error', function (...args) { debug(`mp3 error after ${commas(elapsed())} msec`.brightRed, ...args); });
    return retval;

    function progress(data)
    {
        this.datalen = mp3play.datalen = (this.datalen || 0) + data.length;
        const timestamp = mp3play.timestamp = Math.floor(this.datalen * 1e3 / this.bps) / 1e3; //sec, cumulative decode
if (this.datalen && (++this.count || (this.count = 1)) % 25) return; //debug @~10 sec intervals
debug("mp3 decode", commas(this.datalen), "bytes,", timestamp, "sec"); //, "sec @T+${commas(elapsed())} msec`.brightGreen"); //}) //if (!datalen) audio_started = ctlr.elapsed; }) ///*ctlr.elapsed = MP3_CBLATENCY;*/ debug("pb set frnum to", ctlr.frnum = 
//debug("data len", commas(data.length), "timestamp", timestamp);
//        this.emit("progress", {datalen: this.datalen, timestamp});
    }
}


//simplify time compares:
my_exports({hhmm});
function hhmm(date)
{
    const now = date || new Date(); //Date.now();
    return now.getHours() * 100 + now.getMinutes();
}


//check for array:
my_exports({isary});
function isary(thing)
{
    return Array.isArray(thing);
}


//check for undef
//this is safer than "|| defval" for falsey values
//optional alt vals
//reduces verbosity/typos
my_exports({isdef});
function isdef(val, ...altvals) //tval, fval)
{
//    return (typeof val != "undefined")?
//        ((typeof tval != "undefined")? tval: true): //val || tval || true: //NO-caller should do this: ensure caller sees non-false value
//        ((typeof fval != "undefined")? fval: false);
//        (altvals.length? altvals[0]: true):
//        (altvals.length? altvals[1]: false);
    const retval = (typeof val != "undefined");
    return altvals.length? altvals[+!retval]: retval;
}
//module.exports.isdef = isdef;
//const bool1 = true, bool2 = false, ary = ["no", "yes"]; debug(+bool1, +bool2, ary[+bool1], ary[+bool2]); process.exit();


//generate list of ints:
my_exports({intlist});
function intlist(n)
{
    return Object.keys(Array.from({length: n}));
}


//CAUTION: shift appears to be mod 32; shift 35 == shift 3
//CAUTION: use ">>>" here to force uint32 result
function bits(from, to)
{
    return !isdef(to)? (((from < 32)? 0xffffffff: 0) >>> from) & ~(((to < 32)? 0xffffffff: 0) >>> to): //bit range
        ((from < 32)? 0x80000000: 0) >>> from; //single bit
}
//debug(`bits from ${from} = 0x%x`, 0xffffffff >>> from)[1]; }
//debug("0x%x, 0x%x, 0x%x, 0x%x, 0x%x, 0x%x, 0x%x", bits(0), bits(0, 4), bits(8, 16), bits(35), bits(10, 35), bits(32), bits(0, 32)); process.exit();


//convert to uint32:
//NOTE: operands to bit-wise operators *must* be uint32 in order to give correct result
my_exports({uint32});
function uint32(n) { return n >>> 0; }


//mix 2 values:
//mix:
// = 0 => 100% "from" value
// = 1 => 100% "to" value
function tween(mix, from, to)
{
//    return Array.isArray(from)? from.map((val, inx) => mix * val + (1 - mix) * to[inx]):
    if (typeof from != "object") return (1 - mix) * from + mix * to; //scalar
    assert(typeof to == "object");
//        const from_ents = Object.entries(from), to_ents = Object.entries(to);
//        assert(from_ents.length == to_ents.length);
    const retval = {};
    for (const [key, val] of Object.entries(from)) retval[key] = (1 - mix) * val + mix * to[key];
    return retval;        
}

//create ary from scalar val:
//allow ary element to be undef
function toary(val) { return /*toary.ary =*/ (/*isdef(val) &&*/ !Array.isArray(val))? [val]: val; }


//find file(s):
//optional check min/max matches
//use glob, but traverse container folders (recursively) if not found
my_exports({find_files});
function find_files(path, count)
{
    const glob = require('glob'); //in here so it won't be loaded unless needed
//debug(path, count, path.match(/^~/));
    const [min, max] = Array.isArray(count)? count: [count, count]; //isdef(count)? [count, count]: ["", ""];
//    const [min, max] = Array.isArray(count)? count: isdef(count)? [count, count]: ["", ""];
//    const [min_desc, max_desc] = [isNaN(min)? "(no min)": min, isNaN(max)? "(no max)": max];
//    const path_fixup = path
//        .replace(/^\~/, process.env.HOME)
//        .replace(/^[^\/]/, __dir
//    const tree = __dirname.split("/");
    
    const caller = __stack[1].getFileName(); //Path.dirname(__stack[1].getFileName());
//debug(srcline(+1));
//debug(__stack);
//debug(module.parent.path);
//debug("find files '%s', caller '%s'", path, caller);
    for (const tree = Path.resolve(Path.dirname(caller), path).split(Path.sep); /*tree.length > 0*/; tree.splice(-2, 1))
    {
//debug("find: caller '%s', tree %s", caller, tree.join("/")); 
//        const filename = Path.join(__dirname, /*"**",*/ "!(*-bk).vix");
        const next = tree.join(Path.sep);
        const retval = glob.sync(next) || [];
//debug("looking in '%s', found %'d, wanted %'d..%'d", next, retval.length, min, max);
        if (!retval.length && tree.length > 1) continue; //try parent
//    debug(`'%s' matches ${commas(plural(retval.length))} file${plural()}: ${retval.map((retpath) => shortpath(retpath)).join(", ")}, ${min_desc}${(max != min)? `...${max_desc}`: ""} expected`, path_fixup, retval.length);
        if (isdef(count)) assert((retval.length >= min) && (retval.length <= max), `path '${path}' matches ${plural(retval.length)} file$(plural()), expected ${min}..${max} match${plural(max, "es"), plural()}`);
        return find_files.files = retval; //results cached
    }
}


my_exports({time2str});
function time2str(time, want_day)
{
    const when = time || new Date();
    return (want_day? `${when.getMonth() + 1}/${nn(when.getDate())}/${nn(when.getFullYear())} `: "") + `${when.getHours()}:${nn(when.getMinutes())}:${nn(when.getSeconds())}.${nn(when.getMilliseconds(), 3)}`;
}


//short file name:
my_exports({shortpath});
function shortpath(filepath, want_ext)
{
//    for (;;)
//    {
//        const retval = Path.basename(filename, Path.extname(filename));
//        if (retval != "index") return retval.replace(process.env.HOME, "~");
//        filename = Path.dirname(filename); //use parent folder name; basename was not descriptive enough
//    }
    return want_ext? Path.basename(filepath): Path.basename(filepath, Path.extname(filepath));
}


//conv to str:
//use if arg might be null or undefined
my_exports({tostr});
function tostr(thing, radix)
{
    return ((thing === null) || (typeof thing == "undefined"))? thing + "":
        ((typeof thing == "Date") || (typeof thing == "string"))? thing.toLocaleString(): //CAUTION: .toLocaleString is defined for Object as well; can't use duck typing
        (typeof thing == "object")? JSON.stringify(thing):
        ((typeof thing == "number") && (typeof radix != "undefined"))? thing.toString(radix):
        thing.toString();
}
//module.exports.tostr = tostr;


my_exports({truncate});
function truncate(val, len)
{
    return val
        .toString()
        .replace(new RegExp(`(?<=[^]{${len || 30},}\\b)[^]*$`), " ...");
}
//module.exports.truncate = truncate;


//clean up JSON before parsing:
my_exports({json_clup});
function json_clup(str)
{
    const retval = str.toString()
        .replace(/\/\/[^\n]*/g, "") //strip single-line comments
        .replace(/\/\*[^]*?\*\//g, " ") //strip multi-line comments, use a space to split tokens
//        .replace(/\n/g, " ")
        .replace(/,\s*(?=[\}\]])/g, "") //drop trailing commas
        .replace(/[a-z0-9_]+\s*(?=:)/gi, '"$&"') //put quotes around prop names
        .replace(/(?<=[:\[,]\s*)\/.*?\/[gismx]*(?=\s*[,}\]])/g, '"$&"'); //put quotes around regex
//debug.max_arg_len = 600;
//debug(retval);
    return retval;
//const cfg = JSON.parse(fs.readFileSync("./config/yalp.json").toString(), revive);
//const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
}


my_exports({revive_re});
function revive_re(key, value)
{
    if (typeof value == "string")
    {
        const re_parts = value.match(/^\/(.*?)\/([gmsix]?)$/);
        if (re_parts) return new RegExp(re_parts[1], re_parts[2]);
    }
//    console.log(key, value);
//    return 0;
    return value;
}


my_exports({nn});
function nn(val, n)
{
    const [nint, ndec] = n? [Math.trunc(n), (10 * n) % 10]: [2, 0];
//    return val.toString().padStart(n || 2, "0");
//    const parts = val.toString().split(".");
//    const retval = Math.trunc(n).padStart(nint, "0");
//    return val.toFixed(ndec)
//    return (parts.length < 2)? parts[0].padStart(nint, "0"):
//        + "." + dec.padEnd(ndec, );
    return sprintf(`%0${nint}.${ndec}f`, val);
}


my_exports({hex});
function hex(val, prefix)
{
    return ((prefix === false)? "": (prefix === true)? "0x": prefix || "0x") + tostr(val >>> 0, 16);
}
//module.exports.hex = hex;


//check if obj is regex:
my_exports({isRE});
function isRE(obj) { return (obj instanceof RegExp); }



//delay:
//blocks asynchronously only
my_exports({sleep});
async function sleep(msec)
{
debug("sleep %'d msec", msec);
    return new Promise((resolve) => setTimeout(resolve, msec));
}


//duplicate first array entry at end:
//useful for iterating over arrays that require 2 values
//function dupfirst(ary) { const retval = toary(ary); retval.push(retval[0]); return retval; }

//limit value to a range:
//just use Uint8ClampedArray
//function clamp(val, mix, max) { return Math.min(Math.max(val, isdef(min, min, 0)), isdef(max, max, 0xFF)); }

//ary filter to remove dups:
function dedup(val, inx, all) { return all.indexOf(val) == inx; }


//allow "throw" to be used within expr:
my_exports({throwx});
function throwx(msg)
{
    throw `${msg} ${srcline(+1)}`.brightRed;
}


//return a lookup object that complains about undef entries:
my_exports({strict_obj});
function strict_obj(obj, cb) //, allow_inh)
{
    return new Proxy(obj || {},
    {
//don't use assert(); SLOW!        get: function(target, propname, rcvr) { assert(/*allow_inh? propname in target:*/ target.hasOwnProperty(propname), `missing property '${propname}'`.brightRed); return target[propname]; }, //Reflect.get(...arguments); },
        get: function(target, propname, rcvr)
        {
//console.log("get", propname);
            if (!target.hasOwnProperty(propname) && propname != "toJSON") throw `missing property '${propname}'`.brightRed;
            return target[propname]; //Reflect.get(...arguments); },
        },
        [cb? 'set': 'ignore']: function(target, propname, newval, rcvr)
        {
            const enumerable = true;
            const vis = (Object.getOwnPropertyDescriptor(target, propname) || {enumerable}).enumerable;
//console.log("set", propname, newval, "vis?", vis);
            target[propname] = vis? cb(newval): newval; //give caller a change to override/throw
            return true; //success
        },
    });
}


//lookup object that auto-creates new entries:
my_exports({auto_obj});
function auto_obj(obj, new_element)
{
    return new Proxy(obj || {},
    {
        get: function(target, propname, rcvr)
        {
            if (!target.hasOwnProperty(propname) && (propname != "toJSON"))
                switch (typeof new_element)
                {
                    case "object": return target[propname] = JSON.parse(JSON.stringify(new_element)); //clone array or object
                    case "undefined": return target[propname] = {};
                    default: return target[propname] = new_element;
                }
            return target[propname]; //Reflect.get(...arguments);
        },
    });
}


my_exports({typename});
//try to make type names consistent:
function typename(obj)
{
    return obj.name || obj.constructor.name || Array.isArray(obj)? "array": (obj instanceof Date)? "date": typeof obj;
}


//msec clock:
//track elapsed time:
//useful for perf tuning (crude), or checking schedule run length
//my_exports({elapsed: jselapsed}); //use addon epoch
//const {debug_nested} = require("yalp21/incl/msgout"); //CAUTION: circular deps
//NOTE: started == 0 is not a valid time, so treat 0 as (none)
my_exports({elapsed: jselapsed});
function disabled()
{
my_exports({elapsed});
//const {debug_nested} = require("yalp21/incl/msgout"); //CAUTION: circular deps
//NOTE: started == 0 is not a valid time, so treat 0 as (none)
function elapsed(started) //reset)
{
//    const now = Date.now();
//    if (isdef(reset) || !isdef(elapsed.started))
//    {
//        if (isdef(elapsed.started)) debug_nested(+1, "elapsed reset: %'d -> %'d msec", elapsed(), reset);
//        elapsed.started = now - reset;
//    }
////    return (Date.now() - ((typeof reset != "undefined")? elapsed.started) / 1e3; //msec -> sec
//    return now - elapsed.started;
    return /*isdef*/(started)? Date.now() - started: //caller has own base time
        /*isdef*/(elapsed.started)? Date.now() - elapsed.started: //use my (global) time base
        (elapsed.started = Date.now(), 0); //init my base time
}
elapsed(); //init to module load time; caller can reset if wanted
my_exports({elapsed});
function elapsed(reset)
{
    return (isdef(reset) || !elapsed.started)?
        (elapsed.started = Date.now() - (reset || 0), reset || 0):
        Date.now() - elapsed.started;
//        elapsed.started? Date.now() - elapsed.started:
//        (elapsed.started = Date.now(), 0);
}
elapsed(); //set initial clock; caller can reset


}


//show %:
//function percent(val)
//{
//    return round(100 * val, 10); //+ "%";
//}


//round to specified #decimal places:
//function round(val, digits)
//{
//    return Math.floor(val * (digits || 1) + 0.5) / (digits || 1); //round to desired precision
//}


//prototype extensions:
function extensions()
{
    if (extensions.done) return;
    let numadd = 0, numskip = 0;
    addprop(RegExp.prototype, { toJSON: { value: RegExp.prototype.toString, }, }); //work-around from https://stackoverflow.com/questions/12075927/serialization-of-regexp
    addprop(Array.prototype,
    {
        top: { get() { return this[this.length - 1]; }, }, //NOTE: undef when array is empty
        push_fluent: { value: function(...args) { this.push(...args); return this; }, },
//        pop_fluent: { value: function(...args) { this.pop(...args); return this; }, },
    });
    addprop(String.prototype,
    {
        replace_if: { value: function(want_repl, from, to) { return want_repl? this.replace(from, to): this; }, }, //conditional replace; in-line "if" reduces verbosity
    });
    debug("%d of %d extension%s installed", numadd, plural(numadd + numskip), plural());
    extensions.done = true;

    function addprop(proto, props) //Object_defineProperties
    {
        for (const [name, info] of Object.entries(props))
            if (proto.hasOwnProperty(name)) ++numskip; //assume it does the same thing
            else { ++numadd; Object.defineProperty(proto, name, info); }
    }
}

//console.log("utils eof", Object.keys(module.exports));
//eof