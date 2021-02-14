#!/usr/bin/env node
//YALP main/template code
//history:
//1/1/21  0.21.1  DJ  architecture reworked for easier multi-threading and more open/distributed processes
//1/18/21  0.21.1  DJ  add example seq, fx; add model palette for more efficient color manipulation??

//Node.js profiling:
//https://nodejs.org/en/docs/guides/simple-profiling/

'use strict'; //find bugs easier
require("magic-globals"); //__file, __line, __stack, __func, etc
require('colors').enabled = true; //for console output (all threads)
//const assert = require('assert').strict; //https://nodejs.org/api/assert.html
const Path = require("path");

//const fx = require("./fx");
//const models = require("./models");
//const layout = require("./layout");
//const {isdef, elapsed, srcline} = require("gpuport");
const {debug, log, srcline} = require("yalp21/incl/debug");
//const {TODO} = require("yalp21/incl/utils");
srcline.me = Path.basename(__file); //kludge: show "me" in debug msgs
const {YALP, isRPi} = require("yalp21");
[YALP, debug, log].forEach((exp) => my_exports(exp));

const OPTS =
{
    fbdev: isRPi? 1: 0,
    timing: "320 0 0 1 0  240 0 3 3 3  0 0 0  30 0 2400000 1", //simulate/override dpi_timings from RPi config.txt
};


elapsed();
const yalp = new YALP(OPTS);
my_exports(yalp); //allow access by custom code
log("yalp: univ {# %d, len %'d of %'d max}, frame {intv %'d usec, fps %3.1f}, bkg running? %d, parent? %d".brightCyan, yalp.NUM_UNIV, yalp.UNIV_LEN, yalp.UNIV_MAXLEN, yalp.frtime, 1e6 / yalp.frtime, yalp.bkgpid, +!!module.parent);
//log("yalp init".brightGreen);
//process.exit();


///////////////////////////////////////////////////////////////////////////////
////
/// scheduler
//

//regular daily schedule:
//const [START, STOP, POLL] = [1645, 2145, 60e3];
const [START, STOP, POLL] = [2200-400, 2400, 5e3];

const playlist =
{
    xfirst: /intro/i, //plays 1x only
    xloop:
    [
        /hippo/i,
        /love came down/i,
        /decorations/i,
        /capital C/i,
    ],
    xlast: /closing/i, //plays 1x only
    first: /tests\/xmas2020/i,
};


//1-shot scheduler:
//waits until *next* show is scheduled to start
//plays intro, then loops playlist until scheduled stop
//plays closing then exits; ext proc mgr can restart it for next day
//daily restart allows file changes to be pulled in automatically
my_exports(scheduler); //allow reuse by custom code
/*await*/ async function scheduler()
{
    log("scheduler: startup".brightGreen);
    while (!active()) await sleep_msec(POLL); //check < sleep is better for emergency restarts
//??    player.bkg = yalp.uloop(OPTS); //start frbuf pivot+update process if not already running
    if (playlist.first) await player(playlist.first);
    if (playlist.loop) for (let i = 0; active(); ++i) await player(playlist.loop[i % playlist.loop.length]);
    if (playlist.last) await player(playlist.last);
    log("scheduler: exit".brightRed); //restart each day for safety (also allows file updates)
} //)();
//if (!module.parent) run(isMainThread? main_seq: wker); 
if (!module.parent) run(scheduler); //allow inline init and I/O to finish first (avoids hoist problems)


//check whether to run sequences:
my_exports(active);
function active()
{
    const now = hhmm();
    const retval = (START <= now) && (now < STOP);
    log("active check: start %d <= now %d < stop %d = active? %d", START, hhmm(), STOP, +retval);
    return retval;
}


//request or cancel run after current I/O completes:
//inline debug/unit test can cancel scheduler
my_exports(run);
function run(main)
{
    if (run.what) clearImmediate(run.what); //cancel previous
    run.what = main && !run.hasOwnProperty("what") && setImmediate(main); //allow inline init and I/O to finish first, but only if not already decided
//    else run.what = null; //Object.defineProperty(run, "what", {value: null}); //kludge: prevent other calls
}


///////////////////////////////////////////////////////////////////////////////
////
/// player
//

const DEVTEST = __filename; //false; //override seq files


