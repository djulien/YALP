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
const fs = require("fs");
//const assert = require('assert').strict; //https://nodejs.org/api/assert.html
//const Path = require("path");
//const fx = require("./fx");
//const models = require("./models");
//const layout = require("./layout");
//const {isdef, elapsed, srcline} = require("gpuport");
const {my_exports, find_files, shortpath, isRE, sleep, elapsed, isdef, json_clup, revive_re} = require("yalp21/incl/utils");
const {debug, log, errlog, TODO, srcline} = require("yalp21/incl/msgout");
//const {TODO} = require("yalp21/incl/utils");
//srcline.me = Path.basename(__file); //kludge: show "me" in debug msgs
const {YALP, isRPi} = require("yalp21");
//const j = {x: 1, y: "A", r: /ab/g, f: 1.2}; console.log(j.r.toString(), JSON.stringify(j));
const cfg = //require("yalp21/config/yalp.json"); //allow cfg to override hard-coded/demo values
    JSON.parse(json_clup(fs.readFileSync("./config/yalp.json", "utf8")), revive_re);
//console.log(cfg);
my_exports({YALP, isRPi, debug, cfg}); //].forEach((exp) => my_exports(exp));


///////////////////////////////////////////////////////////////////////////////
////
/// config
//

const OPTS = cfg.fbopts ||
{
    fbnum: isRPi? 1: 0,
    timing: "320 0 0 1 0  240 0 3 3 3  0 0 0  30 0 2400000 1", //simulate/override dpi_timings from RPi config.txt
};


//elapsed();
const yalp = new YALP(OPTS);
my_exports({yalp}); //allow access by custom code
const [numfr, busy, idle] = [yalp.numfr, yalp.busy_time, yalp.idle_time];
debugger;
log("YALP: fb# %d, %'d x %'d, univ {# %d, len %'d, %'d max}, frame {intv %'d usec, fps %3.1f}, bkg running? %d, parent? %d, #att %d, seq# %'d, #fr %'d (%2.1f fps), %%busy %2.1f, %%idle %2.1f".brightCyan, yalp.fbnum, yalp.xres, yalp.yres, yalp.NUM_UNIV, yalp.UNIV_LEN, yalp.UNIV_MAXLEN, yalp.frtime, 1e6 / yalp.frtime, yalp.bkgpid, +!!module.parent, yalp.num_att, yalp.seqnum, numfr, (busy + idle)? numfr / (busy + idle): 0, (busy + idle)? busy / (busy + idle): 0, (busy + idle)? idle / (busy + idle): 0 );
//log(Object.keys(yalp));
//log("yalp init".brightGreen);
//process.exit();


///////////////////////////////////////////////////////////////////////////////
////
/// scheduler
//

//regular daily schedule:
const sched = cfg.sched ||
{
    START: 1645 -400, //hhmm
    STOP: 2145, //hhmm
    POLL: 60e3 -55e3, //msec
};

//seq relative to ./seq folder:
const playlist = cfg.playlist ||
{
    xfirst: /intro/i, //plays 1x only
    first: __filename, //self-test
//    loop: [/tests\/xmas2020/i],
    xloop:
    [
        /hippo/i,
        /love came down/i,
        /decorations/i,
        /capital C/i,
    ], 
    xlast: /closing/i, //plays 1x only
    folder: "./seq/**/*seq*.js", //look for seq within this folder
};
//my_exports(playlist); //, "playlist");


