#!/usr/bin/env node
//YALP mp3 player
//Copyright (c) 2020-2021 Don Julien
//Can be used for non-commercial purposes.
//
//History:
//ver 0.20.12 DJ  move to separate incl folder
//ver 0.21.1  DJ  rework API
//ver 0.21.2  DJ  restruct as fx

'use strict'; //find bugs easier
const fs = require("fs");
const lame = require('lame'); //https://github.com/suldashi/node-lame
const Speaker = require('speaker'); //https://github.com/TooTallNate/node-speaker
const {my_exports, /*isary, isdef*/} = require("yalp21/incl/utils");
const {debug} = require("yalp21/incl/msgout");
const {yalp} = require("yalp21/yalp");


//put status info where other funcs can see it:
//const MP3LAG = (cfg.player || {}).mp3lag || -420; //msec; speaker seems to have ~0.4 sec buf
//Object.defineProperty(mp3play, "timestamp", {get: function() { return this.bps? Math.trunc(this.datalen * 1e3 / this.bps) + MP3LAG: MP3LAG; }}); //msec


//mp3 media playback:
//abstractly, mp3 is just an "effect" which runs on the "speaker" model
//the code below wraps streaming playback as a regular yalp frame-based effect
//NOTE: mp3 should be started ~0.4 sec ahead of target time; fmt decoding causes latency
my_exports({mp3play}); //allow reuse by custom code
async function mp3play(opts) //filepath, cb)
{
debug(opts);
TODO("skip, loop, volume?");
    const {model, lag, media, start, duration} = opts;
    const seqnum = yalp.seqnum;
    const found = (!isRE(media) && fs.existsSync(media)? [media]: player.cache)
//        .map((filepath, inx, all) => (debug("file[%'d/%'d] '%s': check name against %s", inx, all.length, filepath, seqname.source || seqname), filepath))
        .filter(filepath => isRE(media)? filepath.match(media): ~filepath.indexOf(media)) //choose file
        .map(filepath => ({filepath, name: shortpath(filepath), }));
    if (found.length != 1)
    {
        errlog("media '%s' %s (%'d matches): %s".brightRed, media.source || media, !found.length? "!found".brightRed: "ambiguous".brightYellow, found.length, found.map(({name}) => name).join(", ") || "(none)");
        return await sleep(5e3); //wait 5 sec to reduce log diarrhea
    }
//        if (!filepath) { /*await sleep_msec(1e3);*/ (cb || nop)(); return; } //no audio, but notify caller
//    if (!fs.existsSync(filepath)) errlog("audio '%s' not found", filepath); await sleep(1e3); //give a little time before cb
    const completed = await new Promise((resolve, reject) =>
    {
        fs.createReadStream(found[0])
            .pipe(new lame.Decoder())
//        .pipe(new PassThrough() .on("format", (fmt) => debug("fmt", fmt))
            .on("data", async function(data) //progress
            {
                this.datalen = (this.datalen || 0) + data.length;
if ((++this.count || (this.count = 1)) % 25) return; //debug/progress @~10 sec intervals
debug("mp3 decode: %'d bytes, timestamp %4.3 sec", this.datalen, this.timestamp);
                const frbuf = await await_frame(seqnum, 0);
                if (!frbuf) return resolve(debug("mp3: seq complete/cancel".brightRed), true); //seq completed or cancelled
                if (duration && frbuf.timestamp >= start + duration) return resolve(debug("mp3: duration %'d msec reached at fr timestamp %'d msec, stopping playback".brightGreen, duration, frbuf.timestamp), true);
            })
            .on('format', async function(fmt)
            {
                this.datalen = 0;
                this.bps = Math.round(fmt.sampleRate * fmt.channels * fmt.bitDepth / 8); //CD quality is 2 channel, 16-bit audio at 44,100 samples/second
                Object.defineProperty(this, "timestamp", {get: function() { return this.bps? Math.trunc(this.datalen * 1e3 / this.bps) + (opts.lag || 0): (opts.lag || 0); }}); //msec
debug("mp3 fmt %j, bps %'d, opening speaker", /*JSON.stringify*/(fmt), this.bps);
                const spkr = new Speaker(fmt)
                    .on('open', ...args => debug("speaker opened".brightGreen, ...args))
                    .on('flush', function (...args) { debug("speaker flushed".brightGreen, ...args); })
                    .on('close', function (...args) { resolve(debug("speaker closed".brightGreen, ...args), false); })
                    .on('error', function (...args) { reject(errlog("speaker error", ...args)); });
debug("speaker open, waiting for start time %'d msec", start);
//try to sync with gpu + other fx:
                if (!await await_frame(seqnum, start)) return resolve(debug("mp3 cancel".brightRed), true); //seq completed or cancelled
                this.pipe(spkr);
//                (cb || nop)();
            })
//        .on('progress', function (...args) { debug(`mp3 progress at ${commas(elapsed())} msec`.brightGreen, ...args); })
//        .on('finish', function (...args) { debug(`decode/enqueue finished after ${commas(elapsed())} msec, total data ${commas(this.datalen)} bytes`.brightGreen, ...args); })
//        .on('complete', function (...args) { debug(`decode/enqueue complete after ${commas(elapsed())} msec`.brightGreen, ...args); })
            .on('error', function (...args) { return reject(errlog("mp3 error", ...args)); });
    });
debug("mp3 playback: completed? %d wait until %'d? %d".brightGreen, completed, duration, !completed && duration);
    if (!completed && duration) await await_frame(seqnum, duration);
}

//eof