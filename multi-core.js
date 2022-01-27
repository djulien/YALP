#!/usr/bin/env node
//multi-core template

"use strict";

require('colors').enabled = true; //for console output (all threads)
require("magic-globals"); //__file, __line, __stack, __func, etc
const {Worker, isMainThread, parentPort, workerData, threadId} = require('worker_threads');
elapsed.started = isMainThread? Date.now(): workerData.epoch; //use same time base for all threads

//if ((workerData || {}).buffer) workerData.buffer.toString = function() { return `(buffer bytelen ${this.byteLength})`; };
//if (!isUN((workerData || {}).byteLength) && args.splice(inx, 1, `(buffer bytelen ${arg.byteLength})`));
debug("entry", workerData); //Object.assign({}, workerData || {}, (workerData || {}).buffer? {buffer: `(buffer bytelen ${workerData.buffer.byteLength})`}: {}));
setImmediate(isMainThread? main: worker); //allow in-line init code to finish first

const shmbuf = isMainThread? new SharedArrayBuffer(40): workerData.shmbuf;
const jobctl = new Uint32Array(shmbuf);
"numrd, numwr, numcycle, job_count, job_wait, job_busy, upd_count, upd_idle, upd_pivot, upd_sync"
    .split(/\s*,\s*/)
    .forEach((name, inx, all) =>
    {
        if (u32len(jobctl.byteLength) < all.length) throw `job ctl too short: ${u32len(jobctl.byteLength)} vs ${all.length}`.brightRed;
        Object.defineProperties(jobctl,
        {
            [name]:
            {
                get() { return Atomics.load(this, inx); },
                set(newval) { Atomics.store(this, inx, newval); },
                enumerable: true,
            },
            [name + "_bump"]:
            {
                get() { return Atomics.add(this, inx, 1); },
                set(newval) { Atomics.add(this, inx, newval); },
                enumerable: false, //avoid accidental changes
            },
        });
    });
const junk =
({
    NUMRD: {value: 0},
    NUMWR: {value: 1},
    NUMCYCLE: {value: 2},
//    EPOCH: {value: 3},
//stats:
    JOB_COUNT: { value: 4},
    JOB_WAIT: { value: 5},
    JOB_BUSY: { value: 6},
    PIVOT_COUNT: { value: 7},
    PIVOT_WAIT: { value: 8},
    PIVOT_BUSY: { value: 9},
    SYNC_COUNT: {value: 10},
    SYNC_WAIT: {value: 11},
    SYNC_BUSY: {value: 12},
    numrd:
    {
        get() { return Atomics.load(this, this.NUMRD); },
        set(newval) { Atomics.store(this, this.NUMRD, newval); },
        enumerable: true,
    },
    numwr:
    {
        get() { return Atomics.load(this, this.NUMWR); },
        set(newval) { Atomics.store(this, this.NUMWR, newval); },
        enumerable: true,
    },
    numcycle:
    {
        get() { return Atomics.load(this, this.NUMCYCLE); },
        set(newval) { Atomics.store(this, this.NUMCYCLE, newval); },
        enumerable: true,
    },
//    epoch:
//    {
//        get() { return Atomics.load(this, this.EPOCH); },
//        set(newval) { Atomics.store(this, this.EPOCH, newval); },
//        enumerable: true,
//    },
    numrd_bump:
    {
        get() { return Atomics.add(this, this.NUMRD, 1); },
        enumerable: false, //avoid accidental changes
    },
    numwr_bump:
    {
        get() { return Atomics.add(this, this.NUMWR, 1); },
        set(newval) { Atomics.add(this, this.NUMWR, newval); },
        enumerable: false, //avoid accidental changes
    },
    numcycle_bump:
    {
        get() { return Atomics.add(this, this.NUMCYCLE, 1); },
        enumerable: false, //avoid accidental changes
    },
});


//https://www.oreilly.com/library/view/multithreaded-javascript/9781098104429/ch04.html
async function main()
{
    debug("start");
//    const buffer = new SharedArrayBuffer(32); //1024);
//    const view = new Uint32Array(buffer);
//    jobctl.epoch = Date.now();
//    view[0] = view[1] = view[2] = 0;
    debug('init view', jobctl.numrd, jobctl.numwr, jobctl.numcycle);
    for (let i = 0; i < 4; ++i) cre_wker();

//    work(view); //optional: main thread can be a worker also
//    setTimeout(() =>
//    setInterval(() =>
//    {
//      console.log('later', Atomics.load(view, 0), buffer.foo, srcline());
//      console.log('prop', buffer.foo, srcline());
//      worker.unref();
//    }, 500);

    await Promise.all(cre_wker.all || []);
    debug("stats:".brightCyan);
    debug(`job: #total ${jobctl.job_count}, avg wait ${(jobctl.job_wait / jobctl.job_count).toFixed(3)} sec, avg busy ${(jobctl.job_busy / jobctl.job_count).toFixed(3)} sec`);
    debug(`update: #total ${jobctl.upd_count}, avg idle ${(jobctl.upd_idle / jobctl.upd_count).toFixed(3)} sec, avg pivot ${(jobctl.upd_pivot / jobctl.upd_count).toFixed(3)} sec, avg sync ${(jobctl.upd_sync / jobctl.upd_count).toFixed(3)} sec`);
    debug("quit");
}