//start seq playback:
//short-form/partial seq names can be used as long as unambiguous
//initiates seq + mp3 playback
//mp3 timing is used as playback time ref since it's rigid
my_exports(player); //allow reuse by custom code
async function player(seqname)
{
//    try //the show must go on :P
    {
        const seqfiles = (find_files("./seq/**/*seq*.js") || []) //TODO: cache? (assume folder tree won't change today)
//            .map((filepath, inx, all) => (debug("file[%'d/%'d] '%s': check name against %s", inx, all.length, filepath, seqname.source || seqname), filepath))
            .filter(filepath => isRE(seqname)? filepath.match(seqname): ~filepath.indexOf(seqname)) //choose file within nested folders
//            .map((filepath, inx, all) => (debug("match[%'d/%'d] '%s': try to load seq() entpt", inx, all.length, filepath), filepath))
            .map(filepath => ({exports: require(DEVTEST || filepath), filepath})) //load seq exports
            .filter(({exports}) => typeof exports.seq == "function") //check for seq() function
            .map(({exports, filepath}) => ({exports, filepath, name: Path.basename(filepath, Path.extname(filepath)), audio: exports.audio}));
//debug.max_arg_len = 500;
debug("matches", seqfiles.map(({name}) => name));
        if (seqfiles.length != 1)
        {
            log("seq '%s' %s (%'d matches): %s".brightRed, seqname.source || seqname, !seqfiles.length? "!found".brightRed: "ambiguous".brightYellow, seqfiles.length, seqfiles.map(({name}) => name).join(", ") || "(none)");
            return await sleep_msec(5e3); //minimum wait to reduce log diarrhea
        }
        const {name, exports: {seq, audiopath, duration}, filepath} = seqfiles[0];
debug("loading seq '%s' , exports %s ...".brightCyan, name, Object.keys(exports).join(", "));
//        log("start seq[%'d vs %d] '%s', audio '%s'".brightCyan, yalp.seqnum, newseqnum, seqpath[0], seq.audiopath);
//debug("seq ent pts", Object.keys(seq));
//    const bkg = 
//    if (!yalp.open(OPTS)) //open FB if not already open
//    {
//        log("failed to open FB".brightRed);
//        return await sleep_msec(5e3); //minimum wait to reduce log diarrhea
//    }
//    const seqdata = /*workerize*/(seqfiles[0].entpt()); //delegate seq to use wkers if needed
        yalp.seqname = name || filepath; //seqfiles[0].name; // || seqfiles[0].name; //Path.basename(seqpath[0], Path.extname(seqpath[0])); //seqname;
        const newseqnum = yalp.recycle(); //cancel prev playback; resets frbuf timestamps + invalidates cache
//        yalp.start();
//        yalp.timestamp = -10e3; //allows for pre-playback init
//        elapsed(0);
        const tscheck = setInterval(() => debug("render time %'d, mp3 time %'d, delta %'d msec", yalp.timestamp, mp3play.timestamp, yalp.timestamp - mp3play.timestamp), 5e3);
TODO("add re-sync logic if seq drifts too far from mp3 timestamp?");
//NOTE: this gives seq() ~0.4 sec lead time for setup + pre-render; if !enough, add delay here
//        const numfr = await new Promise((resolve, reject) =>
        const results = await Promise.all([seq(), mp3play(audiopath, () => yalp.updloop())]); //start sequence pre-render, music decode; trigger bkg frbuf pivot+update process when audio starts
        clearInterval(tscheck);
//        yalp.stop();
//        if (seq.audio) mp3play(seq.audio, () => yalp.timestamp = 0); //sync audio to frbuf
//        else yalp.timestamp = 0; //no audio; start seq playback immediately
//    for (let prev = {frnum: 0, seqnum: yalp.seqnum, time: 0}, next = {}; prev.seqnum == yalp.seqnum && prev.frnum < numfr; prev = next)
//    {
//        render(prev.frnum);
//        output(prev.frnum);
//if (!(prev.frnum % 100)) debug("render+output fr# %'d/%'d msec, wait next, mp3 %'d sec", prev.frnum, prev.time);
//        const {seqnum, time} = await this.wait4frame(prev.time);
//        next.frnum = msec2frinx(next.time); //adaptive: repeats or skips frames to align seq with ctlr
//    }
//        , mp3play.timestamp || 0);
        log("seq/audio completed after %'d msec, expected %'d msec".brightGreen, elapsed(), duration || -1);
    } //catch (exc) { log("playback error: %s".brightRed, exc); }
    yalp.cancel();
}


