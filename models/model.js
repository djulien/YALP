#!/usr/bin/env node
// YALP model functions/base class + helper functions

//a model has 3 purposes:
//- define virtual grid size (fx target)
//- map virtual grid to physical nodes (h/w mapping)
//- indirectly, determine how effects look (ie, rectangular vs. radial geometry)
//first 2 above are done by returning a 2D grid holding physical node#s (or placeholders for null px)
//all fx should work for all models (although some might not look as good)
//multple models can be mapped to same physical nodes, allowing different results from same effect or props to operate in unison (ie, whole-house effects)


'use strict'; //find bugs easier
const fs = require("fs");
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW
const {debug, debug_nested, srcline, TODO} = require("../incl/msgout");
const {isdef, isary, my_exports, elapsed, name2file, tostr, /*time2str,*/ plural, commas, uint32} = require("../incl/utils");
const {hex} = require("../incl/colors");


//const grid32x8 = new grid(32, 8, xy_2x16x8); //, xylyt);
//grid32x8.show();
//xydump(xy_2x16x8)
//process.exit();
//function xydump(xylyt)
//{
//    xylyt();
//    const nodes = [...Array(w * h).keys()]; //https://stackoverflow.com/questions/3746725/how-to-create-an-array-containing-1-n
//    for (let y = 0; y < h; ++y)
//        this.nodes.push(nodes.slice(w * y, w * y + w));
//}
/*
function grid(w, h, xylyt)
{
    if (!this instanceof grid) return new grid(w, h, xylyt);
    [this.w, this.h, this.nodes] = [w, h, []];
    const nodes = [...Array(w * h).keys()]; //https://stackoverflow.com/questions/3746725/how-to-create-an-array-containing-1-n
    for (let y = 0; y < h; ++y)
//    {
//        const row = [];
//        for (let x = 0; x < w; ++x) row.push(0);
        this.nodes.push(nodes.slice(w * y, w * y + w));
//    }
//    return retval;
    this.show = function()
    {
        for (let y = this.h; y > 0; --y)
            console.log(`row[${y - 1}/${this.h}]:`, ...this.nodes[y - 1]);
    }
}
*/


/*
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
//            port.dirtylen = Math.max(port.dirtylen, this.firstpx + this.nodes1D.length);
        },
    }));
//const fx = [() => {}];
*/


