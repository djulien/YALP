#!/usr/bin/env node
//YALP Vixen 2 seq player

//history:
//12/22/20 1.0 DJ execute directly from .vix 2 file

//setup:
//?? lame
//sudo apt install mpg123  #mpg321?
//sudo apt-get install alsa-tools alsa-utils
//requires raspi-config : Advanced, audio on; also i2c in /boot/config.txt?

'use strict'; //find bugs easier
//const glob = require("glob");
const Path = require("path");
const fs = require("fs");
const xmldoc = require('xmldoc'); //https://github.com/nfarina/xmldoc
const assert = require('assert').strict; //https://nodejs.org/api/assert.html
const {debug, my_exports} = require("yalp21/incl/utils");
//pre-load to detect errors earlier:
//require('lame');
//require('speaker');

//no worky:
//const mpg = require('mpg123'); //https://github.com/dominictarr/mpg123
//    const player = new mpg.MpgPlayer();
//    player.volume(20); //%
//    player.getProgress((...args) => debug("progress:", args));
//    player.on("format", () => debug(player.track, player.mpeg, player.sampleRate, player.channels, player.bitrate, player.length, player.samples));
//    player.play(audio); //__dirname+'/'+"someMusic.mp3");

//const {debug} = require("gpuport");
const {find_files, name2file, shortname, mp3play, commas, elapsed, hex, nn, isdef, plural, debug, TODO} = require("../incl/utils");
mp3play(); //pre-load to detect errors earlier
debug.max_arg_len = 400;
debug("loading vix2player");

my_exports({find_files});


