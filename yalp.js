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
const {debug, warn, log, errlog, fmtstr, TODO, srcline} = require("yalp21/incl/msgout");
const {stats: color_stats} = require("yalp21/incl/colors");
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
//const [numfr, busy, emit, idle] = [yalp.numfr, yalp.busy_time, yalp.emit_time, yalp.idle_time];
//const total = busy + emit + idle;
//Object.defineProperty(yalp, "total", {get: function() { return this.busy_time + this.emit_time + this.idle_time; },});
debugger;
log("YALP: fb# %d, %'d x %'d, univ {# %d, len %'d, %'d max}, frame {intv %'d usec, fps %3.1f}, bkg running? %d, parent? %d, #att %d, seq# %'d, elapsed %'d vs %'d, #fr %'d (%2.1f fps), %%busy %2.1f, %%emit %2.1f, %%idle %2.1f".brightCyan, yalp.fbnum, yalp.xres, yalp.yres, yalp.NUM_UNIV, yalp.UNIV_LEN, yalp.UNIV_MAXLEN, yalp.frtime, 1e6 / yalp.frtime, yalp.bkgpid, +!!module.parent, yalp.num_att, yalp.seqnum, yalp.elapsed, (yalp.busy_time + yalp.emit_time + yalp.idle_time) / 1e3, yalp.numfr, yalp.elapsed? yalp.numfr * 1e3 / yalp.elapsed: 0, yalp.elapsed? 100 * yalp.busy_time / 1e3 / yalp.elapsed: 0, yalp.elapsed? 100 * yalp.emit_time / 1e3 / yalp.elapsed: 0, yalp.elapsed? 100 * yalp.idle_time / 1e3 / yalp.elapsed: 0);
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
log("stats: elapsed %'d vs %'d, #fr %'d (%2.1f fps), %%busy %2.1f, %%emit %2.1f, %%idle %2.1f".brightCyan, yalp.elapsed, (yalp.busy_time + yalp.emit_time + yalp.idle_time) / 1e3, yalp.numfr, yalp.elapsed? yalp.numfr * 1e3 / yalp.elapsed: 0, yalp.elapsed? 100 * yalp.busy_time / 1e3 / yalp.elapsed: 0, yalp.elapsed? 100 * yalp.emit_time / 1e3 / yalp.elapsed: 0, yalp.elapsed? 100 * yalp.idle_time / 1e3 / yalp.elapsed: 0);
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
        .map(({exports, filepath}) => ({exports, filepath, name: shortpath(filepath), })); //audio: exports.audio}));
//debug.max_arg_len = 500;
debug("player matches:", seqmatch.map(({name}) => name));
    if (seqmatch.length != 1)
    {
        errlog("seq '%s' %s (%'d matches): %s".brightRed, seqname.source || seqname, !seqmatch.length? "!found".brightRed: "ambiguous".brightYellow, seqmatch.length, seqmatch.map(({name}) => name).join(", ") || "(none)");
        return await sleep(5e3); //wait 5 sec to reduce log diarrhea
    }
    const {name, exports: {seq/*, audiopath, duration*/}, filepath} = seqmatch[0];
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
    const seqnum = yalp.recycle(); //cancel prev playback; reset frbuf timestamps + invalidate frbuf cache
    yalp.seqname = name || filepath; //seqfiles[0].name; // || seqfiles[0].name; //Path.basename(seqpath[0], Path.extname(seqpath[0])); //seqname;
//TODO("add re-sync logic if seq drifts too far from mp3 timestamp?"); //not needed if use mp3 for time base
    log("playing seq# %'d '%s'", seqnum, name); //, duration %'d msec, audio '%s'", name, duration || 0, audiopath || "(none)");
//NOTE: this gives seq() ~0.4 sec lead time for setup + pre-render; if !enough, add delay here
//    const numfr = await new Promise(async function(resolve, reject)
//    {
//        const tscheck = setInterval(() => debug("seq[%'d] ts: render time %'d, mp3 time %'d, delta %'d msec, bkgpid %d, #fr %'d", newseqnum, yalp.timestamp, mp3play.timestamp, yalp.timestamp - mp3play.timestamp, yalp.bkgpid, yalp.numfr), 5e3);
//try/catch: the show must go on :P
//        /*try*/ { await Promise.all([runfx({fx: seq}), mp3play(audiopath, () => resolve(yalp.updloop()))]); } //start sequence pre-render, music decode; trigger bkg frbuf pivot+update process when audio starts
//        /*catch*/ function c (exc) { log("playback error: %s".brightRed, exc); }
//TODO("re-instate try/catch");
//        clearInterval(tscheck);
//        yalp.cancel(); //upd loop no longer needed, seq + mp3 have completed
//    });
//    debug("seq/audio completed after %'d msec, expected %'d msec, %'d fr proc".brightGreen, elapsed(), duration || -1, numfr);
//    debug("playback done".brightGreen);
//try/catch: the show must go on :P
TODO("re-instate try/catch");
debugger;
    runfx.seqnum = yalp.seqnum;
    /*try*/ { await runfx({fx: seq}).retval; }