function cre_wker()
{
    const retval = new Promise((resolve, reject) =>
    {
        const wker = new Worker(__filename, {workerData: {/*wker,*/ shmbuf, epoch: elapsed.started}}); //__dirname + '/worker-node.js');
        wker
            .on("message", msg => debug(`msg from wker ${wker.threadId}:`, msg))
            .on("error", err => { debug(`wker ${wker.threadId} error:`.brightRed, err); reject(); })
            .on("exit", code => { debug(`wker ${wker.threadId} exit`.brightGreen, code); resolve(code); });
//        worker.postMessage(buffer); //send shm buf
//        worker.unref();
    });
    (cre_wker.all || (cre_wker.all = [])).push(retval);
    return retval;
}


let thing = threadId;
setTimeout(() => thing += 1000, 8e3);

async function worker()
{
//    let view;
    debug("start".brightMagenta, thing, workerData);
    parentPort.on('message', msg => debug("msg from parent:", msg)); //(buffer) =>
//    {
//      const view = new Uint32Array(buffer);
    await work(); //view);
//      buffer.foo = 42;
//        setInterval(() =>
//        {
//            Atomics.add(view, 0, 2);
//            console.log('updated in worker', workerData, srcline());
//        }, 25);
//    const { arr } = data
//    console.log('modifying sharred array')
//    arr[0] = 1
//    parentPort.postMessage({})
//    });
    debug("ret".brightMagenta, thing);
    await sleep(1e3);
    process.exit(threadId);
}


const [NUMFR, NUMGRP] = [3, 6];

//called by main or worker threads:
async function work() //shmbuf)
{
    const EOF = -1 >>> 0;
    debug("start working".brightCyan);
//    elapsed();
    let job_ready, upd_ready, now;
    job_ready = upd_ready = -Date.now();
    for (;;)
    {
        const numrd = jobctl.numrd_bump; //Atomics.add(shmbuf, 0, 1);
        if (numrd < 6)
        {
            now = Date.now();
            jobctl.job_count_bump;
            jobctl.job_wait_bump = job_ready + now; job_ready = -now; //elapsed(elapsed.latest);
            debug(`apply job#${numrd}`);
            await sleep(5e3);
            const numwr = jobctl.numwr_bump; //Atomics.add(shmbuf, 1, 1);
            now = Date.now();
            jobctl.job_busy_bump = job_ready + now; job_ready = -now; //elapsed(elapsed.latest);
            if (numwr+1 == NUMGRP)
            {
                now = Date.now();
                jobctl.upd_count_bump;
                jobctl.upd_idle_bump = upd_ready + now; upd_ready = -now;
                if (jobctl.numcycle_bump+1 > NUMFR) jobctl.numcycle = EOF; //_bump; //Atomics.add(shmbuf, 2, 1); //#cycles
                debug(`pivot + reset #${jobctl.numcycle}`);
                await sleep(3e3);
                now = Date.now();
                jobctl.upd_pivot_bump = upd_ready + now; upd_ready = -now;
                jobctl.numrd = 0; //Atomics.store(shmbuf, 0, 0); //wipe out excess

                debug(`sync + update #${jobctl.numcycle}`);
                await sleep(8e3);
                now = Date.now();
                jobctl.upd_sync_bump = upd_ready + now; upd_ready = -now;
                jobctl.numwr_bump = -6; //drop; //Atomics.add(shmbuf, 1, -6); //only remove jobs from completed cycle, preserve pre-completed work on next cycle
                debug("allow next cycle".brightCyan); //"#wr bump back, new val:", shmbuf.numwr); //Atomics.load(shmbuf, 1));
            }
//            elapsed();
        }
        else { debug(`wait, job# ${numrd}`); await sleep(1e3); }
        if (jobctl.numcycle == EOF) break; //Atomics.load(shmbuf, 2) > 5) break;
    }
    debug("all work done".brightCyan);
//    process.exit();
}


function sleep(delay) { return new Promise(resolve => setTimeout(resolve, delay)); }

function debug(...args)
{
//    args.forEach((arg, inx) => console.error("isbuf?", !isUN(isUN(arg, {}).byteLength)));
//    args.forEach((arg, inx) => !isUN(isUN(arg, {}).buffer) && args.splice(inx, 1, Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`))));
    args.unshift(whoami());
    args.push(elapsed(), srcline(+1));
    return console.log(...args.map(arg => !isUN(isUN(arg, {}).buffer)? Object.assign({}, arg, {buffer: `(buffer bytelen ${arg.buffer.byteLength})`}): arg));
}

function elapsed(started) { return "T+" + (((elapsed.latest = Date.now()) - (started || elapsed.started)) / 1e3).toFixed(3); }

function whoami() { return "[" + ["main-", "thread-"][+!!threadId] + threadId + "]"; } //isUN(workerData)? "[main]": `wker[${workerData.wker}]`; } 

function u32len(bytelen) { return Math.ceil(bytelen / 4); }

function isUN(thing, unval)
{
    const retval = (thing == null);
    return (unval === undefined)? retval: retval? unval: thing;
}

/*
//https://nodejs.org/api/worker_threads.html
if (isMainThread)
{
  module.exports = function parseJSAsync(script) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: script
      });
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0)
          reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  };
} else {
  const { parse } = require('some-js-parsing-library');
  const script = workerData;
  parentPort.postMessage(parse(script));
}
*/

function srcline(depth) { return ` @:${(__stack[depth + 1 || 1] || {getLineNumber: () => -1}).getLineNumber()}`; }

process.on("beforeExir", () => debug("about to exit".brightYellow));
                                     
//eof