my_exports({vix2player: main});
async function main(opts)
{
debugger;
//    const lyrics_timing = fs.readFileSync("./*.txt").toString();
//    const phrase_timing = fs.readFileSync("./*.cue").toString();
//    const vix2 = fs.readFileSync("./*.vix").toString();
//    const mp3 = fs.createReadStream("./*.mp3");
    const vixinfo = Vixen2(opts);
    const {vix2seq, duration, interval, numfr, numch, getchval, frinx2msec, chvals, vix2prof, chcolors, chnames, findch, audiolen, mp3file} = vixinfo;
debug("prof: '%s',\nseq: '%s',\nmp3: '%s',\n#fr %'d, #ch %'d, duration %'d msec, interval %'d msec, audiolen %'d msec".brightCyan, shortname(vix2prof), shortname(vix2seq), shortname(mp3file), numfr, numch, duration, interval, audiolen);

//debug(getchval(302, 0), getchval(303, 0), getchval(304, 0), getchval(302, 0, 3)); process.exit();
    if ((opts || {}).csv)
    {
        const chused = chnames
            .map((_, chinx) => chvals.slice(chinx * numfr, (chinx + 1) * numfr)) //all frvals for this ch
            .map((chvals, chinx) =>
            ({
                chinx,
//                frcount: chvals.length,
                first: chvals.findIndex((chval) => chval), //first non-0 value
                last: chvals.length - Array.from(chvals).reverse().findIndex((chval) => chval), //last non-0 value; CAUTION: clone to avoid changing source array
//                chvals.reverse(), //kludge: un-reverse; reversed copy seems to be stored somewhere
            })).reduce((lkup, {chinx, first, last}) => (~first && (lkup[chinx] = {first, last}), lkup), {});
        const want_empty = (opts.csv !== true) && chnames;
//debug(Path.dirname(vix2seq).split(Path.sep));
//debug(Path.dirname(vix2seq).split(Path.sep).top);
        const outuf = name2file(`${(opts || {}).label || `${Path.dirname(vix2seq).split(Path.sep).top}`}-usage.csv`);
        outuf.writeln('"ch#","name","first used","last used"');
        chused.forEach((chinx, {first, last}) => outuf.writeln(`"${chinx + 1}","${chnames[chinx]}","${frinx2time(first)}","${frinx2time(last)}"`));
        outuf.end();
        const outfile = name2file(`${(opts || {}).label || `${Path.dirname(vix2seq).split(Path.sep).top}`}-evts${want_empty? "-full": ""}.csv`);
//debug(chnames);
//debug(chused);
//debug(chvals.slice(0 * numfr, 1 * numfr));
//debug(chvals.slice(0 * numfr, 1 * numfr).findIndex((chval) => chval));
//debug(chused[0]);
//debug(chvals.slice(420 * numfr, (420+1) * numfr));
//debug(chvals.slice(421 * numfr, (421+1) * numfr));
//debug(chvals.slice(422 * numfr, (422+1) * numfr));
//debug(chvals.slice(420 * numfr, 421 * numfr).findIndex((chval) => chval));
//debug(chused[420], chused[421], chused[422]);
//debug(Object.keys(chnames));
//debug(Object.keys(chused));
        debug("ignoring %'d (empty) of %'d channels? %d", numch - Object.keys(chused).length, numch, +!want_empty);
        outfile.writeln(`"${commas(numfr)} x ${commas(numch)}",${Object.keys(want_empty || chused).map((chinx) => `"${chinx}:${chnames[chinx]}"`).join(",")}`);
        outfile.writeln(`"chcolors",${Object.keys(want_empty || chused).map((chinx) => `"${hex(chcolors[chinx] >>> 8)}"`).join(",")}`); //RGBA => RGB; TODO: show A in upper case, left pad
        outfile.writeln(`"first used",${Object.keys(want_empty || chused).map((chinx) => (chinx in chused)? `"${frinx2time(chused[chinx].first)}"`: `"-"`).join(",")}`);
        outfile.writeln(`"last used",${Object.keys(want_empty || chused).map((chinx) => (chinx in chused)? `"${frinx2time(chused[chinx].last)}"`: `"-"`).join(",")}`);
//        for (let frinx = 0; frinx < numfr; ++frinx)
//            outfile.writeln(`"${nn(frinx * interval / 1e3, 0.3)}",${Object.values(chnames).map((chinx) => `"${getch(frinx, chinx) || ""}"`).join(",")}`); //supress "0" channels
//        outfile.writeln(`"initial","${Object.values(chnames).map((chinx) => getch(0, chinx)}"`);
        for (let frinx = 0; frinx < numfr; ++frinx) //frtime += interval)
            if (!frinx || Object.keys(chused).some((chinx) => getchval(chinx, frinx) != getchval(chinx, frinx - 1))) //skip dup frames
                outfile.writeln(`"${frinx2time(frinx)}",${Object.keys(want_empty || chused).map((chinx) => `"${(!frinx || getchval(chinx, frinx) != getchval(chinx, frinx - 1))? getchval(chinx, frinx): "="}"`).join(",")}`); //supress "0" channels
        outfile.writeln("");
        outfile.writeln(`total ${commas(numfr)} frames = duration ${commas(duration)} msec`.split(/\s+/).map((str) => `"${str}"`).join(","));
        outfile.end();
//        outfile.close();
//        debug("wrote %'d lines to '%s'", outfile.numwrites, outfile.name);
        await outfile.wait4close();
        await outuf.wait4close();
        return;
    }
    function frinx2time(frinx) { return nn(frinx2msec(frinx) / 1e3, 0.3); } //Vixen2 timestamp

//    debug("pre-render first frames");
//    const frbuf = [];
    const {ctlr, NUM_UNIV, UNIV_LEN/*, Audio*/} = opts.controller();
    const ctlr_frtime = ctlr.frtime / 1e3; //usec -> msec; reduce calls into C++; value won't change
//    ctlr.fill(BLACK); //start all dark
//    await portids(ctlr); //show port#s for easier wiring debug
    debug("animation start: #univ %'d, UNIV_LEN %'d, frtime %'d msec, seq duration %'d msec, audio duration %'d msec".brightGreen, NUM_UNIV, UNIV_LEN, ctlr_frtime, interval * numfr, audiolen);

TODO("move this to vix2shim/layout?");
    const fx = [];
//    debug("starting %d model fx", Object.keys((opts || {}).models || {}).length);
//    for (const model of Object.values((opts || {}).models))
//        fx.push(model.vixfx(vixinfo)); //async; sends first frame immediately
//    ctlr.elapsed = 0; //reset performance stopwatch, sync with gpu refresh; do this as close as possible to music start

//    let audio_started = 0; //audio delay allows more frame pre-render time, but leaves sound out of sync with lights
TODO("delay sound playback til GPU vsync (inject null samples), or tween to get correct frame contents?");
//    ctlr.elapsed = 2; //sync to GPU, account for cb latency
    const LAG = 10; //varies a lot; use 1/2 frame? mp3 decodes ~ .4 sec ahead
//    const ctlr_frtime = ctlr.frtime / 1e3; //usec -> msec
    debug(`audio decode starts @T+${commas(elapsed())} msec`);
TODO("why no speaker flush evt?");
//    let pb_started = false;
//    const MP3_CBLATENCY = 5; //msec; FUD
    fx.push(new Promise((resolve, reject) =>
    {
    const mp3 = mp3play(mp3file, () => { ctlr.elapsed = /*audio_started =*/ LAG; }) //try to sync audio with GPU
//        .on("progress", ({timestamp, datalen}) => debug("mp3 progress: datalen %'d, timestamp %'d msec", datalen, timestamp))
//    mp3
//        .on('error', function (...args) { debug("mp3 error after ${commas(elapsed())} msec".brightRed, ...args); })
//        .on('progress', function ({datalen, timestamp}) { if (!((++this.count || (this.count = 1))) % 10) debug(`mp3 progress @T+${commas(elapsed())} msec`.brightGreen, commas(datalen), timestamp); }) //if (!datalen) audio_started = ctlr.elapsed; }) ///*ctlr.elapsed = MP3_CBLATENCY;*/ debug("pb set frnum to", ctlr.frnum = ctlr_frtime - audio_started); }) // /*1e3 / FPS*/; pb_started = true; }) //ctlr.elapsed = 0;
//        .on('finish', function (...args) { debug(`decode/enqueue finished @T+${commas(elapsed())} msec`.brightGreen, ...args); })
        .on('flush', function (...args) { debug(`speaker flushed @T+${commas(elapsed())} msec`.brightGreen, ...args); resolve(); })
        .on('error', function (...args) { debug(`error @T+${commas(elapsed())} msec`.brightRed, ...args); reject(); })
        .on('close', function (...args) { debug(`speaker closed @T+${commas(elapsed())} msec`.brightGreen, ...args); resolve(); })
//        .on('complete', function (...args) { console.log('playback complete after ${commas(elapsed())} msec'.brightGreen, ...args); });
    }));

//fx/wkers: render, wait, output, repeat
//main here: out+wait, pivot, request, repeat
//    for (let frinx = 0; frinx < numfr; ++frinx)
//    while (!audio_delay /*pb_started*/) await ctlr.out(); //wait for music to start
if (false)
    for (let i = 0; ; ++i) //await ctlr.out()) //wait for next frame
    {
        await ctlr.await4sync(); //out();
        if (!audio_started /*pb_started*/) continue; //wait for music to start
        const woke = ctlr.elapsed, next_frtime = Math.trunc((woke - audio_started) / ctlr_frtime) * ctlr_frtime;
        ctlr.out(-1); //pivot only (flush output); return immediately to wake fx/wkers
if (!(i % 60)) debug("ctlr elapsed %'d, audio started %'d, next fr time %'d, eof? %d", woke, audio_started, next_frtime, +(next_frtime > duration));
//        const next_frtime = ctlr.elapsed + 1e3 / FPS;
//debug("loop set frtime to", next_frtime);
//        ctlr.frnum = next_frtime; //ctlr.elapsed; //ask fx/wkers for next frame render
        if (next_frtime > duration) break;
    }
//        debug("vix2 playback/render", ctlr.elapsed);
//        await ctlr.out(); //1e3/5); //msec
//        if (timestamp >= duration) break;
//        ctlr.frnum = timestamp;
//    }

//async wrapper to run vix2 renderer and track total time:
debug("starting %d model fx", Object.keys((opts || {}).models || {}).length);
    const pbstart = Date.now();
    for (const model of Object.values((opts || {}).models))
    {
        model.wait4frame = async function(prev_time)
        {
//        const enter = ctlr.elapsed;
            this.busy += Date.now();
            for (;;)
            {
                await ctlr.await4sync(); //out();
//        if (!audio_started /*pb_started*/) continue; //wait for music to start
                const woke = ctlr.elapsed;
//            if (woke < 0) return 0; //remain on first frame while waiting for music to start
                const next_frtime = (woke >= 0)? Math.round(Math.ceil(woke / ctlr_frtime) * ctlr_frtime): 0; //msec
//        const next_frtime = audio_started? Math.trunc((woke - audio_started) / ctlr_frtime) * ctlr_frtime: 0;
            ctlr.out(-1); //pivot only (flush output); return immediately to wake fx/wkers
//if (!(i % 150)) debug("ctlr elapsed %'d, audio started %'d, next fr time %'d, eof? %d", woke, audio_started, next_frtime, +(next_frtime > duration));
//        const next_frtime = ctlr.elapsed + 1e3 / FPS;
//debug("loop set frtime to", next_frtime);
//        ctlr.frnum = next_frtime; //ctlr.elapsed; //ask fx/wkers for next frame render
//        if (next_frtime > duration) break;
                if (isdef(prev_time) && next_frtime <= prev_time) continue;
//            this.idle += woke - enter;
                this.busy -= Date.now();
                return next_frtime;
            }
        }
        model.runvix2 = async function(vixinfo) //, wait4frame)
        {
            this.busy = -Date.now();
            await this.vixfx(vixinfo); //, wait4frame)
            this.busy += Date.now();
        }
        fx.push(model.runvix2(vixinfo)); //, wait4frame)); //async; sends first frame immediately + waits for more
    }
    debug("ctlr elapsed %'d, seq duration %'d msec, waiting for %'d fx to finish", ctlr.elapsed, duration, fx.length);
    await Promise.all(fx);
    const pbelapsed = Date.now() - pbstart;
    debug("all fx completed: msec pb", commas(pbelapsed), "fx render msec:", fx.map((model) => commas(model.busy)));
//    ctlr.fill(BLACK);
//    await ctlr.out();

//    const vixmap = {}; //Object.entries(chnames).reduce((lkup, [inx, key]) => (lkup[key] = inx, lkup), {});
//    const retval = new EventEmitter();
//    for (let frinx = 0, frofs = 0; frinx < numfr; ++frinx, frofs += numch)
//    {
//        const frtime = frinx * interval; //msec
//        await ctlr.out(frtime - ctlr.elapsed); //adaptive
//        for (let chinx = 0, chofs = 0; chinx < numch; ++chinx, chofs += numfr)
//        {
//            const brightness = chvals[chofs + frinx];
//            const color = chcolors[chinx]; //|| 0;
//            const name = chnames[chinx]; //|| "(no name)";
//debug(color);
//debug(brightness);
//debug(name);
//if (/*!frinx*/ name)
//debug("fr %d, ch %d: color 0x%x, br %d, name '%s'", frinx, chinx, color, brightness, name);
//        }
//    }
//debug("here");
}
if (!module.parent) setImmediate(main); //allow inline init to finish first