//1-shot scheduler:
//waits until *next* show is scheduled to start
//plays intro, then loops playlist until scheduled stop
//plays closing then exits; ext proc mgr can restart it for next day
//daily restart allows file changes/bug fixes to be pulled in
my_exports({scheduler}); //allow reuse by custom code
/*await*/ async function scheduler()
{
    while (!active()) await sleep(sched.POLL); //check < sleep is better for emergency restarts
    log("scheduler: start".brightGreen);
//??    player.bkg = yalp.uloop(OPTS); //start frbuf pivot+update process if not already running
    if (playlist.first) await player(playlist.first);
//TODO: active audience interactivity here
    if (playlist.loop) for (let i = 0; active(); ++i) await player(playlist.loop[i % playlist.loop.length]);
    if (playlist.last) await player(playlist.last);
    log("scheduler: exit".brightGreen); //restart each day for safety (also allows file updates)
} //)();
//if (!module.parent) run(isMainThread? main_seq: wker); 
if (!module.parent) run(scheduler); //allow inline init and I/O to finish first (avoids hoist problems)


//check whether to run sequences:
//uses simplified "hhmm" time compares
my_exports({active});
function active(date)
{
//    const now = hhmm();
    const now = date || new Date(); //Date.now();
    const hhmm = now.getHours() * 100 + now.getMinutes();
    const STOP_UNWRAP = sched.STOP + (sched.STOP < sched.START) * 2400; //kludge: allow time of day to wrap
    const retval = (sched.START <= hhmm) && (hhmm < STOP_UNWRAP);
//    debug("active check: start %d <= now %d < stop %d = active? %d", sched.START, hhmm, sched.STOP, +retval);
    return retval;
}


//request or cancel run after current I/O completes:
//inline debug/unit test can cancel scheduler
my_exports({run});
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

//const DEVTEST = __filename; //false; //override seq files


//start seq playback:
//initiates seq + mp3 playback
//mp3 timing is used as playback time ref since it's rigid
//short-form/partial seq names can be used as long as unambiguous
my_exports({player}); //allow reuse by custom code
async function player(seqname)
{
    const seqfiles = player.cache || (player.cache = find_files(playlist.folder || __dirname) || []); //assume folder tree won't change today
//    try //the show must go on :P
//    {
    const seqmatch = ((!isRE(seqname) && fs.existsSync(seqname))? [seqname]: seqfiles)
//        .map((filepath, inx, all) => (debug("file[%'d/%'d] '%s': check name against %s", inx, all.length, filepath, seqname.source || seqname), filepath))
        .filter(filepath => isRE(seqname)? filepath.match(seqname): ~filepath.indexOf(seqname)) //choose file within nested folders
//        .map((filepath, inx, all) => (debug("match[%'d/%'d] '%s': try to load seq() entpt", inx, all.length, filepath), filepath))
        .map(filepath => ({exports: require(/*DEVTEST ||*/ filepath), filepath})) //load seq exports
        .filter(({exports}) => typeof exports.seq == "function") //check for seq() function
        .map(({exports, filepath}) => ({exports, filepath, name: shortpath(filepath), audio: exports.audio}));
//debug.max_arg_len = 500;
debug("player matches:", seqmatch.map(({name}) => name));
    if (seqmatch.length != 1)
    {
        errlog("seq '%s' %s (%'d matches): %s".brightRed, seqname.source || seqname, !seqmatch.length? "!found".brightRed: "ambiguous".brightYellow, seqmatch.length, seqmatch.map(({name}) => name).join(", ") || "(none)");
        return await sleep(5e3); //wait 5 sec to reduce log diarrhea
    }
    const {name, exports: {seq, audiopath, duration}, filepath} = seqmatch[0];
debug("loading seq '%s', exports %s ...".brightCyan, name, Object.keys(exports).join(", "));
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
//TODO("add re-sync logic if seq drifts too far from mp3 timestamp?"); //not needed if use mp3 for time base
    log("playing seq '%s', duration %'d msec, audio '%s'", name, duration || 0, audiopath || "(none)");
//NOTE: this gives seq() ~0.4 sec lead time for setup + pre-render; if !enough, add delay here
    const numfr = await new Promise(async function(resolve, reject)
    {
        const tscheck = setInterval(() => debug("seq[%'d] ts: render time %'d, mp3 time %'d, delta %'d msec, bkgpid %d, #fr %'d", newseqnum, yalp.timestamp, mp3play.timestamp, yalp.timestamp - mp3play.timestamp, yalp.bkgpid, yalp.numfr), 5e3);
//try/catch: the show must go on :P
        /*try*/ { await Promise.all([runfx({fx: seq}), mp3play(audiopath, () => resolve(yalp.updloop()))]); } //start sequence pre-render, music decode; trigger bkg frbuf pivot+update process when audio starts
        /*catch*/ function c (exc) { log("playback error: %s".brightRed, exc); }
TODO("re-instate try/catch");
        clearInterval(tscheck);
        yalp.cancel(); //upd loop no longer needed, seq + mp3 have completed
    });
    debug("seq/audio completed after %'d msec, expected %'d msec, %'d fr proc".brightGreen, elapsed(), duration || -1, numfr);
//    debug("playback done".brightGreen);
}


