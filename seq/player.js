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
const {my_exports, find_files, tostr, json_fixup, revive_re, shortpath, isRE, /*lazy_load,*/ sleep, elapsed, plural, isdef, throwx} = require("yalp/incl/utils");
const {debug, warn, log, errlog, fmtstr, TODO, srcline} = require("yalp/incl/msgout");
//const {stats: color_stats} = require("yalp/incl/colors");
//const {TODO} = require("yalp/incl/utils");
//srcline.me = Path.basename(__file); //kludge: show "me" in debug msgs


//obj.defineProperty attrs:
const enumerable = true, configurable = true, writable = true;


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
//this is async to allow player/seq/fx to run in parallel; async overhead doesn't matter here
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
process.once('exit', () => debug("exit".brightCyan));

//my_exports({runfx}); //allow seq to use; CAUTION: must export before loading seq (circular dep)
//don't show error if module !exists:
require.quietResolve = function(...args) { try { return require.resolve(...args); } catch (exc) {}; };

//dummy frbuf (mainly for debug):
const NOFR = {seqnum: -1, frnum: -1, timestamp: -99};


//kludge: redirect layout/seq debug output to file:
const addon = require("yalp");
const fd = fs.openSync("data/loader.log", "w"); //"a"

//NOTE: can't create+destroy+recreate YALP shm ctlr due to node.js "Check failed: result.second" problem
//work-around: delay loading layout/ctlr until needed; feasible if relatively few layouts
addon.debout = fd; //redirect debug output to file
const layouts = choices(find_files(cfg.layout || "../layouts/**/!(bkup|*-bk*)/**/*.js") || [], "layout");
addon.debout = process.stdout.fd; //send debug output back to console
debug("%d layout%s found: %s", plural(layouts.length), plural(), layouts.map(layout => layout.name).join(", ")); //.map(layout => layout.filepath)); //shortpath(layout.filepath)));

//find + cache seq files ahead of time: (could be many seq and they are played multiple times)
addon.debout = fd; //redirect debug output to file
const seqfiles = choices(find_files(playlist.folder || __dirname) || [], "seq");
addon.debout = process.stdout.fd; //send debug output back to console
debug(seqfiles.length, "seq found:", seqfiles.map(seq => seq.name).join(", ")); //.map(seq => seq.filepath)); //shortpath(seq.filepath)));

debug("(see data/loader.log for additional debug info)");
fs.closeSync(fd);


