#!/usr/bin/env node
//YALP scheduler
//history:
//2/25/21  4.21.1  DJ  move scheduler + player logic into separate file

'use strict'; //find bugs easier
require("magic-globals"); //__file, __line, __stack, __func, etc
require('colors').enabled = true; //for console output (all threads)
const fs = require("fs");
const Path = require("path");
//const assert = require('assert').strict; //https://nodejs.org/api/assert.html
//const fx = require("./fx");
//const models = require("./models");
//const layout = require("./layout");
//const {isdef, elapsed, srcline} = require("gpuport");
const {my_exports, find_files, json_fixup, revive_re, shortpath, isRE, sleep, elapsed, plural, isdef} = require("yalp/incl/utils");
const {debug, warn, log, errlog, fmtstr, TODO, srcline} = require("yalp/incl/msgout");
//const {stats: color_stats} = require("yalp/incl/colors");
//const {TODO} = require("yalp/incl/utils");
//srcline.me = Path.basename(__file); //kludge: show "me" in debug msgs


//suggested installation:
//  npm install pm2 -g
//  pm2 install pm2-logrotate
//  pm2 set pm2-logrotate:retain 5
//  pm2 install pm2-server-monit
//  pm2 set pm2-server-monit:drive /
//  pm2 set pm2-server-monit:cpu_refresh_rate 60
//  pm2 set pm2-server-monit:memory_refresh_rate 60
//  pm2 module:update pm2-server-monit

//  pm2 start player.js
//  pm2 save

//admin:
//  pm2 stop player.js
//  pm2 restart player.js
//  more ~/.pm2/logs/pm2-server-monit-out.log 
//  pm2 reload all  #hot reload
//  pm2 unstartup  #need to do this with node upgrade


///////////////////////////////////////////////////////////////////////////////
////
/// schedule + playlist
//

const {pkgpath} = require("yalp");
//allow cfg file to override hard-coded defaults:
const cfg = //require("yalp21/config/yalp.json"); //allow cfg to override hard-coded/demo values
    JSON.parse(json_fixup(fs.readFileSync(Path.resolve(Path.dirname(pkgpath), "config/yalp.json"), "utf8")), revive_re);
//console.log(cfg);


//regular daily schedule:
const sched = cfg.sched ||
{
    START: 1645 -400, //hhmm
    STOP: 2145, //hhmm
    POLL: 60e3 -55e3, //how frequently to poll when idle; msec
};

//all seq relative to ../seq folder:
const playlist = cfg.playlist ||
{
    xfirst: /intro/i, //plays 1x only
    first: "port-test", //__filename, //self-test
//    loop: [/tests\/xmas2020/i],
    xloop:
    [
        /hippo/i,
        /love came down/i,
        /decorations/i,
        /capital C/i,
    ], 
    xlast: /closing/i, //plays 1x only
    folder: "../seq/**/!(bkup|*-bk*)/**/*.js", //look for seq within this folder
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
    log("scheduler: exit, %'d seq played".brightGreen, player.count || 0); //restart each day for safety (also allows file updates)
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
    const STOP_UNWRAP = sched.STOP + (sched.STOP <= sched.START) * 2400; //kludge: allow time of day to wrap
    const retval = (sched.START <= hhmm) && (hhmm < STOP_UNWRAP);
//    debug("active check: start %d <= now %d < stop %d = active? %d", sched.START, hhmm, sched.STOP, +retval);
    return retval;
}


///////////////////////////////////////////////////////////////////////////////
////
/// player
//

//const DEVTEST = __filename; //false; //override seq files

//find seq or layout files:
//traverse folder 1x only (assumes folder tree won't change today)
//seq can override
//const layouts = require(cfg.layout || "../layouts/dev-lab");
debugger;


//kludge: redirect layout/seq debug output to file:
const addon = require("yalp");
const fd = fs.openSync("data/loader.log", "w"); //"a"
    
addon.debout = fd; //redirect debug output to file
const layouts = choices(find_files(cfg.layout || "../layouts/**/!(bkup|*-bk*)/**/*.js") || [], "layout");
addon.debout = process.stdout.fd; //send debug output back to console
debug(layouts.length, "layouts found:", layouts.map(layout => layout.filepath)); //shortpath(layout.filepath)));