//    const ret = runfx({fx: seq, model: seq}); //.retval;
//debug(typeof ret.got_frbuf);
//debug(ret.got_frbuf({seqnum: 5, timestamp: 5}));
//debug(typeof ret, Object.keys(ret), typeof ret.retval);
//debug(!!ret.retval.then);
//    await ret.retval;
//    await seq({await_frame: });
    /*catch*/function c (exc) { log("playback error: %s".brightRed, exc); }
debug("player finish".brightGreen);
}


///////////////////////////////////////////////////////////////////////////////
////
/// (example) seq, model, fx
//

//NOTE: 1 fx/model (else conflicting updates), but mult model/fx
//=> list of model+fx waiting for frbufs


//spread workload across multiple cores:
const workerize = require("node-inline-worker"); //https://www.npmjs.org/package/node-inline-worker

//models:
const {layout} = require("yalp21/layouts/devlab");
//debug(layout);
const models = Object.values(layout) //port info
//    .map(port => (debug(port), port))
    .map(port => port.models) //models on this port
    .flat()
//    .map(model => (debug(model), model))
    .reduce((by_name, model) => Object.assign(by_name, {[model.name]: model}), {});
debug("models", Object.keys(models));

//fx:
const {fx_fade} = require("yalp21/fx/fade");
const {mp3play} = require("yalp21/fx/mp3play");
//async function pxscan(


//dummy frbuf (mainly for debug):
const NOFR = {seqnum: -1, timestamp: -99};