//start seq playback:
//seq is responsible for mp3/mp4 playback
//seq .js must export seq; also layout, ctlr if they are custom
//caller can pass in func or pre-instantiated seq instead of file name
//short-form/partial seq names can be used as long as unique within seq folder
my_exports({player}); //allow reuse by custom code
async function player(seqname)
{
debugger;
    const seq = loadfile(seqname, seqfiles, false);
    if (!seq) return await sleep(5e3); //reduce log diarrhea
    ++player.count || (player.count = 1);
//pkg seq cfg options to pass to seq:
//some props must be lazy-loaded; layout unknown until seq starts
    const args = Object.defineProperties({seq},
    {
        layout: //if seq asks for layout it likely doesn't have its own custom layout
        {
            set: function(layoutname)
            {
//NOTE: caller must get/set layout in order to get/set seqnum/seqname correctly
                if (this.has_layout) throwx("layout '%s' already set", this.has_layout.name); //layout can't change during seq; allow set 1x only
//debug("seq args: get/set layout '%s'", layoutname);
//get all layout/ctlr info here to avoid recursion into seqnum getter
//CAUTION: avoid using "this.layout" (causes recursion)
                Object.defineProperty(this, "has_layout", {value: loadfile(layoutname, layouts)}); //lazy load, !enum, !writable
//NOTE: caller is responsible for below if using its own custom layout:
                this.has_layout.use_seqnum = this.has_layout.ctlr.recycle(); //start new seq
                this.has_layout.ctlr.seqname = this.seq.name; //seqfiles[0].name; // || seqfiles[0].name;
//debug("set/get seq# %'d, name '%s'", this.has_layout.use_seqnum, this.has_layout.ctlr.seqname);
            },
            /*async*/ get: function()
            {
                if (!this.has_layout) this.layout = ""; //use setter to get default layout + seq#
//debug("get layout '%s'", this.has_layout.name, srcline(+1), srcline(+2), srcline(+3));
                return this.has_layout; //|| await sleep(5e3); //reduce log diarrhea
            },
            enumerable,
//no worky            writable: true, //allow lazy-load to overwrite self
        },
//other props dependent on layout or ctlr:
        seqnum: { get: function() { return this.layout.use_seqnum; }, enumerable, },
        fps: { get: function() { return 1e6 / this.layout.ctlr.frtime; }, enumerable, },
//dedault values for misc other props:
//        start: 0,
//        duration: 10e3,_finder.nex
    });
    await sleep(5e3); //async test
//try/catch: the show must go on :P
TODO("re-instate try/catch");
//    /*try*/ { await runfx(args).await4done; } //(); }
//    /*try*/ { yield runfx(args).yield2done; } //(); }
    const seqstart = Date.now();
debugger;
    const retval = await runfx(args).complete;
//    debug("seq retval", retval);
    /*catch*/async function not_catch (exc) { errlog("playback error: %s".brightRed, exc); await sleep(5e3); } //wait 5 sec to reduce log diarrhea
//debug("player finish".brightGreen);
//TODO("append seq stats to csv file");
    const ctlr = args.layout.ctlr;
    log("playback done: elapsed %'d js vs %'d ctlr vs %'d frloop msec, #fr %'d (%2.1f fps), %%busy %2.1f, %%emit %2.1f, %%idle %2.1f".brightGreen, Date.now() - seqstart, ctlr.elapsed, Math.round((ctlr.busy_time + ctlr.emit_time + ctlr.idle_time) / 1e3), ctlr.numfr, ctlr.elapsed? ctlr.numfr * 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.busy_time / 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.emit_time / 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.idle_time / 1e3 / ctlr.elapsed: 0);
}