addon.debout = fd; //redirect debug output to file
const seqfiles = choices(find_files(playlist.folder || __dirname) || [], "seq");
addon.debout = process.stdout.fd; //send debug output back to console
debug(seqfiles.length, "seq found:", seqfiles.map(seq => seq.filepath)); //shortpath(seq.filepath)));

debug("(see data/loader.log for additional debug info)");
fs.closeSync(fd);

//don't show error if module !exists:
require.quietResolve = function(...args) { try { return require.resolve(...args); } catch (exc) {}; };


//start seq playback:
//seq is responsible for mp3/mp4 playback
//seq must export {seq, layout, ctlr}
//short-form/partial seq names can be used as long as unique within seq folder
my_exports({player}); //allow reuse by custom code
async function player(seqname)
{
//debug.max_arg_len = 500;
    const seq /*{name: seqname, exports: {layout: layname}}*/ = //lazy_load(seqmatch[0].exports.seq); //{seq/*, audiopath, duration*/, layout}, filepath} = seqmatch[0];
        (typeof seqname == "function")? seqname(): //lazy load
        (typeof seqname == "object" && !isRE(seqname))? seqname: //as-is
        (() => //use IIFE to find file
        {
            const seqmatch = ((!seqname || isRE(seqname) || !require.quietResolve(seqname))? seqfiles: //find within folder
                choices([seqname])) //allow path to anywhere
//        .map((filepath, inx, all) => (debug("file[%'d/%'d] '%s': check name against %s", inx, all.length, filepath, seqname.source || seqname), filepath))
                .filter(({filepath}) => isRE(seqname)? filepath.match(seqname): ~filepath.indexOf(seqname)) || []; //choose file
//debug("player matches:", seqmatch.map(({name}) => name));
//debug(typeof seqmatch[0], seqmatch[0]);
            if (seqmatch.length == 1) return require(seqmatch[0].filepath);
            errlog("seq '%s' %s (%'d matches): %s".brightRed, (seqname || {}).source || seqname, !seqmatch.length? "!found".brightRed: "ambiguous".brightYellow, seqmatch.length, seqmatch.map(({name}) => name).join(", ") || "(none)");
//            await sleep(5e3); //wait 5 sec to reduce log diarrhea
        })();
    if (!seq) return await sleep(5e3); //wait 5 sec to reduce log diarrhea
    const layout =
        (typeof seq.layout == "function")? seq.layout(): //lazy load
        (typeof seq.layout == "object" && !isRE(seq.layout))? seq.layout: //as-is
        (() => //use IIFE to find file
        {
            const layoutname = seq.layout;
            const layoutmatch = ((!layoutname || isRE(layoutname) || !require.quietResolve(layoutname))? layouts: //find within folder
                choices([layoutname])) //allow path to anywhere
                .filter(({filepath}) => isRE(layoutname)? filepath.match(layoutname): ~filepath.indexOf(layoutname)) || []; //choose file
            if (layoutmatch.length == 1) return require(layoutmatch[0].filepath);
            errlog("layout '%s' %s (%'d matches): %s".brightRed, (layoutname || {}).source || layoutname, !layoutmatch.length? "!found".brightRed: "ambiguous".brightYellow, layoutmatch.length, layoutmatch.map(({name}) => name).join(", ") || "(none)");
//            await sleep(5e3); //wait 5 sec to reduce log diarrhea
        })();
    if (!layout) return await sleep(5e3); //wait 5 sec to reduce log diarrhea
    const ctlr = seq.ctlr || layout.ctlr; //allow seq to override layout controller
debug("loading seq '%s', layout '%s', ctlr '%s' ...".brightCyan, seq.name, layout.name, ctlr.name);
//        log("start seq[%'d vs %d] '%s', audio '%s'".brightCyan, yalp.seqnum, newseqnum, seqpath[0], seq.audiopath);
//debug("seq ent pts", Object.keys(seq));
//    const bkg = 
//    if (!yalp.open(OPTS)) //open FB if not already open
//    {
//        log("failed to open FB".brightRed);
//        return await sleep_msec(5e3); //minimum wait to reduce log diarrhea
//    }
//    const seqdata = /*workerize*/(seqfiles[0].entpt()); //delegate seq to use wkers if needed
    ++player.count || (player.count = 1);
    const seqnum = ctlr.recycle(); //cancel prev playback; reset frbuf timestamps + invalidate frbuf cache
    ctlr.seqname = seq.name || seq.filepath; //seqfiles[0].name; // || seqfiles[0].name; //Path.basename(seqpath[0], Path.extname(seqpath[0])); //seqname;
//TODO("add re-sync logic if seq drifts too far from mp3 timestamp?"); //not needed if use mp3 for time base
    log("playing seq[%'d] '%s', layout '%s'".brightGreen, seqnum, seq.name, layout.name); //, duration %'d msec, audio '%s'", name, duration || 0, audiopath || "(none)");
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
//    runfx.ctlr = ctlr;
//    runfx.seqnum = ctlr.seqnum;
//    runfx.layout = layout;
    /*try*/ { await runfx({fx: seq, ctlr, layout}).retval; }
//    const ret = runfx({fx: seq, model: seq}); //.retval;
//debug(typeof ret.got_frbuf);
//debug(ret.got_frbuf({seqnum: 5, timestamp: 5}));
//debug(typeof ret, Object.keys(ret), typeof ret.retval);
//debug(!!ret.retval.then);
//    await ret.retval;
//    await seq({await_frame: });
    /*catch*/async function nocatch (exc) { errlog("playback error: %s".brightRed, exc); await sleep(5e3); } //wait 5 sec to reduce log diarrhea
//debug("player finish".brightGreen);
//TODO("append seq stats to csv file");
    log("playback done: elapsed %'d vs %'d msec, #fr %'d (%2.1f fps), %%busy %2.1f, %%emit %2.1f, %%idle %2.1f".brightGreen, ctlr.elapsed, (ctlr.busy_time + ctlr.emit_time + ctlr.idle_time) / 1e3, ctlr.numfr, ctlr.elapsed? ctlr.numfr * 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.busy_time / 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.emit_time / 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.idle_time / 1e3 / ctlr.elapsed: 0);
}