//model base class:
//defines virtual 2D grid of nodes
//uses function-style ctor
//ctlr h/w is optionally assigned + mapped later
//recursive for models spanning ports
//keeps list of all models for enum purposes
my_exports({model});
//dumb model:
//override for custom node map (node reordering)
function model(opts)
{
    if (!ismodel(this)) return new model(opts);
//debugger;
//    Object.assign(this, opts); //{name, w, h, port}
    if (typeof opts == "function") opts = opts();
    Object.assign(this, opts); //in case caller wants to preserve additional data
    this.srcline = srcline(+1.5); //track origin for easier debug
    const tags = (opts.name || "").split(/\s*:\s*/);
    this.name = (tags.shift() || `model${this.srcline}`).replace(/\s+/g, "");
//    this.portnum = +opts.portnum;
//    [this.maxbr, this.RGSWAP] = [+opts.maxbr || 3 * 0xFF, opts.RGSWAP];

//get/check node map:
//    [this.width, this.height] = [+opts.width || 1, +opts.height || 1]; //virtual nodes
//    [this.numpx, this.nodes1D, this.nodes2D] = [opts.numpx, opts.nodes1D, opts.nodes2D]; //physical nodes
//    this.numpx = opts.numpx || this.wi
//    const numpx = this.w * this.h;
//give caller xymapper as much flexibility as possible; reconstruct missing data from other provided data:
//debug(isdef(opts.nodes1D), isdef(opts.width), isdef(opts.height), isdef(opts.nodes2D));
    if (!isdef(this.nodes2D)) //prefered over nodes1D + width + height (fewer data items)
    {
        assert(isdef(this.nodes1D) && (isdef(this.height) || isdef(this.width))); //can reconstruct from others
//        assert(isdef(this.nodes1D) && (isdef(this.width) || isdef(this.height)));
        if (!isdef(this.width)) this.width = Math.floor(this.nodes1D.length / this.height);
        if (!isdef(this.height)) this.height = Math.floor(this.nodes1D.length / this.width);
        this.nodes2D = Array.from({length: this.width}, (col, x) => shmslice(this.nodes1D, x * this.height, (x + 1) * this.height)); //wrapper for 2D addressing; CAUTION: don't use nodes.slice - doesn't preserve shm
    }
    if (!isdef(this.numpx)) this.numpx = 0; //no nodes mapped?
    if (!isdef(this.width)) this.width = this.nodes2D.length;
    if (!isdef(this.height)) this.height = this.nodes2D[0].length;
    if (!isdef(this.nodes1D)) this.nodes1D = shmslice(this.nodes2D[0], 0, this.width * this.height); //new Uint32Array(this.nodes2D[0].buffer, 0, this.width * this.height);
//    this.nodes2D = Array.from({length: this.w}, (_, x) => shmslice(this.nodes1D, x * this.h, (x + 1) * this.h));
    this.maxA = (60 * (this.MAXBR || 3 * 255) / (3 * 255)) * this.numpx / 1e3; //max current draw @full white
//    Object.freeze(this.nodes1D); //prevent 1D sttr from being damaged
    Object.freeze(this.nodes2D); //prevent 2D sttr from being damaged
    this.hwmap = new Int32Array(this.nodes1D); //clone node map < caller overwrites with node data; CAUTION: must alloc memory here; don't share mem with this.nodes
//TODO: 2D proxy to reorder nodes?; useful for sparse updates
//validate mem copy:
    const firstmap = this.nodes1D.findIndex((hwofs) => hwofs != UNMAPPED);
    assert(~firstmap, `${this.name} no nodes mapped to hw px?`);
    assert(this.hwmap[firstmap] == this.nodes1D[firstmap], "hwmap failed to copy nodes1D");
    assert(++this.hwmap[firstmap] != this.nodes1D[firstmap], "hwmap !deep copy of nodes1D");
    --this.hwmap[firstmap];
//debug(this.name, this.hwmap);
//debugger;
    for (let y = 0; y < this.height; y += (this.height - 1 || 1))
    {
        const x = 0, /*y = 0,*/ ofs = x * this.height + y;
//debug(x, y, ofs, this.height);
        const VERIFY = uint32(0x12345678), VERIFY2 = uint32(((VERIFY >> 16) & 0xFFFF) | (VERIFY << 16));
        const svnode = this.nodes2D[x][y];
        this.nodes2D[x][y] = VERIFY;
        assert(this.nodes1D[ofs] == VERIFY, `nodes1D[${ofs}] !mapped to nodes2D[${x}][${y}]? ${hex(this.nodes1D[ofs])}`);
        this.nodes1D[ofs] = VERIFY2;
        assert(this.nodes2D[x][y] == VERIFY2, `nodes2D[${x}][${y}] !mapped to nodes1D[${ofs}]? ${hex(this.nodes2D[x][y])}`);
        this.nodes2D[x][y] = svnode; //restore in case caller had data
    }
//debug("here2");
//NOTE: hwmap.length depends on virtual grid w/h, not numpx; could be <> numpx
    assert(this.hwmap.length == this.width * this.height);
    for (let n = 0; n < this.hwmap.length; ++n)
    {
//        if (n >= this.hwmap.length) throw `undef node ${n} in hwmap 0..${this.hwmap.length - 1}`;
        if (this.hwmap[n] == UNMAPPED) continue;
//        if (n >= this.hwmap.length) debug(`${this.name}: ${n} !in hwmap[0..${this.hwmap.length})?!`.brightRed);
        if (this.hwmap[n] < 0 || this.hwmap[n] >= this.numpx) throw `${name}: hwmap[${n}/${this.hwmap.length}] ${this.hwmap[n]} from nodes[x ${Math.floor(n / this.height)}, y ${n % this.height}] !in range [0..${this.numpx})`.brightRed;
    }

//analyze node map:
    const outmap = {};
//                        outrow[-1] = `"${this.width}x${this.height}:${this.numpx}"`;
    const dups = [], nulls = [];
    for (let x = 0; x < this.width; ++x)
        for (let y = 0; y < this.height; ++y)
        {
            const hwofs = this.hwmap[x * this.height  + y];
            if (hwofs == UNMAPPED) { nulls.push({x, y}); continue; }
//                                if (!outrow.hasOwnProperty(hwofs.toString()]) outrow[hwofs] = [];
            (outmap[hwofs] || (outmap[hwofs] = [])).push({x, y}); //`[${x}, ${y}]`);
        }
    for (const hwofs in outmap) if (outmap[hwofs].length > 1) dups.push(hwofs);
    if (nulls.length) warn("'%s' %'d node%s no hardware: %s", this.name, plural(nulls.length), plural(), nulls.map(xy => `[x ${xy.x}, y ${xy.y}]`).join(", "));
    if (dups.length) debug("'%s' %'d node%s overlapping: %s", this.name, plural(dups.length), plural(), dups.map(hwofs => outmap[hwofs].map(xy => `[x ${xy.x}, y ${xy.y}]`).join("+") + " => " + hwofs).join(", "));
    this.outary = Object.entries(outmap).sort(([lkey], [rkey]) => lkey - rkey).map(([key, val]) => [+key, val]); //force hwofs (key) to be numeric; index lookup in typed array fails otherwise :(
//debugger;
//                    output.push(`"${this.width} x ${this.height}",${Object.keys(this.nodes2D).map((inx) => `"[${inx}][*]"`).join(",")}\n`);
    assert(this.outary.length == this.numpx, `${this.name} ${this.width}x${this.height} outary ${this.outary.length} size mismatch #px ${this.numpx}`);
//debug(typeof this.hwmap, (this.hwmap.constructor || {}).name, !!this.hwmap.join, this.hwmap.length, Array.isArray(this.hwmap), this.hwmap);
//debug("nodes2D len", this.nodes2D.length, this.nodes2D.flat().length);
//debug("xymap len", this.xymap.length, this.xymap.flat().length);
//    const H = this.height = this.nodes2D.length;
//    const W = this.width = this.nodes2D[0].length;
//debug(typeof this.nodes2D, this.nodes2D.constructor.name);
//debug(typeof this.nodes2D[0], (this.nodes2D[0] || "huh?").constructor.name, this.nodes2D[0]);
//    const [W, H] = [this.width, this.height]; //= [this.nodes2D.length, this.nodes2D[0].length]; //[this.width, this.height];
//if (false)
    Object.defineProperties(this, //kludge: reduce debug output clutter
    {
        nodes1D: {value: this.nodes1D, enumerable: false},
        nodes2D: {value: this.nodes2D, enumerable: false},
        hwmap: {value: this.hwmap, enumerable: false},
        outary: {value: this.outary, enumerable: false},
    });
debug_nested(+1.5, "creating model '%s', %'dx%'d grid, %'d node%s", this.name, this.width, this.height, plural(this.numpx), plural());
//    assert(H == this.nodes2D.length, `height mismatch: got ${this.nodes2D.length}, expected ${H}`.brightRed);
//    assert(W == this.nodes2D[0].length, `width mismatch: got ${this.nodes2D[0].length} expected ${W}`.brightRed);

//helper methods:
//subdivide grid into smaller region:
    this.mkrect = function(myrect) //{x, y, w, h})
    {
        return this.mkrect.prev = Object.assign({},
            this.mkrect.prev || ({x: 0, y: 0, get w() { return this.width - this.x; }, get h() { return this.height - this.y; }}),
            myrect || {});
    }

//set nodes to given color/image:
    this.fill = function(color, rect)
    {
        const want_debug = this.debug-- > 0;
        const [X, Y, W, H] = rect? [+rect.x || 0, +rect.y || 0, +rect.w || 1, +rect.h || 1]: [0, 0, this.width, this.height];
if (want_debug)
    debug("fill %'d x %'d = %'d node%s with %s %s", W, H, plural(W * H), plural(), isary(color)? "image": "scalar", isary(color)? color.map(c => hex(c, "0xFF")).join(", "): hex(color || BLACK, "0xFF"));
        if (isary(color)) //image
        {
            if (W * H != color.length) warn("src len %'d != dest len %'d x %'d = %'d", color.length, W, H, W * H);
            if (rect) //column-by-column partial fill
                for (let x = 0; x < W; ++x)
                    this.nodes2D[X + x].set(color.slice(x * H, (x + 1) * H), Y);
            else
                this.nodes1D.set(color);
        }
        else //scalar
//for (const col of this.nodes2D) col.fill(color || BLACK); }
            if (rect) //column-by-column partial fill
                for (let x = 0; x < W; ++x)
                    this.nodes2D[X + x].fill(color || BLACK, Y, Y + H);
//                for (let y = 0, yofs = +rect.y || 0; y < (+rect.h || 1); ++y)
//                {
//                    this.nodes2D[xofs + x][yofs + y] = color || BLACK;
//                    assert(limit < 2e3, `bad loop? ${typeof (xofs + x)} ${typeof (yofs + y)} x ${x} y ${y}`);
//                }
            else this.nodes1D.fill(color || BLACK); //for (const col of this.nodes2D) col.fill(color || BLACK);
        this.dirty = true;
    }

    const self = this;
//    this.nofrbuf = //dummy frbuf for testing/debug
    Object.defineProperties(this,
    {
//dummy frame:
//mainly for debug/test
        nofrbuf:
        {
            seqnum: -1,
            get timestamp() { return (self.pending || {want_time: -1e3}).want_time; },
            set timestamp(fxtime) { return (self.pending || (self.pending = {})).want_time = fxtime; },
            get wsnodes() //need getter; port# unknown until later
            {
                const retval =
                {
                    [self.portnum]: new Uint32Array(self.firstpx + self.numpx), //CAUTION: new each time
                };
                return retval;
            },
            enumerable: false, //cleaner debug
        },
//    };
//perf (render) stats:
//    Object.defineProperties(this,
//    {
        perf:
        {
            value:
            {
                numfr: 0,
                wait_time: 0, //time spent waiting for frbuf (msec)
                busy_time: 0, //time spend rendering (msec)
                latency: 0, //time from frbuf rcv until render needed (msec); should be > frtime to prevent dropped frames
                started: elapsed(),
                get avg_wait() { return this.numfr? this.wait_time / this.numfr: 0; },
                get avg_busy() { return this.numfr? this.busy_time / this.numfr: 0; },
                get avg_latency() { return this.numfr? this.latency / this.numfr: 0; },
            },
            enumerable: false,
        },
        stats:
        {
            get() { return this.perf; },
            set(ignored) { this.perf.numfr = this.perf.wait_time = this.perf.busy_time = this.perf.latency = 0; this.perf.started = this.perf.timestamp = elapsed(); },
            enumerable: true,
        },
        idle: { set(newidle) { this.busy = !newidle; }, enumerable: true},
        busy:
        {
            set(newbusy)
            {
                const now = elapsed();
                this.stats[newbusy? "wait_time": "busy_time"] += now - this.stats.timestamp;
                if (newbusy) this.stats.latency += this.pending.got_time - now;
                this.stats.timestamp = now;
            },
            enumerable: true,
        },
    });
//        this.numfr = 0;
//    this.elapsed = elapsed(); //msec
//        this.wait_time = this.busy_time = 0; //render perf
//        this.latency = 0; //delay until render

//GPU output:
//TODO: !define .out() for models not in layout?
    this.out = function(frbuf, comment) //, force)
    {
//debug("model '%s' out: dirty? %d, force? %d, trace? %d", this.name, +!!this.dirty, +!!force, +!!this.want_trace);
//caller wouldn't call if !dirty        if (!this.dirty && !force) return;
//debug(frbuf);
        ++this.perf.numfr;
//        this.perf.latency += elapsed() - frbuf.timestamp;
//        ((this.pending || {}).want_time /
        const want_debug = this.debug-- > 0; //turn off for next time
//NO-SLOW!        assert(isdef(this.port) && isdef(this.firstpx) && this.ctlr, `can't output to non-layout model '${this.name}'`);
//NO-SLOW!        assert(this.hwmap, `${this.name || "UNNAMED"}: !hwmap?! ${Object.keys(this).join(", ")}`.brightRed);
//debug(this.name, this.numpx, this.width, this.height, port, first);
if (want_debug) debug("'%s' out: dirty? %d, force? %d, copying %'d nodes of %'dx%'d grid to port# %d, stofs %'d", this.name, +!!this.dirty, +!!force, this.numpx, this.width, this.height, this.portnum, this.firstpx);
        if (!this.hasOwnProperty("portnum")) throwx(`no output port assigned to model '${this.name}'`);
//        const port = frbuf.ports[this.portnum];
        const portnodes = frbuf.wsnodes[this.portnum];
//        port.brlimit = Math.min(port.brlimit, this.MAXBR); //API limitation: must set on each frame
//        const [traceout, outfile] = this.want_trace && [(function(retval = []){ return Object.assign(retval, {pushrow: pushrow.bind(retval, this)}); })(), "data/" + this.name + "-trace.csv"];
        pushrow.that = this;
        const [traceout, outfile] = this.want_trace? [Object.assign([], {pushrow/*: pushrow.bind(null, this)*/}), "data/" + this.name + "-trace.csv"]: [];
//        const outfile = this.want_trace && "data/" + this.name + "-trace.csv";
        if (this.want_trace && !fs.existsSync(outfile)) //show mapping
        {
//            if (fs.existsSync(outfile)) break; //header already written
            traceout.pushrow(`${commas(this.width)} x ${commas(this.height)} (${commas(this.numpx)})`, "frtime", "fxtime", "comment", ([hwofs]) => `[${commas(hwofs)}]:`);
            traceout.pushrow("mapped from:", "", "", "", ([hwofs, xylist]) => `${xylist.map(({x, y}) => `[${commas(x)}, ${commas(y)}]`).join(", ")}`);
        }
        if (this.want_trace && !this.out_count++) //show initial node values
        {
//            const outnodes = port.wsnodes;
            if (fs.existsSync(outfile)) traceout.pushrow("", "", "", "", n => ""); //session separator
            traceout.pushrow("wsnodes", "", "", "", ([hwofs, xylist]) => `${xylist.map(({x, y}) => hex(portnodes[this.firstpx + hwofs], "0xFF"), this).join(", ")}`); //NOTE: post-RGSWAP
            traceout.pushrow("model", "", "", "", ([hwofs, xylist]) => `${xylist.map(({x, y}) => hex(this.nodes2D[x][y], "0xFF"), this).join(", ")}`); //NOTE: pre-RGSWAP
            this.out_count = 1;
        }
        const svnodes = this.want_trace && portnodes.slice(this.firstpx, this.firstpx + this.numpx); //NOTE: creates new (typed) ary, not ref
TODO("check perf, optimize?");
//        if (this.RGSWAP)
        const rgswap = this.RGSWAP || ((nop) => nop);
//        let changed = false;
//        port.wsnodes.set(this.nodes1D, this.firstpx);
        for (let n = 0; n < this.hwmap.length; ++n)
        {
            const hwofs = this.hwmap[n];
TODO("perf: use flip(firstpx, UNIV_LEN) for UNMAPPED and skip check?");
            if (hwofs == UNMAPPED) continue;
            const newval = rgswap(this.nodes1D[n]); //uint32
//            if (this.want_trace && outnodes[this.firstpx + hwofs] == newval) continue;
//if (this.want_trace) (log_changes[this.firstpx + hwofs] || (log_changes[this.firstpx + hwofs] = [])).push({hwofs, n, before: hex(outnodes[this.firstpx + hwofs]), after: hex(newval)});
            portnodes[this.firstpx + hwofs] = newval;
//            changed = true;
        }
//        port.dirtylen = Math.max(port.dirtylen, this.firstpx + this.numpx); //no point in optimizing this; ws refresh time won't change
        this.dirty = false;
        if (!this.want_trace) return;
//        const newnodes = port.wsnodes.slice(this.firstpx, this.firstpx + this.numpx); //NOTE: creates new ary, not ref
        const outnodes = portnodes.slice(this.firstpx, this.firstpx + this.numpx);
        const RGBbits = 0xFFFFFF; //A bits are ignored during wsnode formatting; TODO: use for alpha/blend?
        const delta = Array.from(svnodes, (oldval, n) => !((outnodes[n] ^ oldval) & RGBbits)? hex(oldval, "0xFF") + "=" + hex(outnodes[n], "0xFF"): hex(oldval, "0xFF") + "!=" + hex(outnodes[n], "0xFF")); //CAUTION: no intermediate array (doesn't truncate values)
//if ((++this.dcount || (this.dcount = 1)) < 4) debug(delta.join(","));
//        const delta = this.outary.map(([hwofs, xylist]) => (rgswap(this.nodes2D[xylist.top.x][xylist.top.y]) != svnodes[hwofs])? `"${hex(this.nodes2D[xylist.top.x][xylist.top.y])}"`: `"="`).join(","); //show value(s) sent from caller (before rgswap)
        if (delta.join(",").match(/\d/) || frbuf == this.nofrbuf) //something changed or caller wants debug
//        {
//            traceout.push(`"update",` + delta + "\n");
//            traceout.push(`"T+${/*time2str() elapsed()*/ frbuf.timestamp / 1e3}",` + this.outary.map(([hwofs]) => (outnodes[this.firstpx + hwofs] != svnodes[hwofs])? `"${hex(outnodes[this.firstpx + hwofs])}"`: `"="`).join(",") + "\n"); //show resulting values (post-RGSWAP)
            traceout.pushrow(`T+${commas((elapsed() / 1e3).toFixed(3))}`, commas((frbuf.timestamp / 1e3).toFixed(3)), commas(((this.pending || {}).want_time / 1e3).toFixed(3)), comment, ([hwofs]) => delta[hwofs]); //show resulting values
//        }
//        traceout.push(`"aka",` + this.hwmap.filter((hwofs) => (hwofs != UNMAPPED)).map((hwofs) => `"${hex(this.nodes1D[hwofs])}"`).join(",") + "\n");
        if (!traceout.length) return;
//        fs.appendFileSync(outfile, traceout.map(v_f => (typeof v_f == "function")? this.outary.map(v_f).map(str => '"' + str + '"').join(",") + "\n": '"' + v_f + '",').join("")); //TODO: async for better perf?
        fs.appendFileSync(outfile, traceout.join("")); //TODO: async for better perf?

        function pushrow(/*that,*/ rowhdr, frtime, fxtime, comment, fmtvals) //need to fmt vals before they change
        {
            const hdrcols = [rowhdr, frtime, fxtime, comment];
            return this.push(hdrcols.map(val => quote(tostr(val || "").replace(/"/g, '""'))).join(",") + "," + pushrow.that.outary.map(fmtvals).map(val => quote(val)).join(",") + "\n");
        }
        function quote(val, quo) { return (quo || '"') + val.toString() + (quo || '"'); }
    }

//write node map to csv:
    this.csv = async function(label, fmt)
    {
        const outfile = name2file(`data/${label || `${this.name}`}-model.csv`);
        outfile.writeln(`"${this.width} x ${this.height}",${Object.keys(this.nodes2D).map((inx) => `"[${inx}][*]"`).join(",")}`);
        for (let y = 0; y < this.height; ++y)
//wrong values            outfile.writeln(`"[*][${flip(y, this.height)}]",${this.nodes2D.map((col, x, all) => `${(all[x][flip.latest] == UNMAPPED)? '"x"': all[x][flip.latest]}`).join(",")}`); //origin is bottom left, but need to display top-to-bottom
//show hwmap, *not* current node values (might have changed):
            outfile.writeln(`"[*][${flip(y, this.height)}]",${this.nodes2D.map((col, x) => `${commas(this.hwmap[x * this.height + flip.latest]).replace(UNMAPPED.toString(), '"x"')}`).join(",")}`); //origin is bottom left, but need to display top-to-bottom
        outfile.writeln("");
        outfile.writeln(`total ${commas(this.numpx)} of ${commas(plural(this.width * this.height))} node${plural()} mapped`.split(/\s+/).map((str) => `"${str}"`).join(","));
        outfile.end();
//        outfile.close();
//        debug("wrote %'d lines to '%s'", outfile.numwrites, outfile.name);
        await outfile.wait4close();
    }

//collection tracking:
//    this.tags = tags;
    for (const tag of tags)
        (model[tag] || (model[tag] = [])).push(this);
    (model.all || (model.all = [])).push(this);
//    if (Array.isArray(segs)) //create smaller model segments that can be mapped to h/w
//        this.segments = segs.map((seg, inx) => new model(name.replace(/:|$/, `_${inx + 1}$&`), () => seg));
}


//null pixels:
//linear string of nodes; no need for fancy geometry
my_exports({nullpx});
//function nullpx(count)
function nullpx(opts)
{
//    return model(`nullpx[${count}]: NULLPX`, () => mapall(grid(count)));
//    const {nodes2D, width: W, height: H} = grid(SQSIZE * 2, SQSIZE / 2); //hacked panel
    const count = (typeof opts == "object")? opts.count || 1: +opts || 1;
    return model(Object.assign({name: `null px[${count}]: NULL`}, mapall(grid(count))));
}


/////////////////////////////////////////////////////////////////////////////////
////
/// helpers
//

//create 2D grid:
//pre-populate with unmapped node#s
//also generate 1D version
//NOTE: favors columns over rows (inner dim = y, outer dim = x)
const UNMAPPED = -1 >>> 0; //virtual (unassigned/unmapped) nodes
my_exports({grid});
function grid(w, h, nodetype)
{
//TODO("use C++ + pad to cache len?");
    const CACHELEN = 64; //RPi 2/3 reportedly have 32/64 byte cache rows; use larger size to accomodate both
    const [width, height] = [w || 1, h || 1];
    const ARYTYPE = nodetype || Uint32Array; //Int32Array; //there's a comment on stackoverflow.com that V8 vars can be int32, double, pointer, but uint32 will be converted to slower double.  doesn't seem to be true according to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays ??
    const wanted_size = width * height * ARYTYPE.BYTES_PER_ELEMENT; //bytes
    const buf = new SharedArrayBuffer(Math.ceil(wanted_size / CACHELEN) * CACHELEN); //allow sharing between worker threads; pad to minimize cache contention across threads
    const nodes1D = new ARYTYPE(buf, 0, width * height).fill(UNMAPPED); //linear access; NOTE: #elements, not bytes; explictly set length in case buf was padded
//CAUTION: x + y are swapped; layout favors columns over rows; caller can swap if desired
//    const nodes2D = Array.from({length: height}, (row, y) => nodes.slice(y * width, (y + 1) * width).fill(-1));
//slice breaks shm link!    const nodes2D = Array.from({length: width}, (col, x) => nodes1D.slice(x * height, (x + 1) * height).fill(UNMAPPED)); //convenience wrapper for 2D addressing
    const nodes2D = Object.freeze(Array.from({length: width}, (col, x) => shmslice(nodes1D, x * height, (x + 1) * height))); //new Uint32Array(buf, x * height * Uint32Array.BYTES_PER_ELEMENT, height)); //convenience wrapper for 2D addressing; CAUTION: don't use nodes.slice(); freeze: prevent 2D ary sttr from being damaged
//debug(nodes2D);
    return {nodes2D, width, height, nodes1D, numpx: 0}; //numpx: no phys nodes assigned yet
}
//test shm btwn ary + slice:
//const buf = new SharedArrayBuffer(20);
//debug(buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], buf[6], buf[7], buf[8], buf[9], buf[10], buf[11]);
//const i32ary = new Int32Array(buf, 0*4, 4); //16 bytes; CAUTION: ofs in bytes, length in elements
//debug(i32ary);
//const ary2D = Array.from({length: 2}, (col, x) => i32ary.slice(x * 2, (x + 1) * 2).fill(10 + x)); //0..2, 2..4
//debug(/*buf,*/ i32ary, ary2D);
//const aa2D = Array.from({length: 2}, (col, x) => new Int32Array(buf, x * 2*4, 2).fill(20 + x)); //0..2, 2..4
//debug(/*buf,*/ i32ary, ary2D, aa2D);
//i32ary[2] = 5678; debug(/*buf,*/ i32ary, ary2D, aa2D);
//ary2D[1][1] = 1234; debug(/*buf,*/ i32ary, ary2D, aa2D);
//aa2D[1][1] = 6789; debug(/*buf,*/ i32ary, ary2D, aa2D);
//buf[0] = buf[1] = 1; debug(/*buf,*/ i32ary, ary2D, aa2D);
//process.exit();


//slice() for TypedArray:
//regular .slice() doesn't preserve shm link, so a new TypedArray must be created instead
my_exports({shmslice});
function shmslice(shmary, from, to)
{
    assert(shmary instanceof Uint32Array || shmary instanceof Int32Array); //other types !implemented
    const ARYTYPE = (shmary instanceof Uint32Array)? Uint32Array: Int32Array;
    return new ARYTYPE(shmary.buffer, (from || 0) * ARYTYPE.BYTES_PER_ELEMENT, (to || shmary.buffer.byteLength / ARYTYPE.BYTES_PER_ELEMENT) - (from || 0)); //CAUTION: byte ofs vs. element length
}


//map all nodes in grid:
my_exports({mapall});
function mapall(grid)
{
    const numpx = grid.numpx = /*grid.nodes2D? grid.nodes2D.length * grid.nodes2D[0].length:*/ grid.nodes1D.length;
    for (let n = 0; n < numpx; ++n) grid.nodes1D[n] = n;
    return grid;
}


my_exports({ismodel});
function ismodel(obj)
{
    return (obj instanceof model);
}


/*
//map virt px (copies) to real px:
function remap(nodes2D, virtpx)
{
    for (const [duppx, [xreal, yreal]] of Object.entries(virtpx)) //go back and fill in placeholders now that real px# known
    {
        const [xvirt, yvirt] = duppx.split(",");
        debug("virt (%d, %d) <- real (%d, %d) = %'d", xvirt, yvirt, xreal, yreal, nodes2D[xreal][yreal]);
        nodes2D[xvirt][yvirt] = nodes2D[xreal][yreal];
    }
}
*/


//zig-zag:
my_exports({ZZ});
function ZZ(val, limit)
{
    const [cycle, step] = [Math.floor(val / limit), val % limit];
//    return (cycle & 1)? limit - step - 1: step;
    return (cycle & 1)? flip(step, limit): step; //limit - step - 1: step;
}
//if (!module.parent) setImmediate(() => rgbtree().dump()); //unit-test; run after inline init


//flip (mirror):
my_exports({flip});
function flip(val, limit)
{
    return flip.latest = /*Array.isArray(val)? val.map((item) => flip1(item, limit):*/ flip1(val, limit);
    function flip1(val, limit) { return (val < 0)? 0: (val >= limit)? limit - 1: limit - val - 1; } //clamp
}
//flip array or scalar:
//module.exports.flipa = flipa;
//function flipa(v, L)
//{
//    return Array.isArray(v)? v.map((e) => flip(e, L)): flip(v, L);
//}


/*
const HEAD = 0, TAIL = 1, PTRLEN = 2;
class todo_Model
{
//    static const HEAD = 0, TAIL = 1, PTRLEN = 2;
    #width;
    #height;
    #numfr;
    #frames;
    #frbufs;
    #que;
    #head;
    #tail;
    #frused;
    constructor(opts)
    {
//        Object.defineProperties(this,
        this.#width = (opts || {}).width || 1;
        this.#height = (opts || {}).height || 1;
//        #state = new Uint32Array(new SharedArrayBuffer(1024););
        this.#numfr = (opts || {}).numfr || 4;
        const frbuflen = this.#width * this.#height;
        const shmbuf = new SharedArrayBuffer(((frbuflen + 1) * this.#numfr + PTRLEN) * Uint32Array.BYTESPERELEMENT);
        this.#frbufs = Array.from({length: numfr}).map((_, inx) => new Uint32Array(shmbuf, (PTRLEN + this.#numfr + inx * frbuflen) * Uint32Array.BYTESPERELEMENT, this.#width * this.#height));
        this.#que = new Uint32Array(shmbuf, 0, PTRLEN);
//        this.#frused = new Uint32Array(shmbuf, 1 * Uint32Array.BYTESPERELEMENT, 1);
//        this.head = this.tail = 0; //frame queue empty
        Atomics.store(this.#head, HEAD, 0);
        Atomics.store(this.#tail, TAIL, 0);
    }
    async /-*get*-/ wrframe()
    {
        Atomics.wait(this.#frused, 0, 0); //wait for frame available
        return this.#frames[this.#head++ % this.#frames.length];
    }
    write()
    {
        Array.copy();
    }
    async await_until(msec)
    {
        while (this.head == this.tail - 1);
    }
    async rdframe(cb)
    {
        const nextrd = Atomics.load(this.#que, TAIL);
        cb(this.#frbufs[nextrd]);
        await Atomics.wait(this.#frused, 0, 0);
    }
};
*/

//eof