/*async*/ function runfx(opts)
{
    const caller_opts = Object.getOwnPropertyNames/*Descriptors*/(opts); //save names before adding any
//debug(caller_opts);
//attach run-time props to caller's opts, !enum (quasi-hidden), !wr:
    if (!(opts.fx || opts.seq)) throwx("no fx/seq to run?");
    if (!opts.model) opts.model = {}; //opts.fx || opts.seq; //NO (might be >1)- use fx/seq as model?
//    Object.assign(opts, {/*await_frame, runfx,*/ got_frbuf}); //make these available to fx/seq
    if (!opts.start) opts.start = 0; //default (immediate)
    if (!opts.duration) opts.duration = 1e3; //default?
//put frbuf rcv stats on model for easier trace stats:
    if (opts.model.pending) throwx(`model '${opts.model.name}' is already running ${opts.model.pending.fxname}`);
    opts.model.pending = {get fxname() { return `${opts.type} '${(opts.fx || opts.seq).name || srcline(+1)}'`; }}; //Object.defineProperties({}, //only 1 fx should run on model, attach pending frbuf req
//    {
//        caller_waited: {value: 0, writable}, //explicit (override) value from caller
//        waited:
//        {
//            get() { debug("%s latency: rcv@ %'d, wait@ %'d", opts.type, this.rcvtime - Date.now(), this.startwait - Date.now()); return this.caller_waited || this.rcvtime - this.startwait; }, //kludge: allows latency of 0 for future value
//            set(newval) { this.caller_waited = newval; }, //kludge: allow override
//            enumerable,
//        },
//    });
//add hidden options:
    Object.defineProperties(opts,
    {
        type: {value: opts.fx? "fx": "seq", enumerable},
        children: {value: []},
        names: {value: caller_opts}, //remember props to inherit by children (clean state)
        got_frbuf: {value: got_frbuf}, //allow seq to step fx
//        wait4frame: {value: wait4frame},
//        runfx: {value: (opts) => runfx(Object.defineProperty(opts, "runfx", {val}))},
        complete: {value: /*await*/ wrap(new Promise(value => Object.defineProperty(opts, "resolve", {value}))), enumerable}, //promise to complete + resolver; CAUTION: must exist < running fx/seq
        gen: {value: (opts.fx || opts.seq)(opts, wait4frame, nested_runfx)}, //generator func (sync); NOTE: doesn't run fx/seq yet
    });
//    return new Promise((resolve, reject) => { [pending.resolve, pending.waited] = [resolve, Date.now()]; }); //blocking
debug("runfx %s opts:", opts.type, Object.keys(opts).reduce((cat, name) => (cat[(~(opts.inh_debug || []).indexOf(name)? "inh": !~caller_opts.indexOf(name)? "def": "arg")].push(name), cat), {arg: [], def: [], inh: []})); ///*Object.keys*/(opts.inh).filter(name => !(name in opts)));
//start running fx/seq:
    opts.gen.next(); //allow fx/seq to init + pre-render < first frame
//    return !opts.seq /*|| runfx.bkg)*/? retval: //fx or bkg already running, just return fx/seq promise
    return opts;

//wrapper to start/stop bkg loop around seq:
    function wrap(complete)
    {
        if (/*!opts.seq*/ opts.fx) return complete; //CAUTION: seq inherits; need to check fx
        return new Promise(async function wrapper(resolve) //=>
        {
//            const bkg = setInterval(bkg_shim, 0.4e3, {numfr: 0, started: Date.now() + 0.4e3}); //start bkg loop
            if (true)
            {
                const bkg_state = {numfr: 0, started: Date.now() + 0.4e3};
                opts.layout.ctlr.updloop = got_frbuf => setInterval(state => bkg_shim(state, got_frbuf), 0.4e3, bkg_state);
                opts.layout.ctlr.cancel = () => (/*debug("cancel", opts.layout.ctlr.bkg),*/ clearInterval(opts.layout.ctlr.bkg), bkg_state.numfr);
            }
            opts.layout.ctlr.got_frbuf = got_frbuf;
            const seq_complete = await complete; //Promise.all([complete, opts.children.map(fx => fx.complete)]);
//debug("seq resolved, wait for %d fx", opts.children.length);
            await Promise.all(opts.children.map(fx => fx.complete)); //wait for active children @eo seq
//debug(opts.children.length, "fx resolved");
//            clearInterval(bkg); //stop bkg loop
            const retval = opts.layout.ctlr.cancel(); //opts.layout.ctlr.bkg? debug("stop bkg loop > seq", retval) && opts.layout.ctlr.cancel(): 0; opts.layout.ctlr.bkg = null;
            resolve(seq_complete);

            /*async*/ function bkg_shim(state, got_frbuf)
            {
//                const timestamp = state.started? Date.now() - state.started: (state.started = Date.now(), 0); //msec
//debug("bkg_shim");
                const now = Date.now();
                const frbuf =
                {
                    seqnum: opts.seqnum,
                    frnum: state.numfr++,
                    timestamp: /*!state.started? (state.started = now, 0):*/ now - state.started, //msec
//wrong place:                    get latency() { return opts.model.pending.waited; },
                    wsnodes: Array.from({length: 24}).map(_ => new Uint32Array(100)),
                };
//debug("frbuf", frbuf);
                /*await*/ got_frbuf(frbuf);
            }
        });
    }
    function nested_runfx(nested_opts)
    {
//        [retval.layout, retval.seqnum, retval.fps] = [opts.layout, opts.seqnum, opts.fps]; //inherited props
//        /*Object.entries*/(opts.inh) //Object.getOwnPropertyDescriptors(opts))
        const inh = opts.names.filter(name => !(name in nested_opts));
//        if (inh.length) debug("inh props:", inh);
        Object.defineProperty(nested_opts, "inh_debug", {value: inh}); //debug info
//        opts.inh
//            .forEach(/*([name, propdesc])*/ name => !(name in more_opts) && /*debug("inh prop", name, typeof opts[name], (JSON.stringify(opts[name]) || opts[name].toString() || "(none)").slice(0, 100)) &&*/ Object.defineProperty(more_opts, name, {get() { return opts[name]; }})); //propdesc)); //inherit props, don't eval getters yet
        inh.forEach(name => Object.defineProperty(nested_opts, name, {get() { return opts[name]; }, enumerable})); //propdesc)); //inherit props, don't eval getters yet
        const retval = runfx(nested_opts);
        opts.children.push(retval);
        return retval;
    }
//minimal function to encapsulate wait info:
    function wait4frame(want_msec)
    {
        opts.model.busy = false;
        const pending = opts.model.pending; //|| {};
        [pending.seqnum, pending.want_msec, pending.startwait] = [opts.seqnum, Math.max(Math.trunc(want_msec), (pending.gottime + 1) || 0), elapsed()]; //Date.now()]; //CAUTION: caller might want fractional msec; round down to get closest frame, but get frame later than previous
//        if (opts.seq) //seq should fwd all frbuf to fx; only seq needs to read ahead
        if (want_msec && !opts.layout.ctlr.bkg) //start bkg loop > initial frame pre-render
        {
            opts.layout.ctlr.bkg = opts.layout.ctlr.updloop(frbuf => (/*debug("evth {%'d, %d=%'d} => evth".brightCyan, (frbuf || NOFR).seqnum, (frbuf || NOFR).frnum, (frbuf || NOFR).timestamp),*/             opts.layout.ctlr.got_frbuf(frbuf))); //launch bkg upd loop to wake evth when frbuf available
debug("%s start bkg loop > pre-render: bkg", opts.type, opts.layout.ctlr.bkg);
        }
        const frbuf = opts.layout.ctlr.newer(pending.seqnum, pending.want_msec); //non-blocking
//debug("await4frame %'d msec %s: found newer {%d, %d=%'d}"[frbuf? "brightGreen": "brightRed"], want_time, srcline(+1), (frbuf || NOFR).seqnum, (frbuf || NOFR).frnum, (frbuf || NOFR).timestamp);
        if (frbuf) got_frbuf(frbuf); //no need to wait; allows fx to pre-render
//debug("%s wait4frame: seqnum %d, %'d msec, start wait %'d", opts.type, pending.seqnum, pending.want_msec, pending.startwait - elapsed()); //Date.now());
//        (opts.model || {}).pending = msec;
//        opts.startwait = Date.now();
//        opts.wait4msec = msec;
//        return `wait4frame(${msec})`; // return dummy value (for debug)
    }
//frbuf event handler (synchronous):
    /*async*/ function got_frbuf(frbuf)
    {
        opts.model.busy = true;
        const pending = opts.model.pending; //|| {};
        [pending.rcvtime, pending.gottime] = [/*Date.now()*/ elapsed(), (frbuf || NOFR).timestamp];
        const latency = pending.rcvtime - pending.startwait;
        const want_wake = (frbuf || NOFR).timestamp >= (pending.want_msec || 0); //opts.wait4msec);
//debug("%s got frbuf T+%'d, wanted %'d msec, has gen? %d, wake? %d, #children %d, latency %'d", opts.type, (frbuf || NOFR).timestamp, pending.want_msec, +!!opts.gen, +want_wake, opts.children.length, latency);
//?        opts.model.busy = false;
TODO("prune children?");
        opts.children
            .filter(fx => fx.model.pending) //send only to children waiting for frbuf (actiev fx)
            .forEach(fx => fx.got_frbuf(frbuf)); //dispatch to child fx first?
//        opts.model.busy = false;
        if (!opts.gen || !want_wake) { opts.model.busy = false; return; } //"(still sleeping)";
//        opts.model.busy = true;
        if ((frbuf || NOFR).seqnum != pending.seqnum) { debug("got_frbuf: '%s' !frbuf/cancel %'d".brightRed, opts.model.name, (frbuf || NOFR).seqnum); opts.model.busy = false; return; } //pending.resolve(); } //eof or cancel; TODO: why must return here for seq to exit correctly?
        pending.want_msec = 1e6 - 1; //kludge: prevent wake up for next frame unless seq/fx wants it
//        opts.model.busy = false;
        const child_frbuf = Object.assign({latency}, frbuf); //each fx could have different latency
        const step = /*await*/ opts.gen.next(child_frbuf); //need "await" because seq is async (returns promise)? fx is not
//        opts.model.busy = true;
//debug("%s step result: val %s, done? %s", opts.type, tostr(step.value), tostr(step.done));
        if (step.done) { if (opts.fx) opts.model.pending = null; opts.resolve(step.value); } //free up model for more fx, allow seq wrapper to finish
//        opts.model.busy = false;
        return step;
    }
}
//const x = {}; debug(typeof x.y + 1, (x.y + 1) || 123); process.exit();
//const something = (function()
//{
//    let nextval;
const ignore_something =
{
    [Symbol.iterator]: function() { return this; }, //allows generator to be used in for..of
    next: function()
    {
        this.nextval = this.nextval? 3 * this.nextval + 6: 1;
        return {done: this.nextval >= 50, value: this.nextval};
    },
};
//})();