//load vix2 seq/prof:
function Vixen2(opts)
{
//load+parse Vixen 2 sequence:
//    const filename = Path.join(__dirname, /*"**",*/ "!(*-bk).vix");
    const vix2seq = opts.seq || find_files(Path.join(__dirname, /*"**",*/ "!(*-bk).vix"), 1)[0];
//debug(vix2seq);
    const seqtop = parse(fs.readFileSync(vix2seq, 'utf8').toString()); //sync

//extract top-level props, determine #frames, #channels, etc:
//    add_prop('isVixenSeq', true);
    const duration = +seqtop.byname.Time.value; //msec
//    if (!this.opts.use_media_len) this.frames.push({frtime: m_duration, comment: "vix2eof"}); //kludge: create dummy cue to force duration length; //add_prop('duration', m_duration);
    const FixedFrameInterval = +seqtop.byname.EventPeriodInMilliseconds.value;
    const numfr = Math.ceil(duration / FixedFrameInterval);
    const partial = (numfr * FixedFrameInterval != duration);
    if (partial) debug("'%s' duration: %'d msec, interval %'d msec, #frames %'d, last partial? %s, #seq channels %'d", shortname(vix2seq), duration, FixedFrameInterval, numfr, !!partial, (seqtop.byname.Channels.children || []).length);
//    const chvals = vixtop.byname.EventValues.value;
//    console.log("ch val encoded len " + this.chvals.length);
//debug(seqtop.byname.EventValues.value.length);
    const chvals = /*Uint8Array.from*/(Buffer.from(seqtop.byname.EventValues.value, 'base64')); //no.toString("ascii"); //http://stackoverflow.com/questions/14573001/nodejs-how-to-decode-base64-encoded-string-back-to-binary
//    console.log("decoded " + chvals.length + " ch vals");
    const numch = Math.floor(chvals.length / numfr);
    const partial2 = (numch * numfr != chvals.length);
    if (partial2) debug("num ch# %'d, partial frame? %d", numch, !!partial2);
    function getchval(chinx, frinx, frlen)
    {
        const chofs = chinx * numfr; //NOTE: Vixen2 stores ch values separately (all frames within each channel)
//        const padded = (frinx < 0)? Array.from({length: -frinx < 0)? "0".repeat(-frinx): ""
//if (chinx == 304 && frinx == 1) assert(chvals.slice(chofs + frinx, chofs + frinx + frlen)[2] == 100, JSON.stringify(chvals.slice(chofs + frinx, chofs + frinx + frlen)));
//no worky; ch !contig        return frlen? chvals.slice(chofs + frinx, chofs + frinx + frlen): chvals[chofs + frinx];
//if (!frlen) debug(chinx, frinx, chofs, chvals[chofs + frinx]);
        if (!frlen) return chvals[chofs + frinx];
        return Array.from({length: frlen}, (_, inx) => chvals[chofs + inx * numfr + frinx]);
//        const retval = Array.from(chvals.slice(chofs + frinx, chofs + frinx + frlen)); //{length: frlen}).map((_) => chvals[chofs + frinx++]);
//debug(chinx, frinx, chofs, chvals[chofs + frinx], chvals[chofs + frinx + 1], chvals[chofs + frinx + 2], retval);
//        return retval;
    }
    function frinx2msec(frinx) { return frinx * FixedFrameInterval; } // / 1e3; }
    function msec2frinx(frmsec) { return Math.floor(frmsec / FixedFrameInterval); }


//get channel colors from profile:
    const vix2prof = opts.prof || find_files(Path.join(__dirname, /*'**',*/ '!(*RGB*).pro'), 1)[0];
//debug(vix2prof);
    const proftop = parse(fs.readFileSync(vix2prof, 'utf8').toString()); //sync
//    const chcolors = proftop.chcolors;
//    var top = load(this.filename);
//    this.channels = {length: numch}; //tell caller #ch even if they have no data; http://stackoverflow.com/questions/18947892/creating-range-in-javascript-strange-syntax
    if (!((proftop.byname.ChannelObjects || {}).children || {}).length) throw "No channels";
    const numprofch = proftop.byname.ChannelObjects.children.length;
//    this.channels = {length: numch}; //tell caller #ch even if they have no data
//    this.chcolors = get_channels.call(this, top.byname.ChannelObjects, numch);
//    this.channels = {length: m_numch}; //tell caller #ch even if they have no data; http://stackoverflow.com/questions/18947892/creating-range-in-javascript-strange-syntax
    if (/*proftop.byname.ChannelObjects.children.length*/ numprofch != numch) debug("prof #ch %'d != seq #ch %'d".brightRed, proftop.byname.ChannelObjects.children.length, numch);
//    else debug("prof #ch matches okay %d".brightGreen, proftop.byname.ChannelObjects.children.length);
    const chcolors = (proftop.byname.ChannelObjects.children || []).map((child, inx) => //NOTE: ignore output order
    {
        if (child.attr.color === 0) debug("ch# %d is black, won't show up".brightRed, inx);
//            var line = this.channels[child.value || '??'] = {/*name: child.value,*/ enabled: child.attr.enabled == "True" /*|| true*/, index: 1 * child.attr.output || inx, color: child.attr.color? '#' + (child.attr.color >>> 0).toString(16).substr(-6): '#FFF'};
        return ((child.attr.color || 0xFFFFFF) << 8 | 0xFF) >>> 0; //full alpha; //C
    });
    const chnames = (proftop.byname.ChannelObjects.children || []).map((child, inx) => child.value); //.reduce((lkup, name, inx) => (lkup[name] = inx, lkup), {});
    assert(chcolors.length == numch);
    assert(Object.keys(chnames).length == numch);
    function findch(name_re)
    {
        const found = [];
        for (const [chinx, chname] of Object.entries(chnames))
//        {
//            debug(typeof chname);
            if (chname.match(name_re)) found.push({chinx: +chinx, chname}); //not optimized; assume only called 1x < playback start, so doesn't matter
//        }
        assert(found.length == 1, `find chname '${name_re.source}'/${name_re.flags || ""} has ${plural(found.length, "es")} match${plural()}: ${found.map(({chinx, chname}) => `${chinx}:'${chname}'`).join(", ")}`);
        return found[0].chinx;
    }
            
/*
//map mono channel values to RGB colors, rotate matrix for faster access by frame:
    const pivot = new Buffer(4 * chvals.length); //convert monochrome to RGBA at start so colors can be handled uniformly downstream
//    var rgba = new DataView(pivot);
    const non_blank = {count: 0};
    for (let frinx = 0, frofs = 0; frinx < numfr; ++frinx, frofs += numch)
        for (let chinx = 0, chofs = 0; chinx < numch; ++chinx, chofs += numfr)
            if (chvals[chofs + frinx])
            {
                if (!non_blank.count++) non_blank.first = frinx;
                non_blank.last = frinx;
                break;
            }
    console.log("non-blank frames: %s of %s, first was fr# %s, last was fr# %s".brightCyan, non_blank.count, numfr, non_blank.first, non_blank.last);
    for (let chinx = 0, chofs = 0; chinx < numch; ++chinx, chofs += numfr)
        for (let frinx = 0, frofs = 0; frinx < numfr; ++frinx, frofs += numch)
        {
//            pivot[frofs + chinx] = m_chvals[chofs + frinx]; //pivot ch vals for faster frame retrieval
//            var rgba = m_chcolors[chinx];
            const brightness = chvals[chofs + frinx];
//            if (!brightness) { ++color_cache_stats.skipped; rgba = 0; } //set to black
//            else if (brightness == 255) ++color_cache_stats.skipped; //leave as-is (full brightness)
//            else rgba = color_cache(rgba +@Capi '^' + brightness, function()
        }
*/

//get audio info:
//    if (seqtop.byname.Audio) //set audio after channel vals in case we are overriding duration
//    {
    const audio_attr = ((seqtop.byname.Audio || {}).attr || {}).filename;
    const audio_val = (seqtop.byname.Audio || {}).value;
//    const audio = Path.join(vix2seq, '..', audio_val);
    const audiolen = +((seqtop.byname.Audio || {}).attr || {}).duration;
    if (audio_attr != audio_val) debug("audio filename mismatch: '%s' vs. '%s'".brightRed, audio_attr || '(none)', audio_val || '(none)');
//        if (this.opts.audio !== false) this.addMedia(m_audio);
//    }
//    debug("duration %d, interval %s, #fr %d, #ch %d, audio %s".brightBlue, duration, FixedFrameInterval, numfr, numch, audio);
    if (audiolen != duration) debug("seq len %'d != audio len %'d".brightRed, duration, audiolen);
//    const mp3file = find_files(Path.join(__dirname, /*"**",*/ "!(*-bk).mp3"), 1)[0];
    const mp3file = opts.mp3 || find_files(Path.join(__dirname, /*"**",*/ "!(*-bk).mp3"), 1)[0];

    if (mp3file != audio_attr && mp3file != audio_val) debug(`using '${shortname(mp3file)}' in place of audio attr '${shortname(audio_attr)}' or val '${shortname(audio_val)}'`);
                                                                                                      
    const retval =
    {
        vix2seq, name: Path.basename(vix2seq, Path.extname(vix2seq)), seqtop, //seq info
        duration, interval: FixedFrameInterval, numfr, frinx2msec, msec2frinx, //frame info
        chvals, numch, getchval, chcolors, chnames, findch, //channel info
        audio_attr, audio_val, audiolen, mp3file, //audio info
        vix2prof, proftop, //profile info
    };
    return retval;
}


function parse(str)
{
//    console.log("loaded " + (typeof str));
////    assert(typeof str === 'string');
//    console.log(("file " + str).substr(0, 200) + "...");

    var doc = new xmldoc.XmlDocument(str);
//    console.log(doc);
    var xml = traverse({}, doc);
//    src = JSON.stringify(xml); //TODO: just return parsed object rather than serialize + parse again?
    if (xml.children.length != 1) throw (xml.children.length? "Ambiguous": "Missing") + " top-level node";
    return xml.children[0];
}


function traverse(parent, child) //recursive
{
    var newnode =
    {
        name: child.name,
        attr: child.attr, //dictionary
        value: child.val, //string
//        children: [], //array
//        byname: {},
    };
    if (!parent.children) parent.children = [];
    parent.children.push(newnode);
    if (!parent.byname) parent.byname = {};
    parent.byname[child.name.replace(/[0-9]+$/, "")] = newnode; //remember last node for each unindexed name
    child.eachChild((grandchild) => traverse(newnode, grandchild));
    return parent;
}

//eof
