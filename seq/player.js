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
const {my_exports, find_files, json_fixup, revive_re, shortpath, isRE, /*lazy_load,*/ sleep, elapsed, plural, isdef, throwx} = require("yalp/incl/utils");
const {debug, warn, log, errlog, fmtstr, TODO, srcline} = require("yalp/incl/msgout");
//const {stats: color_stats} = require("yalp/incl/colors");
//const {TODO} = require("yalp/incl/utils");
//srcline.me = Path.basename(__file); //kludge: show "me" in debug msgs


//obj.defineProperty attrs:
const enumerable = true, configurable = true;


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


my_exports({runfx}); //allow seq to use; CAUTION: must export before loading seq (circular dep)


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

//don't show error if module !exists:
require.quietResolve = function(...args) { try { return require.resolve(...args); } catch (exc) {}; };


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
debug("seq args: get/set layout '%s'", layoutname);
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
//debug("set/get default layout '%s'", this.has_layout.name);
                return this.has_layout; //|| await sleep(5e3); //reduce log diarrhea
            },
            enumerable,
//no worky            writable: true, //allow lazy-load to overwrite self
        },
//other props dependent on layout or ctlr:
        seqnum: { get: function() { return this.layout.use_seqnum; }, enumerable, },
        fps: { get: function() { return 1e6 / this.layout.ctlr.frtime; }, enumerable, },
    });
//    if (opts.ctlr) runfx.ctlr = opts.ctlr;
//    if (opts.layout) runfx.layout = opts.layout;
//    runfx.seqnum = runfx.ctlr.seqnum;
//    const seqdata = /*workerize*/(seqfiles[0].entpt()); //delegate seq to use wkers if needed
//    runfx.ctlr = ctlr;
//    runfx.seqnum = ctlr.seqnum;
//    runfx.layout = layout;
//try/catch: the show must go on :P
TODO("re-instate try/catch");
    /*try*/ { await runfx(args).await4done; }
    /*catch*/async function nocatch (exc) { errlog("playback error: %s".brightRed, exc); await sleep(5e3); } //wait 5 sec to reduce log diarrhea
//debug("player finish".brightGreen);
//TODO("append seq stats to csv file");
    const ctlr = args.layout.ctlr;
    log("playback done: elapsed %'d vs %'d msec, #fr %'d (%2.1f fps), %%busy %2.1f, %%emit %2.1f, %%idle %2.1f".brightGreen, ctlr.elapsed, Math.round((ctlr.busy_time + ctlr.emit_time + ctlr.idle_time) / 1e3), ctlr.numfr, ctlr.elapsed? ctlr.numfr * 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.busy_time / 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.emit_time / 1e3 / ctlr.elapsed: 0, ctlr.elapsed? 100 * ctlr.idle_time / 1e3 / ctlr.elapsed: 0);
}


//add name prop if !already there:
//try to append if already there
function addname(obj, name)
{
    const has_name = (obj || {}).name;
debug("add name '%s'? %d", name, +!has_name); //(obj || {}).name);
    try { return Object.assign(obj /*|| {}*/, {name: /*(obj || {}).name*/ has_name? obj.name + " " + name: name}); }
    catch (exc) { debug("nope, name was read-only"); return obj; }
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
debug("load %s '%s', want_func? %s, typeof %s", type, retname, JSON.stringify(want_func), typeof retval);
    return addname((want_func !== false && typeof retval == "function")? retval(): retval, retname);
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
//    .filter(({exports}) => typeof exports.seq == "function") //check for exported seq() function
//    .map(({exports, filepath}) => ({exports, filepath, name: shortpath(filepath), })); //audio: exports.audio}));
debug(plural(retval.length), expname, `file${plural()} remaining`);
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
//my_exports({runfx}); //allow seq to use
/*NOT! async*/ function runfx(opts)
{
//debug("runfx opts", Object.keys(opts)); //, opts.seqnum, opts.fps);
//    if (opts.ctlr) runfx.ctlr = opts.ctlr;
//    if (opts.layout) runfx.layout = opts.layout;
//    runfx.seqnum = runfx.ctlr.seqnum;
//    yalp.on("frame", got_frbuf);
    if (!(opts.fx || opts.seq)) throwx("no fx/seq to run");
    if (!opts.model) opts.model = opts.fx || opts.seq; //use fx/seq as model?
    Object.assign(opts, {await_frame, got_frbuf}); //make these available to fx/seq
    if (!opts.start) opts.start = 0; //default (immediate)
    if (!opts.duration) opts.duration = 1e3; //default?
    if (opts.seq) runfx.seq_opts = opts; //save seq info to pass along to fx
//    else Object.defineProperties(opts, {layout, seqnum, fps}); //give fx access to seq layout/ctlr info; CAUTION: lazy load
    else Object.keys(runfx.seq_opts) //"inherit" seq opts by fx
        .filter(prop => !(prop in opts))
//        .map(prop => debug(prop))
        .forEach(prop => opts[prop] = runfx.seq_opts[prop]);
//    if (!opts.fps) opts.fps = opts
//    /*const*/ opts.model.pending = {seqnum: yalp.seqnum}; //model should only have 1 fx, so put pending frbuf req there
//    if (!opts.start) opts.start = 0;
//    if (!opts.duration) opts.duration = ??;
//    if (!opts.fps) opts.fps = yalp.fps || 1;
//    if (!opts.seqnum) opts.seqnum = yalp.seqnum;
//    opts.model.timestamp = elapsed();
//    runfx.latest = {got_frbuf}; //kludge: allow seq to incl self evth; CAUTION: must be set < calling fx()
//    const retval = opts.fx(opts); //promise to wait for fx/seq to finish
//debug("here1");
//    opts.model.stats = 0;
//debug("run %s '%s'", opts.fx? "fx": opts.seq? "seq": "??", (opts.fx || opts.seq).name || "thing" + srcline(+1));
    const await4done = /*new Promise(async (resolve, reject) => resolve(await*/ (opts.fx || opts.seq)(opts);
    opts.model.idle = true;
//    const now = elapsed();
//    opts.model.busy_time += now - opts.model.timestamp; //opts.model.timestamp = now;
//debug(`'${opts.model.name || srcline(+1)}' fx perf: `.brightCyan, opts.model.stats || {});
//debug("here2", !!retval.then);
//    yalp.off("frame", got_frbuf);
//    return retval; //in case caller wants retval
    return {got_frbuf, await4done}; //return frbuf evt handler + fx promise
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
        if (!frbuf || frbuf.seqnum != opts.seqnum) { opts.model.busy = true; return pending.resolve(); } //eof or cancel; TODO: figure out why must return here for seq to exit correctly
        pending.got_time = frbuf.timestamp;
        if (frbuf.timestamp >= pending.want_time) { opts.model.busy = true; return pending.resolve(frbuf); } //got desired frame
//debug("exit got_frbuf");
    }
    async function await_frame(want_time) //seqnum,
    {
//        const now = elapsed();
        opts.model.idle = true; //busy_time += now - opts.model.timestamp; opts.model.timestamp = now;
        const pending = opts.model.pending || (opts.model.pending = {}); //model should only have 1 fx, so put pending frbuf req there
        [pending.seqnum, pending.want_time] = [opts.seqnum, want_time];
//debug("await_frame {%'d, %'d}", seqnum, want_time);
//debug(Object.keys(opts));
        const frbuf = opts.layout.ctlr.newer(opts.seqnum, want_time); //non-blocking
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