//run async fx or seq:
//NOTE: only 1 fx per model (else conflicting updates), but allow mult model per fx
//=> list of model+fx waiting for frbufs; attach promise to model + await
//NOTE: seq is just another (hierarchical, composite) fx, uses same frbuf/evt framework as fx
//can't sync GPU to external events, so use GPU frames as primary timing source
//evt emitter + promise seems like less overhead than async wker per frame, uses fewer threads
//moved up: my_exports({runfx}); //allow seq to use
//NOTE: promises are resolved on the next time thru the event loop, making them slower; use generators instead
/*NOT! async*/ function prev_runfx(opts)
{
debug("runfx opts", Object.keys(opts)); //, opts.seqnum, opts.fps);
debugger;
//    yalp.on("frame", got_frbuf);
    if (!(opts.fx || opts.seq)) throwx("no fx/seq to run?");
    if (!opts.model) opts.model = opts.fx || opts.seq; //use fx/seq as model?
//    Object.assign(opts, {/*await_frame, runfx,*/ got_frbuf}); //make these available to fx/seq
    if (!opts.start) opts.start = 0; //default (immediate)
    if (!opts.duration) opts.duration = 1e3; //default?
    opts.model.pending = Object.defineProperties({}, //only 1 fx can run on model, put pending frbuf req there
    {
        caller_waited: {value: 0, writable}, //explicit waited value from caller
        waited:
        {
            get() { return this.caller_waited || this.rcvtime; }, //kludge: allows latency of 0 for future value
            set(newval) { this.caller_waited = newval; }, //kludge: allow override
            enumerable,
        },
    });
//debug(JSON.stringify(Object.getOwnPropertyDescriptor(pending, "waited"))); wr, enum, cfg
    const retval = Object.assign(opts, {got_frbuf, yield2done: yield2done()}); //await4done: await4done()}); //return frbuf evt handler + fx/seq promise
//debug("runfx ret opts", Object.keys(retval), typeof opts.await4done);
    return retval;

    async function await4done()
    {
//        new Promise(async (resolve, reject) => resolve(await(
//debug("await4done ...");
        opts.runfx = function(child_opts)
        {
            Object.keys(opts) //"inherit" seq opts by fx
                .filter(prop => !(prop in child_opts) && !~["fx", "seq"].indexOf(prop))
//        .map(prop => debug(prop))
                .forEach(prop => child_opts[prop] = opts[prop]);
            return runfx(child_opts); //async retval; caller can await
        }
debug("await4done %s", opts.fx? "fx".brightCyan: opts.seq? "seq".brightCyan: "(unknown)".brightRed);
        const retval = await (opts.fx || opts.seq)(opts, await4frame);
debug("awaited %s, kill bkg? %d", opts.fx? "fx": opts.seq? "seq": "(unknown)", +!!opts.layout.ctlr.bkg);
        if (opts.layout.ctlr.bkg)
        {
            opts.layout.ctlr.cancel(); //exit from frame upd loop
//debug("here0", typeof bkg, !!bkg.then);
//    await sleep(5e3);
            const numfr = await opts.layout.ctlr.bkg;
debug("%'d frame%s processed (%'d msec)", plural(numfr), plural(), Math.round(numfr * 1e3 / opts.fps));
            opts.layout.ctlr.bkg = null;
        }
        return retval;
    }
    async function await4frame(want_time)
    {
        opts.model.busy = false;
        const pending = opts.model.pending; //|| {};
        [pending.seqnum, pending.want_time] = [opts.seqnum, Math.max(Math.trunc(want_time), isdef(pending.gottime, pending.gottime + 1, 0))]; //CAUTION: caller might want fractional msec; round down to get closest frame, but get frame later than previous
        if (opts.seq) //seq should fwd all frbuf to fx; only seq needs to read ahead
        {
            const frbuf = opts.layout.ctlr.newer(pending.seqnum, pending.want_time); //non-blocking
debug("await4frame %'d msec %s: found newer {%d, %d=%'d}"[frbuf? "brightGreen": "brightRed"], want_time, srcline(+1), (frbuf || NOFR).seqnum, (frbuf || NOFR).frnum, (frbuf || NOFR).timestamp);
            if (frbuf)
            {
                [pending.resolve, pending.waited] = [(buf) => buf, 0];
                return got_frbuf(frbuf); //no need to wait; allows fx to pre-render
            }
        }
        if (!opts.layout.ctlr.bkg) opts.layout.ctlr.bkg = opts.layout.ctlr.updloop(frbuf => (debug("evth {%'d, %d=%'d} => evth".brightCyan, (frbuf || NOFR).seqnum, (frbuf || NOFR).frnum, (frbuf || NOFR).timestamp), got_frbuf(frbuf))); //launch bkg upd loop to wake evth when frbuf available
        return new Promise((resolve, reject) => { [pending.resolve, pending.waited] = [resolve, Date.now()]; }); //blocking
    }
    function got_frbuf(frbuf)
    {
        opts.model.busy = true;
        const pending = opts.model.pending; //|| {};
        if (!pending.resolve) return debug("got_frbuf: '%s' no frbuf req pending".brightRed, opts.model.name); //caller !waiting for frbuf?
        [pending.rcvtime, pending.gottime] = [Date.now(), (frbuf || NOFR).timestamp];
//debug("pending", pending.rcvtime, pending.waited);
        if (!frbuf || frbuf.seqnum != pending.seqnum) { debug("got_frbuf: '%s' !frbuf/cancel %'d".brightRed, opts.model.name, (frbuf || NOfr).seqnum); return pending.resolve(); } //eof or cancel; TODO: why must return here for seq to exit correctly?
//debug(typeof pending.rcvtime, typeof pending.waited, typeof frbuf.seqnum, typeof frbuf.frnum, typeof frbuf.timestamp, typeof frbuf.wsnodes, typeof Object.assign({latency: 0}, frbuf).frnum, Object.keys(Object.assign({latency: 0}, frbuf))); //TODO: why undefs?
        if (frbuf.timestamp >= pending.want_time) { debug("got_frbuf: '%s' found %d=%'d, latency = %'d msec".brightGreen, opts.model.name, frbuf.frnum, frbuf.timestamp, pending.rcvtime - pending.waited); return pending.resolve(/*broken: Object.assign({latency: pending.rcvtime - pending.waited}, frbuf)*/ {seqnum: frbuf.seqnum, frnum: frbuf.frnum, timestamp: frbuf.timestamp, wsnodes: frbuf.wsnodes, latency: pending.rcvtime - pending.waited}); } //, frbuf}); } //got desired frame
debug("got_frbuf: '%s' ignore %'d", opts.model.name, frbuf.timestamp);
        opts.model.busy = false;
    }
}