//put status info where other funcs can see it:
const MP3LAG = (cfg.player || {}).mp3lag || -420; //msec; speaker seems to have ~0.4 sec buf
Object.defineProperty(mp3play, "timestamp", {get: function() { return this.bps? Math.trunc(this.datalen * 1e3 / this.bps) + MP3LAG: MP3LAG; }}); //sec

//errlog("hhello");


//mp3 file playback:
my_exports({mp3play}); //allow reuse by custom code
async function mp3play(filepath, cb)
{
//    mp3play.started = Date.now();
//    mp3play.timestamp = MP3LAG -1e3; //pre-start
//    if (!isdef(mp3play.timestamp)) Object.defineProperty(mp3play, "timestamp", {get: function() { return Math.trunc(this.datalen * 1e3 / this.bps) / 1e3 + MP3LAG; }); //sec; put status info where other funcs can see it
//    mp3play.datalen = MP3LAG * mp3play.bps / 1e3;
    mp3play.bps = 0; //freeze timestamp until fmt info decoded
    if (!filepath) { /*await sleep_msec(1e3);*/ (cb || nop)(); return; } //no audio, but notify caller
//    assert(fs.existsSync(filename), `'${filename}' !found`);
    if (!fs.existsSync(filepath))
    {
        errlog("audio '%s' not found", filepath);
        await sleep(1e3); //give a little time before cb
        (cb || nop)();
        return;
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
                .on('error', function (...args) { errlog("speaker error", ...args, elapsed()); });
            this.pipe(spkr); //new Speaker(fmt));
            (cb || nop)();
        })
//        .on('progress', function (...args) { debug(`mp3 progress at ${commas(elapsed())} msec`.brightGreen, ...args); })
//        .on('finish', function (...args) { debug(`decode/enqueue finished after ${commas(elapsed())} msec, total data ${commas(this.datalen)} bytes`.brightGreen, ...args); })
//        .on('complete', function (...args) { debug(`decode/enqueue complete after ${commas(elapsed())} msec`.brightGreen, ...args); })
        .on('error', function (...args) { errlog("mp3 error", ...args, elapsed()); });
    return retval;

    function nop(val) { return val; } //dummy callback
}
    
    
///////////////////////////////////////////////////////////////////////////////
////
/// (example) seq, model, fx
//

//NOTE: 1 fx/model (else conflicting updates), but mult model/fx
//=> list of model+fx waiting for frbufs


//spread workload across multiple cores:
const workerize = require("node-inline-worker"); //https://www.npmjs.org/package/node-inline-worker
const {fx_fade} = require("yalp21/fx/fade");

//debugger;
const {layout} = require("yalp21/layouts/devlab");
//debug(layout);
const models = Object.values(layout) //port info
//    .map(port => (debug(port), port))
    .map(port => port.models) //models on this port
    .flat()
//    .map(model => (debug(model), model))
    .reduce((by_name, model) => Object.assign(by_name, {[model.name]: model}), {});
debug("models", Object.keys(models));

//async function pxscan(