//put status info where other funcs can see it:
const MP3LAG = -420; //msec; speaker seems to have ~0.4 sec buf
Object.defineProperty(mp3play, "timestamp", {get: function() { return Math.trunc(this.datalen * 1e3 / this.bps) + MP3LAG; }}); //sec


//mp3 file playback:
my_exports(mp3play); //allow reuse by custom code
async function mp3play(filepath, cb)
{
//    mp3play.started = Date.now();
//    mp3play.timestamp = MP3LAG -1e3; //pre-start
//    if (!isdef(mp3play.timestamp)) Object.defineProperty(mp3play, "timestamp", {get: function() { return Math.trunc(this.datalen * 1e3 / this.bps) / 1e3 + MP3LAG; }); //sec; put status info where other funcs can see it
    mp3play.datalen = 0;
    if (!filepath) { /*await sleep_msec(1e3);*/ return (cb || nop)(); } //no audio, but notify caller
//    assert(fs.existsSync(filename), `'${filename}' !found`);
    if (!fs.existsSync(filepath))
    {
        log("audio '%s' not found".brightRed, filepath);
        await sleep_msec(1e3); //give a little time before cb
        return (cb || nop)();
    }

//put these in here so they won't be loaded unless needed:
    const lame = require('lame');
    const Speaker = require('speaker');
//    fs.createReadStream(file)
//      .pipe(new lame.Decoder)
//      .on('format', console.log)
//      .pipe(new Speaker);
//    new Sound('/path/to/the/file/filename.mp3').play();
//    mp3play.timestamp = 0;
    const retval = fs.createReadStream(filepath)
        .pipe(new lame.Decoder())
//        .pipe(new PassThrough() .on("format", (fmt) => debug("fmt", fmt))
        .on("data", function(data)
        {
            const that = mp3play; //this; //put status info where other functions can see it
            /*mp3play.datalen =*/ that.datalen = (that.datalen || 0) + data.length;
//            /*const timestamp =*/ mp3play.timestamp = Math.trunc(this.datalen * 1e3 / this.bps) / 1e3; //sec, cumulative decode time (excl speaker lag)
if ((++this.count || (this.count = 1)) % 25) return; //debug/progress @~10 sec intervals
debug("mp3 decode %'d bytes, timestamp %4.3 sec", that.datalen, that.timestamp);
        })
        .on('format', function(fmt)
        {
            const that = mp3play; //this; //put status info where other functions can see it
            that.bps = Math.round(fmt.sampleRate * fmt.channels * fmt.bitDepth / 8); //CD quality is 2 channel, 16-bit audio at 44,100 samples/second
//            Object.defineProperty(that, "timestamp", {get: function() { return Math.trunc(this.datalen * 1e3 / this.bps) / 1e3 + MP3LAG; }, writable: true}); //sec
            debug("mp3 fmt %d, bps %'d, starting speaker", fmt, that.bps);
            /*mp3play.datalen =*/ that.datalen = 0;
//            mp3play.timestamp = 0;
//            /*await*/ progress.call(this, []); //generate evt at start of decoded data; TODO: hold up for caller?
            const spkr = new Speaker(fmt)
                .on('open', function (...args) { debug("speaker opened".brightGreen, ...args, elapsed()); })
                .on('flush', function (...args) { debug("speaker flushed".brightGreen, ...args, elapsed()); })
                .on('close', function (...args) { debug("speaker closed".brightGreen, ...args, elapsed()); })
                .on('error', function (...args) { log("speaker error".brightRed, ...args, elapsed()); });
            this.pipe(spkr); //new Speaker(fmt));
            (cb || nop)();
        })
//        .on('progress', function (...args) { debug(`mp3 progress at ${commas(elapsed())} msec`.brightGreen, ...args); })
//        .on('finish', function (...args) { debug(`decode/enqueue finished after ${commas(elapsed())} msec, total data ${commas(this.datalen)} bytes`.brightGreen, ...args); })
//        .on('complete', function (...args) { debug(`decode/enqueue complete after ${commas(elapsed())} msec`.brightGreen, ...args); })
        .on('error', function (...args) { log("mp3 error".brightRed, ...args, elapsed()); });
    return retval;
}
    
    
//find file(s):
//optional check min/max matches
//traverse ancestors recursively
my_exports(find_files); //allow reuse by custom code
function find_files(path, count)
{
    const glob = require('glob'); //in here so it won't be loaded unless needed
    const [min, max] = Array.isArray(count)? count: [count, count]; //isdef(count)? [count, count]: ["", ""];
//    const [min_desc, max_desc] = [isNaN(min)? "(no min)": min, isNaN(max)? "(no max)": max];
//    const path_fixup = path
//        .replace(/^\~/, process.env.HOME)
//        .replace(/^[^\/]/, __dir
//    const tree = __dirname.split("/");
    
    const caller = __stack[1].getFileName(); //Path.dirname(__stack[1].getFileName());
    for (const tree = Path.resolve(Path.dirname(caller), path).split(Path.sep); /*tree.length > 0*/; tree.splice(-2, 1))
    {
//debug("find: caller '%s', tree %s", caller, tree.join("/")); 
//        const filename = Path.join(__dirname, /*"**",*/ "!(*-bk).vix");
        const next = tree.join(Path.sep);
        const retval = glob.sync(next) || [];
//debug("looking in '%s', found %'d, wanted %'d..%'d", next, retval.length, min, max);
        if (!retval.length && tree.length > 1) continue; //try parent
//    debug(`'%s' matches ${commas(plural(retval.length))} file${plural()}: ${retval.map((retpath) => shortname(retpath)).join(", ")}, ${min_desc}${(max != min)? `...${max_desc}`: ""} expected`, path_fixup, retval.length);
        if (isdef(count)) assert(retval.length >= min && retval.length <= max, `path '${path}' found: ${retval.length}, expected: ${min}..${max}`);
        return find_files.files = retval; //results cached
    }
}