//file filter:
//looks for exported property
function choices(files, expname)
{
    const want_unload = (expname == "seq");
debug(files.length, expname, "files, unload?", want_unload);
//https://nodejs.org/api/modules.html#modules_require_resolve_request_options
    const retval = files
        .map(filepath => require.resolve(filepath))
        .map(filepath => ({wasloaded: require.cache[filepath], filepath})) //CAUTION: need extra "()"
        .map(modinfo => Object.assign(modinfo, {exports: require(/*DEVTEST ||*/ modinfo.filepath)})) //load seq exports
        .map(modinfo => (expname in modinfo.exports)? Object.assign(modinfo, {name: (modinfo.exports[expname].name || "").replace(new RegExp("^" + expname + "$", ""), "") || shortpath(modinfo.filepath)}): modinfo) //kludge: use "in" to avoid "Accessing non-existent property" warning
        .map(modinfo => (want_unload && !modinfo.wasloaded && delete require.cache[modinfo.filepath], modinfo)) //don't leave it loaded (ctlr settings might conflict with other layouts)
        .filter(({exports}) => expname in exports) //~exports.indexOf(expname)) //&& exports.layout && exports.ctlr) //check for exported seq, layout + ctlr; //kludge: use "in" to avoid "Accessing non-existent property" warning
        .map(modinfo => (debug(Object.keys(modinfo.exports), modinfo.filepath), modinfo));
debug(plural(retval.length), expname, `file${plural()} remaining`);
    return retval;
}