//file filter:
//looks for exported property
function choices(files, expname)
{
//    .map(filepath => ({exports: require(filepath), filepath})) //load layout exports
//    .filter(({exports}) => exports.layout) //check for exported layout
//    .filter(({exports}) => exports.seq && exports.layout && exports.ctlr) //check for exported seq, layout + ctlr
//    .map(({exports, filepath}) => ({exports, filepath, name: shortpath(filepath), }));
//    .map(info => Object.assign(info, {name: info.exports.layout.name || shortpath(info.filepath)}));
//    const seqmatch = ((!isRE(seqname) && fs.existsSync(seqname))? [seqname]: seqfiles)
//        .map((filepath, inx, all) => (debug("file[%'d/%'d] '%s': check name against %s", inx, all.length, filepath, seqname.source || seqname), filepath))
//        .filter(filepath => isRE(seqname)? filepath.match(seqname): ~filepath.indexOf(seqname)) //choose file within nested folders
//        .map((filepath, inx, all) => (debug("match[%'d/%'d] '%s': try to load seq() entpt", inx, all.length, filepath), filepath))
//debug(files);
//    const modout = [];
//    process.stdout.once("data", buf => modout.push(buf));
//    const modout = fs.createWriteStream("modout.txt");
//    [process.svout, process.sverr] = [process.stdout.write, process.stderr.write];
//    process.stdout.write = process.stderr.write = modout.write.bind(modout);
debug(files.length, expname, "files");
//https://nodejs.org/api/modules.html#modules_require_resolve_request_options
    const retval = files
        .map(filepath => require.resolve(filepath))
        .map(filepath => ({wasloaded: require.cache[filepath], filepath})) //CAUTION: need extra "()"
        .map(modinfo => Object.assign(modinfo, {exports: require(/*DEVTEST ||*/ modinfo.filepath)})) //load seq exports
        .map(modinfo => Object.assign(modinfo, (expname in modinfo.exports)? {name: modinfo.exports[expname].name || shortpath(modinfo.filepath)}: {})) //kludge: use "in" to avoid "Accessing non-existent property" warning
        .map(modinfo => (!modinfo.wasloaded && delete require.cache[modinfo.filepath], modinfo)) //don't leave it loaded (ctlr settings might conflict with other layouts)
        .filter(({exports}) => expname in exports) //~exports.indexOf(expname)) //&& exports.layout && exports.ctlr) //check for exported seq, layout + ctlr; //kludge: use "in" to avoid "Accessing non-existent property" warning
        .map(modinfo => (debug(Object.keys(modinfo.exports), modinfo.filepath), modinfo));
//    .filter(({exports}) => typeof exports.seq == "function") //check for exported seq() function
//    .map(({exports, filepath}) => ({exports, filepath, name: shortpath(filepath), })); //audio: exports.audio}));
debug(retval.length, expname, "files remaining");
//debug(modout);
//    [process.stdout.write, process.stderr.write] = [process.svout, process.sverr];
    return retval;
}