//dummy callback:
function nop(val) { return val; }


///////////////////////////////////////////////////////////////////////////////
////
/// (example) seq, model, fx
//

//spread workload across multiple cores:
const workerize = require("node-inline-worker"); //https://www.npmjs.org/package/node-inline-worker

//const ic = new model({w: 151, h: 10, port: [R0, R1], });
//model({name: "nullpx-globe", w: 1, port: B0, });
//const globes = Array.from({length: 4}).map((_, inx) => new model({name: `gl${inx + 1}`, w: 6*3, h: 1+12+1, port: B0});
//const tree = new model({name: "tree", w: 2*12, h: 33, port: B2});
const devpanel = new model({name: "devpanel", w: 32, h: 8, port: 0});
//etc.


//fade from color/image/current to color/image:
async function fx_fade(opts)
{
    const {model, /*from, to,*/ start, duration, fps} = opts;
//    assert(isdef(DURATION) && isdef(FPS) && isdef(colors));
    const from = isary(opts.from)? opts.from.slice(): //from image
                isdef(opts.from)? new Uint32Array(model.nodes1D.length).fill(opts.from >>> 0): //from color
                model.nodes1D.slice(); //from current
    const to = isary(opts.to)? opts.to.slice(): //to image
                new Uint32Array(model.nodes1D.length).fill(opts.to >>> 0); //to color
    const steplen = duration / (fps - 1); //, num_steps = Math.ceil(DURATION / steplen); //msec
//    const colors = toary(opts.color); //|| [BLACK, WHITE_dim]);
//    const DIM = .5; //TODO
    const seqnum = yalp.seqnum;
debug("fade start: model '%s', duration %'d, steplen %'d", model.name, duration, steplen);
    for (let time = start; time < start + duration; time += steplen)
    {
        const frbuf = await await4frame(seqnum, time);
        if (!frbuf) return; //seq completed or cancelled
        if (frbuf.time > start + duration) return; //eofx
debug("fx_fade: wanted time %'d, got time %'d, mp3 time %d, mix %2.1f", time, frbuf.time, mp3play.timestamp, (time - start) / duration);
        time = frbuf.time; //adaptive
        for (let n = 0; n < model.nodes1D.length; ++n)
            model.nodes1D[n] = mix((time - start) / duration, from[n], to[n]);
        model.out(frbuf, true); //model.dirty = true;
    }
}