//example seq:
//seq is just a (sorted) list of evts
//NOTE: all time delays are based on GPU frames; gives simple/reliable timing
const evts =
[
    {start: 1e3, duration: 2e3, fx: fx_fade, model: models.devpanel, fps: 20, to: 0xFF000000},
    {start: 5e3, duration: 3e3, fx: fx_fade, model: models.devpanel, fps: 2, to: 0xFFff00ff},
];
my_exports({seq}); //allow use by player
async function seq(opts)
{
    const {await_frame} = opts;
//    const {/*start, duration,*/ evts} = opts;
//    assert(isdef(DURATION) && isdef(FPS) && isdef(colors));
//    const colors = toary(opts.color); //|| [BLACK, WHITE_dim]);
//    const DIM = .5; //TODO
    const my_fx = [];
    const seqnum = yalp.seqnum;
TODO("add model latency stats");
    const result = yalp.updloop(frbuf =>
    {
        my_fx.forEach(fx_got_frbuf => fx_got_frbuf(frbuf)); //fx.pending.resolve(frbuf));
    });
log("seq[%'d] start".brightCyan, seqnum); //, Object.keys(yalp));
//    for (let i = 0, frbuf = null; i < evts.length; ++i)
    let frbuf;
    const FXAHEAD = 50; //give fx 50 msec extra to init before needed
    evts.sort((lhs, rhs) => (lhs.start - rhs.start) || (lhs.duration - rhs.duration));
models.devpanel.want_dump = true;
    for (const evt of evts)
//    for (const evt in evts)
//    for (let time = evts[0].start; time < evts.top.start + evts.top.duration; time += steplen)
    {
debug("seq await seq# %d, time %'d for model '%s'", seqnum, evt.start - FXAHEAD, evt.model.name);
        if (!frbuf || evt.start - FXAHEAD > frbuf.timestamp) frbuf = await await_frame(seqnum, evt.start - FXAHEAD); //work ahead a little; gives expensive fx extra time to start
//debugger;
//debug(typeof frbuf, frbuf.constructor.name, frbuf);
debug("seq[%'d]: got frbuf? %d, timest %'d", seqnum, +!!frbuf, (frbuf || {}).timestamp);
        if (!frbuf) break; //seq completed or cancelled
//        if (evt.strict && frbuf.timestamp > evt.start + evt.duration) continue; //skip this evt
        my_fx.push(/*evt.fx.call(null,*/ runfx(evt)); //, frbuf)); //start next async fx; start even if late
    }
    debug("waiting for %'d evts to finish".brightGreen, my_fx.length);
    await Promise.all(my_fx);
//    yalp.cancel();
    debug("%'d evts finished", my_fx.length);
}


//run async fx:
//NOTE: seq is just another (composite) fx, uses same frbuf/evt framework as fx
//NOTE: evt emitter + promise seems like less overhead than async wker per frame
//NOTE: 1 fx/model (else conflicting updates), but mult model/fx
//=> list of model+fx waiting for frbufs
async function runfx(opts)
{
    const pending = {};
//    yalp.on("frame", got_frbuf);
    opts.await_frame = await_frame;
    const retval = await opts.fx(opts);
//    yalp.off("frame", got_frbuf);
//    return retval; //in case caller wants retval
    return got_frbuf;

    function got_frbuf(frbuf)
    {
        if (!pending.promise) return;
        if (!frbuf || frbuf.seqnum != pending.seqnum) pending.resolve(); //eof
        if (frbuf.timestamp >= pending.timestamp) pending.resolve(frbuf); //got desired frame
    }
    async function await_frame(seqnum, timestamp)
    {
        pending.seqnum = seqnum;
        pending.timestamp = timestamp;
        return pending.promise = new Promise((resolve, reject) =>
        {
            pending.resolve = resolve;
            pending.reject = reject;
        });
    }
}


///////////////////////////////////////////////////////////////////////////////
////
/// misc helpers/utils
//

//eof