//example seq:
//seq is just a (sorted) list of evts
//NOTE: all time delays are based on GPU frames; gives simple/reliable timing
//seq does not have its own frame rate; fx/evts determine their own frame rates
const evts =
[
//    {start: 0, duration: 10e3, fx: mp3play, media: /take three/i, xmodel: models.speaker},
    {start: 10e3, duration: 2e3, fx: fx_fade, model: models.devpanel, fps: 20, to: 0xFF00FF00},
    {start: 15e3, duration: 3e3, fx: fx_fade, model: models.devpanel, fps: 2, to: 0xFFff00ff},
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
    my_fx.push(runfx.latest); //kludge: allow seq to use its own evth; caller didn't have access to my_fx[]
//debug(my_fx[0], typeof my_fx[0].retval, my_fx[0].retval, typeof my_fx[0].got_frbuf, my_fx[0].got_frbuf);
    const bkg = yalp.updloop(frbuf => (/*debug("evth {%'d, %'d} => %'d evth", (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp, my_fx.length),*/ my_fx.map(fx => (/*debug(typeof fx, typeof fx.got_frbuf),*/ fx.got_frbuf(frbuf))))); //fx.pending.resolve(frbuf));
//    const seqnum = yalp.seqnum;
log("seq[%'d] start".brightCyan, runfx.seqnum); //, Object.keys(yalp));
//    for (let i = 0, frbuf = null; i < evts.length; ++i)
    evts
        .sort((lhs, rhs) => ((lhs.start || 0) - (rhs.start || 0)) || ((lhs.duration || 0) - (rhs.duration || 0)))
        .reduceRight((next, evt, inx, all) => //kludge: in lieu of .forEachReverse()
        {
            const warnings = [];
            if (!opts.fx) throwx("evt[%'d/%'d]: no fx to run", inx, all.length);
            if (!opts.model) { opts.model = opts.fx; warnings.push(["using fx as model"]); } //use fx/seq as model
            if (!opts.hasOwnProperty("start")) { opts.start = 0; warnings.push(["setting fx start to 0"]); }
            if (!opts.fps) { opts.fps = yalp.fps || 1; warnings.push(["setting fps to %d", opts.fps]); }
            if (!evt.hasOwnProperty("duration")) //default run until next evt
            {
                evt.duration = (next[evt.model.name].start || evts.last.start) - (evt.start || 0) || 1;
                warnings.push(["setting duration to %'d msec", evt.duration]);
            }
            if (warnings.length) warn("evt[%'d/%'d]: %s", inx, all.length, warnings.map(msg => fmtstr(...msg)).join(", "));
            next[evt.model.name] = evt; //remember next evt for this model
            return next;
        }, {});
models.devpanel.want_dump = true;
TODO("add model latency stats: (elapsed, model, fx, fr timestamp, in/out time");
TODO("tsfn -> wker thread? or async/promise across to wker thread?");
    let frbuf;
    const FXAHEAD = 50; //give fx 50 msec extra to init before needed
    for (const [inx, evt] of Object.entries(evts))
//    for (const evt in evts)
//    for (let time = evts[0].start; time < evts.top.start + evts.top.duration; time += steplen)
    {
debug("evt[%'d/%'d]: model '%s' await %'d-%'d msec, cur frbuf {%'d, %'d}", inx, Object.keys(evts).length, evt.model.name, evt.start, FXAHEAD, (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
        if (!frbuf || evt.start - FXAHEAD > frbuf.timestamp) frbuf = await await_frame(evt.start - FXAHEAD); //seqnum, //work ahead a little; gives expensive fx extra time to start
//debugger;
//debug(typeof frbuf, frbuf.constructor.name, frbuf);
debug("seq[%'d]: got frbuf {%'d, %'d}", runfx.seqnum, (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
        if (!frbuf) break; //seq completed or cancelled
//        if (evt.strict && frbuf.timestamp > evt.start + evt.duration) continue; //skip this evt
        my_fx.push(/*evt.fx.call(null,*/ runfx(evt)); //, frbuf)); //start next async fx; start even if late
    }
    debug("waiting for seq + %'d evts to finish, last frbuf was {%d, %'d}".brightGreen, my_fx.length - 1, (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
    await Promise.all(my_fx.map(fx => fx.retval));
    debug("seq + %'d evts finished", my_fx.length - 1);
    yalp.cancel(); //exit from frame upd loop
//debug("here0", typeof bkg, !!bkg.then);
//    await sleep(5e3);
    const numfr = await bkg;
    debug("%'d frames processed (%'d msec)", numfr, Math.round(Math.max(numfr, 0) * 1e3 / yalp.frtime));
//    await sleep(5e3);
    debug("color stats", color_stats);
}


//run async fx:
//NOTE: 1 fx/model (else conflicting updates), but allow mult model/fx
//=> list of model+fx waiting for frbufs; attach promise to model + await
//NOTE: seq is just another (composite) fx, uses same frbuf/evt framework as fx
//can't sync GPU to external events, so use GPU frames as primary timing source
//evt emitter + promise seems like less overhead than async wker per frame, uses fewer threads
/*NOT! async*/ function runfx(opts)
{
//    yalp.on("frame", got_frbuf);
    opts.await_frame = await_frame;
//    if (!opts.fx) throwx("no fx to run");
//    if (!opts.model) opts.model = opts.fx; //use fx/seq as model
//    /*const*/ opts.model.pending = {seqnum: yalp.seqnum}; //model should only have 1 fx, so put pending frbuf req there
//    if (!opts.start) opts.start = 0;
//    if (!opts.duration) opts.duration = ??;
//    if (!opts.fps) opts.fps = yalp.fps || 1;
//    if (!opts.seqnum) opts.seqnum = yalp.seqnum;
    runfx.latest = {got_frbuf}; //kludge: allow seq to incl self evth; CAUTION: must be set < calling fx()
//    const retval = opts.fx(opts); //promise to wait for fx/seq to finish
//debug("here1");
    const retval = new Promise(async (resolve, reject) => resolve(await opts.fx(opts)));
//debug("here2", !!retval.then);
//    yalp.off("frame", got_frbuf);
//    return retval; //in case caller wants retval
    return {got_frbuf, retval}; //return frbuf evt handler + fx promise
//debug("here3", typeof ret, Object.keys(ret), typeof ret.retval, !!ret.retval.then);
//    return ret;

    function got_frbuf(frbuf)
    {
//debug("got frbuf {%'d, %'d}", (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp);
        const pending = opts.model.pending || {};
//if (!pending) throwx("no pending");
//debug("got frbuf {%'d, %'d}, pending {%'d, %'d}", (frbuf || NOFR).seqnum, (frbuf || NOFR).timestamp, (pending || NOFR).seqnum, (pending || NOFR).want_time);
        if (!pending.promise) return; //caller !waiting for frbuf
//if (!pending.resolve) throwx("no pending resolve");
        if (!frbuf || frbuf.seqnum != pending.seqnum) return pending.resolve(); //eof or cancel; TODO: figure out why must return here for seq to exit correctly
        if (frbuf.timestamp >= pending.want_time) return pending.resolve(frbuf); //got desired frame
//debug("exit got_frbuf");
    }
    async function await_frame(want_time) //seqnum,
    {
        const pending = opts.model.pending || (opts.model.pending = {}); //model should only have 1 fx, so put pending frbuf req there
        [pending.seqnum, pending.want_time] = [runfx.seqnum, want_time];
//debug("await_frame {%'d, %'d}", seqnum, want_time);
        const frbuf = yalp.newer(runfx.seqnum, want_time);
        if (frbuf) return frbuf; //no need to wait; allow fx to pre-render
        return pending.promise = new Promise((resolve, reject) => { [pending.resolve, pending.reject] = [resolve, reject]; });
    }
}


///////////////////////////////////////////////////////////////////////////////
////
/// misc helpers/utils
//

//eof