//example seq:
//seq is just a (sorted) list of evts
const evts =
[
    {start: 1e3, duration: 2e3, fx: fx_fade, model: devpanel, fps: 1e3/20, to: 0xFF000000},
    {start: 5e3, duration: 3e3, fx: fx_fade, model: devpanel, fps: 1/2, to: 0xFFff00ff},
];
my_exports(seq, "seq"); //allow use by player
async function seq(evts)
{
//    const {/*start, duration,*/ evts} = opts;
//    assert(isdef(DURATION) && isdef(FPS) && isdef(colors));
//    const colors = toary(opts.color); //|| [BLACK, WHITE_dim]);
//    const DIM = .5; //TODO
    const my_fx = [];
    const seqnum = yalp.seqnum;
//    for (let i = 0, frbuf = null; i < evts.length; ++i)
    let frbuf;
    for (const evt of evts)
//    for (const evt in evts)
//    for (let time = evts[0].start; time < evts.top.start + evts.top.duration; time += steplen)
    {
        if (!frbuf) frbuf = await await4frame(seqnum, evt.start);
        if (!frbuf) break; //seq completed or cancelled
        if (frbuf.time > evt.start + evt.duration) break; //eofx
        my_fx.push(evt.fx.apply(null, evt)); //start next async fx
    }
    debug("waiting for %'d evts to finish", my_fx.length);
    await Promise.all(my_fx);
    debug("%'d evts finished", my_fx.length);
}


/*
//example seq renderer:
//can (should) be run as separate worker thread
my_exports(test_seq, "seq"); //allow use by player
async function test_seq(opts)
{
//    wait4frame.frbuf = null; //clear old (in case code reused)
    const prev = {};
    const [INTV, NUMFR] = [1e3 / 30, 30 * 5]; //frame interval, #frames in sequence
debug("seq start".brightGreen);
//    for (let fr = 0; fr < NUMFR; fr = next)
//    for (let time = 0; time < DUR; time = next)
//    for (let prev = {fr: 0, time: 0}, next; prev.fr < NUMFR; prev = next)
//    for (let time = 0; (await await4frame(time)) < DUR; time = 
//    for (const frbuf of await wait4frame())
TODO("workerize into groups of models");
    for (;;)
    {
        const frbuf = await await4frame(prev);
        if (!frbuf) break; //complete or cancelled
//can use fr# or timestamp for rendering; fr# shown here (requires more arith but is simpler to control):
        const frnum = Math.trunc(frbuf.timestamp / INTV); //adaptive: repeats or skips frames to match ctlr
if (!(frnum % 100)) debug("render+output fr# %'d/%'d msec, wait next, mp3 %'d sec", frnum, frbuf.timestamp, mp3play.timestamp);
        if (frnum >= NUMFR) break; //eof
//or      if (frbuf.timestamp >= DUR) break; //eof
        render(frnum, frbuf);
    }
debug("seq finish".brightGreen);
}
*/


//aysync function pxscan(
const {RGBdim1, hsv2RGB} = require("yalp21/incl/colors");
//const models = [0, 0];
const models = yalp.frbufs[0].ports
//dumb models:
    .map((port, inx) =>
    ({
        portnum: inx, //{portnum: inx, }, //dirtlen: 0},
        nodes1D: Array.from({length: 1080}).map(_ => 0xFF000000), //port.wsnodes, 
        fill: function(color)
        {
            for (let i = 0; i < this.nodes1D.length; ++i)
                this.nodes1D[i] = color;
            this.dirty = true;
        },
        out: function(frbuf, force)
        {
            if (!this.dirty && !force) return;
            const port = frbuf.ports[this.portnum];
            for (let i = 0; i < this.nodes1D.length; ++i)
                port.wsnodes[i + this.firstpx] = this.nodes1D[i];
            port.dirtylen = Math.max(port.dirtylen, this.firstpx + this.nodes1D.length);
        },
    }));
//const fx = [() => {}];