//run async fx:
//NOTE: 1 fx/model (else conflicting updates), but allow mult model/fx
//=> list of model+fx waiting for frbufs; attach promise to model + await
//NOTE: seq is just another (composite) fx, uses same frbuf/evt framework as fx
//can't sync GPU to external events, so use GPU frames as primary timing source
//evt emitter + promise seems like less overhead than async wker per frame, uses fewer threads
my_exports({runfx}); //allow seq to use
/*NOT! async*/ function runfx(opts)
{
debug("runfx opts", opts);
    if (opts.ctlr) runfx.ctlr = opts.ctlr;
    if (opts.layout) runfx.layout = opts.layout;
    runfx.seqnum = runfx.ctlr.seqnum;
//    yalp.on("frame", got_frbuf);
    opts.await_frame = await_frame;
//    if (!opts.fx) throwx("no fx to run");
    if (!opts.model) opts.model = opts.fx; //use fx/seq as model
//    /*const*/ opts.model.pending = {seqnum: yalp.seqnum}; //model should only have 1 fx, so put pending frbuf req there
//    if (!opts.start) opts.start = 0;
//    if (!opts.duration) opts.duration = ??;
//    if (!opts.fps) opts.fps = yalp.fps || 1;
//    if (!opts.seqnum) opts.seqnum = yalp.seqnum;
//    opts.model.timestamp = elapsed();
    runfx.latest = {got_frbuf}; //kludge: allow seq to incl self evth; CAUTION: must be set < calling fx()
//    const retval = opts.fx(opts); //promise to wait for fx/seq to finish
//debug("here1");
//    opts.model.stats = 0;
    const retval = new Promise(async (resolve, reject) => resolve(await opts.fx(opts)));
    opts.model.idle = true;
//    const now = elapsed();
//    opts.model.busy_time += now - opts.model.timestamp; //opts.model.timestamp = now;
debug(`'${opts.model.name || srcline(+1)}' fx perf: `.brightCyan, opts.model.stats);
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
//        const now = elapsed();
        if (!frbuf || frbuf.seqnum != pending.seqnum) { opts.model.busy = true; return pending.resolve(); } //eof or cancel; TODO: figure out why must return here for seq to exit correctly
        pending.got_time = frbuf.timestamp;
        if (frbuf.timestamp >= pending.want_time) { opts.model.busy = true; return pending.resolve(frbuf); } //got desired frame
//debug("exit got_frbuf");
    }
    async function await_frame(want_time) //seqnum,
    {
//        const now = elapsed();
        opts.model.idle = true; //busy_time += now - opts.model.timestamp; opts.model.timestamp = now;
        const pending = opts.model.pending || (opts.model.pending = {}); //model should only have 1 fx, so put pending frbuf req there
        [pending.seqnum, pending.want_time] = [runfx.seqnum, want_time];
//debug("await_frame {%'d, %'d}", seqnum, want_time);
        const frbuf = runfx.ctlr.newer(runfx.seqnum, want_time); //non-blocking
        if (frbuf) return frbuf; //no need to wait; allow fx to pre-render
        return pending.promise = new Promise((resolve, reject) => { [pending.resolve, pending.reject] = [resolve, reject]; });
    }
}


///////////////////////////////////////////////////////////////////////////////
////
/// misc helpers/utils
//

//request or cancel run after current I/O completes:
//inline debug/unit test can cancel scheduler
my_exports({run});
function run(main)
{
    if (run.what) clearImmediate(run.what); //cancel previous
    run.what = main && !run.what /*hasOwnProperty("what")*/ && setImmediate(main); //allow inline init and I/O to finish first, but only if not already decided
//    else run.what = null; //Object.defineProperty(run, "what", {value: null}); //kludge: prevent other calls
}

//eof