/*async*/ function loadfile(name, files, want_func)
{
//    const defname = "seq" + srcline(+1);
    const type = (files == seqfiles)? "seq": (files == layouts)? "layout": "file";
    const as_is = (typeof name == "function" || (typeof name == "object" && !isRE(name)));
//    if (type == "layout" && !files) files = 
    const matches =
//allow external caller to pass seq obj/func:
        as_is? [name]:
//don't allow        (typeof seqname == "object" && !isRE(seqname)) [addname(seqname, "seq" + srcline(+1))]: //NOTE: caller reponsible for passing correct args
//select .js file by name/re:
        ((!name || isRE(name) || !require.quietResolve(name))? files: choices([name])) //find within folder or allow path to anywhere
//            .map((fileinfo, inx, all) => (debug("file[%'d/%'d] '%s': check name against '%s'", inx, all.length, fileinfo.filepath, seqobj.source || seqobj), fileinfo))
            .filter(({filepath}) => isRE(name)? filepath.match(name): name? ~filepath.indexOf(name): true); //choose file
    if (matches.length != 1)
    {
        errlog("%s '%s' %s (%'d matches): %s".brightRed, type, (name || {}).source || name || desc + srcline(+1), !matches.length? "!found".brightRed: "ambiguous".brightYellow, matches.length, matches.map(({name}) => name).join(", ") || "(none)");
        return; //await sleep(5e3); //reduce log diarrhea
    }
    const [retval, retname] = as_is? [matches[0], type + srcline(+1)]: [require(matches[0].filepath)[type], matches[0].name];
debug("load %s '%s', want_func? %s, typeof %s", type, retname, JSON.stringify(want_func), typeof retval, srcline(+1), srcline(+2), srcline(+3));
    return addname((want_func !== false && typeof retval == "function")? retval(): retval, retname);
}