//example render function:
//only needs to be async if using workerize/wker threads
//should dedup fr draw req in case ctlr is not in sync with seq fr rate
async function render(frnum, frbuf)
{
    if (frnum <= render.prevfr) return; //no need to repeat (mult timestamp could map to same fr# if intv != ctlr)
    render.prevfr = frnum; //keep track of work done so far
//    if (render.frnum <= this.outputed) return;
//    for (const globe of globes) globe.out();
//    for (const icseg of ic.segments) icseg.out();
//    fence.out();
    const isdev = true;
    const DIM = isdev? 4: 20;
    const hue = frnum % 360;
    const color = rgb2RGB(hsv2rgb({h: hue, s: 100, v: bradjust(hue, DIM)}));
debug("render[fr %'d]: use hue %'d => color 0x%x, isdev? %d, fill dumb models", frnum, hue, color, +isdev);
    for (const model of models)
    {
        model.fill(color); //RGBdim1(PAL[frnum % PAL.length], 1/100)); //render fx to model nodes
        model.was_dirty = model.dirty = true;
//        model.port.dirtylen = Math.max(model.port.dirtylen, model.firstpx + model.numpx);
        model.out(frbuf);
    }
//NOTE: all nodes /*between first +*/ before last dirty models on a port must also be output (WS281X stream can be /*delayed or*/ cut short, but can't have gaps)
    for (const model of models)
//    {
        if (!model.was_dirty /*&& model.firstpx >= model.port.first_dirty*/ && model.firstpx + model.numpx <= model.port.dirtylen) model.out(frbuf);
//        model.was_dirty = false;
//    }
}


//wait for frbuf available:
//there will be 1 frbuf for each frame redraw request
//locking !needed as long as multiple renderers are accessing *different* parts of same frbuf
my_exports(await4frame); //allow reuse by custom code
async function await4frame(prev)
{
//    if (typeof wait4frame.seqnum != "number") wait4frame.frbuf = {seqnum: yalp.seqnum, timestamp: -1};
//    if (!wait4frame.prev) wait4frame.prev = {seqnum: yalp.seqnum, timestamp: -1};
    if (!prev.hasOwnProperty("seqnum")) [prev.seqnum, prev.timestamp] = [yalp.seqnum, -1];
    for (;;)
    {
        const frbuf = yalp.newer(prev.seqnum, prev.timestamp + 1);
        if (frbuf) return (frbuf.seqnum == prev.seqnum) && (prev.timestamp = frbuf.timestamp, frbuf);
        await sleep_msec(yalp.frtime || 50); //wait for another frbuf
    }
}


///////////////////////////////////////////////////////////////////////////////
////
/// misc helpers/utils
//

//reminder msg:
const {debug_limit} = require("yalp21/incl/debug");
my_exports(TODO);
function TODO(...args)
{
//    return debug.with_opts({limit: 1, nested: +1}, "TODO: ".brightYellow, ...args);
    ++debug.depth || (debug.depth = 1);
    return debug_limit(1, "TODO: ".brightYellow, ...args);
}


//simplified time compares:
my_exports(hhmm);
function hhmm(date)
{
    const now = date || new Date(); //Date.now();
    return now.getHours() * 100 + now.getMinutes();
}


//track elapsed time:
//useful for perf tuning, or checking schedule run length
my_exports(elapsed); //allow reuse by custom code
function elapsed(started) //reset)
{
//    return (isdef(reset) || !elapsed.started)?
//        (elapsed.started = Date.now() - (reset || 0), reset || 0):
//        Date.now() - elapsed.started;
//    if (!elapsed.started) elapsed.started = Date.now();
//    return Date.now() - (started || elapsed.started);
    return /*isdef*/(started)? Date.now() - started: //caller has own base time
        /*isdef*/(elapsed.started)? Date.now() - elapsed.started: //use my (global) base time
        (elapsed.started = Date.now(), 0); //init my base time
}


//delay:
//blocks asynchronously only
my_exports(sleep_msec);
async function sleep_msec(msec)
{
debug("sleep %'d msec", msec);
    return new Promise((resolve) => setTimeout(resolve, msec));
}


//check if obj is regex:
my_exports(isRE);
function isRE(obj) { return (obj instanceof RegExp); }


//check for undef:
//this is safer than "|| default_value" for falsey values
//optional alt vals for def/undef
//reduces verbosity/typos
my_exports(isdef);
function isdef(val, ...altvals) //tval, fval)
{
    const retval = (typeof val != "undefined");
    return altvals.length? altvals[+!retval]: retval;
}


//export function or object:
//functions can be hoisted, objects/scalars can't
//CAUTION: don't export; external callers must use own module.exports
function my_exports(thing, name)
{
    if (!isdef(thing)) throw `export ${name || "??"} !found`.brightRed;
    return module.exports[name || thing.name /*|| thing.constructor.name*/] = thing;
}

//eof