//add name prop if !already there:
//try to append if already there
function addname(obj, name)
{
    const has_name = (obj || {}).name;
//debug("add name '%s'? %d", name, +!has_name); //(obj || {}).name);
    try { return Object.assign(obj /*|| {}*/, {name: /*(obj || {}).name*/ has_name? obj.name + " " + name: name}); }
    catch (exc) { return obj; } //debug("nope, name '%s' was read-only", name); return obj; }
}


///////////////////////////////////////////////////////////////////////////////
////
/// misc helpers/utils
//

//request or cancel run after current I/O completes:
//inline debug/unit test can cancel scheduler
my_exports({run});
async function run(main)
{
    if (run.what) clearImmediate(run.what); //cancel previous
    if (main && typeof main != "function") throwx("expected function: " + typeof main);
    run.what = main /*&& !run.what /*hasOwnProperty("what")*/ && setImmediate(async function() { await main(); }); //allow inline init and I/O to finish first, but only if not already decided
//    else run.what = null; //Object.defineProperty(run, "what", {value: null}); //kludge: prevent other calls
    
    function stepper()
    {
        for (const nextval of main) //generator
//    for (let nextval; !(nextval = main.next("pass back val")).done; )
            debug(`'${main.name}' stepper nextval:`, nextval);
    }
}

//eof