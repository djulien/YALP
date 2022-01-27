#!/usr/bin/env node
//model base class

'use strict'; //find bugs easier
const assert = require('assert').strict; //https://nodejs.org/api/assert.html; CAUTION: SLOW
//const {my_exports} = require("yalp/incl/utils");
//const {TODO} = require("yalp/incl/msgout");
//const {model, grid, shmslice, ZZ, flip} = require("./model");
//const {Model, Grid, /*ZZ, flip*/} = require("./model");
//const {ZZ, flip} = require("./incl/utils");
const {debug, TODO, warn, fatal, srcline, methodsof, defunc, isUN, isary, fmt, hex, u32, as_is, u32bytes, replace_prop, commas, plural, trunc, datestr, name2file} = require("../incl/utils22");
const {/*PAL, HUE, HSV2RGB, hsv2RGB, hsv2rgb,*/ asRGB, /*hsvgrad, hsvdim, RGSWAP*/} = require("../incl/color-mgmt22");
const XPM = require('../incl/xpm22');

const [enumerable, configurable] = [true, true]; //default is off


//////////////////////////////////////////////////////////////////////////////////////////////////////////////


//Model(); //kludge: init prototype before first use

//model base class:
//ctor function allows hoist
//for inheritance see https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Objects/Inheritance
my_exports({Model}); //, isModel});
function Model(...args)
{
//debug("is model?", isModel(this), srcline(+1), srcline(+2));
    if (!isModel(this)) return new Model(...args);
//    if (!this.nodes2D)
//    const [opts] = args;
    Rect.call(this, args[0]); //base class
    const opts = defunc(args[0]) || {};
//class props + methods:
//define within ctor func to allow hoist
//console.log(!!Model.prototype, srcline());
//debug(methodsof(this));
    if (!Model.cls_init) //add props + methods to prototype; wan't done earlier due to hoist
    {
        Model.cls_init = true;
        Model.isModel = isModel;
        Model.prototype = Object.create(Rect.prototype, //); //inherit from base
//    if (Model.prototype.grid) return; //cls_init) return;
//console.log(Model.prototype.fill.toString(), srcline());
///    console.log(Object.getOwnPropertyDescriptor(Model.prototype, "fill"), srcline());
//debug("TODO: replace with loop".brightYellow);
//         Object.defineProperties(Model.prototype, // Object.getPrototypeOf(this),
        {
            constructor: { value: Model, }, //enumerable: false, }, //enumerable: false, writable: true, }, //hide from "for in" loops
//        cls_init: { value: true, }, //enumerable: true, writable: false, },
            UNMAPPED: { value: u32(-1), enumerable, }, //virtual (unassigned/unmapped) nodes
//        OFF: { value: 0, enumerable: true, }, //"black"
//set nodes to given color/image:
            fill: { value: fill, enumerable, },
            fillinto: { value: fillinto, enumerable, },
            setxy: { value: setxy, enumerable, },
            draw: { value: fill, enumerable, },
            unit_test: { value: async function(label) { this.draw(); await this.emit(this.name + "-" + (label || "test")); }},
            grid: { value: grid, }, //enumerable: false, },
            emit: { value: emit, },
            dump: { value: dump, },
            mapall: { value: mapall, enumerable, },
            analyze: { value: analyze, },
            node2rgb: { value: node2rgb, },
            replace_prop: { value: replace_prop, }, //enumerable: false, },
            csv: { value: csv, enumerable, },
//            width: { value: 1, enumerable, }, //default in case not set by caller
//            height: { value: 1, enumerable, }, //default in case not set by caller
        });
        return new Model(...args); //opts); //kludge: re-create obj with correct prototype
    }
//instance props + methods:
    this.srcline = srcline(+1.5); //track origin for easier debug
    const tags = (opts.name || "").split(/\s*:\s*/);
    this.name = (tags.shift() || `model ${this.srcline}`).replace(/\s+/g, "");
    Object.defineProperties(this, //proto, //add more props + getters
    {
//        width: { get() { return replace_prop.call(this, this.nodes2D.length); },
//        get height() { return replace_prop.call(this.nodes2D[0].length); },
        area: { get() { return this.replace_prop(`${commas(this.width /*|| 1*/)} x ${commas(this.height /*|| 1*/)}`, "area"); }, enumerable, configurable},
        nodes1D: { get() { return this.replace_prop(new Uint32Array(this.nodes2D[0].buffer), "nodes1D"); }, enumerable, configurable}, //TODO: use grid.nodes2D?
        nodes2D: { get() { /*debug("generate nodes2D", methodsof(this), srcline(+1))*/; return this.replace_prop(this.grid(this.width, this.height), "nodes2D"); }, enumerable, configurable}, //NOTE: nodes2D is the primary node list; width, height, nodes1D, and numpx can all be derived from there
        maxA: { get() { return this.replace_prop((60 * (this.maxbr || 3 * 255) / (3 * 255)) * this.numpx / 1e3); }, enumerable, configurable}, //max current draw @full white
        hwmap: { get() { return this.replace_prop(this.analyze(), "hwmap"); }, configurable}, //, enumerable},
    });
//nope    Object.assign(this, defunc(opts)); //{opts: defunc(opts)}); //in case caller wants to preserve additional data
    Object.defineProperties(this, Object.getOwnPropertyDescriptors(opts)); //defunc(opts))); //copy getters + values without running them yet
    Object.defineProperty(this, "numpx", {value: this.numpx}); //numpx was a getter and generates node map; trigger + prevent another call
    this.hwmap; //ensure node map is generated before caller changes node values
//collection tracking:
//    this.tags = tags;
    for (const tag of tags)
        (Model[tag] || (Model[tag] = [])).push(this);
    (Model.all || (Model.all = [])).push(this);
}
function isModel(thing) { return thing instanceof Model; };


function grid(width, height)
{
    const shnodes = new SharedArrayBuffer(u32bytes((width || 1) * (height || 1))); //in case caller is multi-threaded
    const nodes1D = new Uint32Array(shnodes); //(width || 1) * (height || 1)); //TODO: shared array buffer? likely !needed with thread affinity
//debug("grid:", "byte len", nodes1D.buffer.byteLength, "width", width, "ofs*", u32bytes(width || 1), "height", height || 1, u32bytes(height || 1));
    const retval = Object.freeze(Array.from({length: width || 1}, (_, x) => new Uint32Array(nodes1D.buffer, /*debug*/(x * u32bytes(height || 1)), height || 1))); //CAUTION: columns rather than rows to allow "[x][y]" indexing rather than "[y][x]"; only makes a difference with hwmap anyway
//debug(`new ${commas(width || 1)} x ${commas(height || 1)} grid from`, srcline(+1));
    nodes1D.fill(this.UNMAPPED); //used as hwmap during init; allows caller to map pixels to hardware
//debug("nodes1D set to unmapped");
    return retval;
}
TODO("proxy to catch/fix bad indexing?");


//analyze node map:
function analyze()
{
//debug("analyze1");
//    const hwmap = new Int32Array(this.nodes1D); //nope- clone node map < caller overwrites with node data; CAUTION: must alloc memory here; don't share mem with this.nodes
//debug("analyze2", this.nodes1D.length);
    if (this.numpx != this.num_wired) fatal(`'${this.name}' expected ${commas(this.num_wired)} px, got ${commas(this.numpx)}`);
    if (this.width > 1 && this.height > 1) //sanity check
    {
        const testval1 = this.nodes1D[this.height + 1];
        const oldval1 = this.nodes2D[1][1];
        assert(oldval1 == testval1, `failed test: ${hex(oldval1)} == ${hex(testval1)}`);
        this.nodes2D[1][1] = ~testval1;
        const newval1 = this.nodes2D[1][1];
        assert(newval1 != testval1, `failed test: ${hex(newval1)} != ${hex(testval1)}`);
        this.nodes2D[1][1] = testval1; //restore in case it was mapped

        const testval2 = this.nodes2D[1][2];
        const oldval2 = this.nodes1D[this.height + 2];
        assert(oldval2 == testval2, `failed test: ${hex(oldval2)} != ${hex(testval2)}`);
        this.nodes1D[this.height + 2] = ~testval2;
        const newval2 = this.nodes1D[this.height + 2];
        assert(newval2 != testval2, `failed test: ${hex(newval2)} != ${hex(testval2)}`);
        this.nodes1D[this.height + 2] = testval2; //restore in case it was mapped
    }
//NOTE: hwmap.length depends on virtual grid w/h, not numpx; could be <> numpx
    assert(/*hwmap*/ this.nodes1D.length == (this.width /*|| 1*/) * (this.height /*|| 1*/), `hwmap ${/*hwmap*/ this.nodes1D.length} != width ${this.width} * height ${this.height}`.brightRed);
//    for (let n = 0; n < hwmap.length; ++n)
//    {
//        if (n >= this.hwmap.length) throw `undef node ${n} in hwmap 0..${this.hwmap.length - 1}`;
//        if (u32(hwmap[n]) == this.UNMAPPED) continue; //CAUTION: signed to unsigned compare
//        if (n >= this.hwmap.length) debug(`${this.name}: ${n} !in hwmap[0..${this.hwmap.length})?!`.brightRed);
//        if (hwmap[n] < 0 || hwmap[n] >= this.numpx) throw `${this.name}: hwmap[${n}/${hwmap.length}] ${hwmap[n]} from nodes[x ${Math.floor(n / this.height)}, y ${n % this.height}] !in range [0..${this.numpx})`.brightRed;
//    }
    const nodemap = {};
    const dups = [], nulls = [];
    for (let x = 0; x < (this.width /*|| 1*/); ++x)
        for (let y = 0; y < (this.height /*|| 1*/); ++y)
        {
//debug(x, y, hwmap[x * (this.height /*|| 1*/)  + y]);
            const hwofs = this.nodes2D[x][y]; //hwmap[x * (this.height /*|| 1*/)  + y];
            if (u32(hwofs) == this.UNMAPPED) { nulls.push({x, y}); continue; } //CAUTION: sgn to uns cmp
            if (hwofs < 0 || hwofs >= this.numpx) fatal(`${this.name}: hwmap[${x}/${this.width}, ${y}/${this.height}] ${hwofs} out of range 0..${this.numpx - 1}`);
            (nodemap[hwofs] || (nodemap[hwofs] = [])).push({x, y}); //`[${x}, ${y}]`);
        }
    for (const hwofs in nodemap) if (nodemap[hwofs].length > 1) dups.push(hwofs);
    if (nulls.length) warn("'%s' %s node%s no hardware: %s", this.name, commas(plural(nulls.length)), plural(), nulls.map(xy => `[x ${xy.x}, y ${xy.y}]`).join(", "));
    if (dups.length) debug("'%s' %s node%s overlapping: %s", this.name, commas(plural(dups.length)), plural(), dups.map(hwofs => nodemap[hwofs].map(xy => `[x ${xy.x}, y ${xy.y}]`).join("+") + " => " + hwofs).join(", "));
    const parent = this;
    const retval = Object.entries(nodemap).sort(([lkey], [rkey]) => lkey - rkey).map(([key, val]) => ({hwofs: +key, xylist: val, get asRGB() { return parent.nodes2D[this.xylist[0].x][this.xylist[0].y]; }})); //[+key, val]); //force hwofs (key) to be numeric; index lookup in typed array fails otherwise :(  NOTE: could be gaps for unmapped nodes
//debug(retval);
//debugger;
//                    output.push(`"${this.width} x ${this.height}",${Object.keys(this.nodes2D).map((inx) => `"[${inx}][*]"`).join(",")}\n`);
//too strict    assert(retval.length == this.numpx, `${this.name} ${this.area} hwmap ${retval.length} size mismatch #px ${this.numpx}`.brightRed);
    if (retval.length != this.numpx) warn(`${this.name} ${this.area} hwmap len ${retval.length} != mismatch #px ${this.numpx}`);
    return retval;
}
TODO("add putter/getter for overlapping nodes");


function nullpx(opts)
{
//    return model(`nullpx[${count}]: NULLPX`, () => mapall(grid(count)));
//    const {nodes2D, width: W, height: H} = grid(SQSIZE * 2, SQSIZE / 2); //hacked panel
    const count = isobj(opts)? opts.count || 1: +opts || 1;
    return Model(Object.assign({name: `null px[${count}]: NULL`}, mapall(grid(count))));
}

function mapall()
{
    const numpx = this.numpx; // = /*grid.nodes2D? grid.nodes2D.length * grid.nodes2D[0].length:*/ grid.nodes1D.length;
    for (let n = 0; n < numpx; ++n) this.nodes1D[n] = n;
//    return grid;
}


//Model methods:
function isModel(thing) { return thing instanceof Model; }

function fill(color, rect, blender) //v2
{
    const want_debug = this.debug-- > 0;
//    if (isUN(color)) throw "fill no color".brightRed; //too error-prone to default
    const [X, Y, W, H] = rect? [rect.X || +rect.x || 0, rect.Y || +rect.y || 0, rect.W || +rect.w || this.width, rect.H || +rect.h || this.height]: [0, 0, this.width, this.height];
//if (want_debug)
//    debug("fill %'d x %'d = %'d node%s with %s %s", W, H, plural(W * H), plural(), isary(color)? "image": "scalar", isary(color)? color.map(c => hex(c, "0xFF")).join(", "): hex(color || BLACK, "0xFF"));
    if (isary(color)) //image
    {
debug("fill ary", X, Y, W, H, want_debug, srcline(+1));
        assert(!blender); //TODO
        if (W * H != color.length) warn("src len %s != dest len %s x %s = %s", commas(color.length), commas(W), commas(H), commas(W * H));
        if (!rect) 
            this.nodes1D.set(color);
        else //column-by-column partial fill
            for (let x = 0; x < W; ++x)
                this.nodes2D[X + x].set(color.slice(x * H, (x + 1) * H), Y);
    }
    else if (XPM.isXPM(color)) //&& color.constructor.name == "XPM")
    {
debug("fill xpm");
        assert(!blender); //TODO
        for (let x = 0; x < Math.min(W - X, color.width); ++x)
        {
            const col = this.nodes2D[X + x];
            for (let y = 0; y < Math.min(H - Y, color.height); ++y)
                col[Y + y] = color.palette[color.colorinx[y][x]]; //actual color
        }
    }
    else //scalar
    {
        const RGB = asRGB(color || 0); //(isobj(color) && color.RGB) || color; //NOTE: Uint32Array can't hold obj
debug("fill", color, {RGB, hex: hex(RGB), X, Y, W, H, want_debug, w: this.nodes2D.length}, srcline(+1));
        if (!rect && !blender)
            this.nodes1D.fill(RGB); //for (const col of this.nodes2D) col.fill(coloVL, r || BLACK);
        else if (!blender) //column-by-column partial fill
            for (let x = 0; x < Math.min(W, this.width - X); ++x)
                this.nodes2D[X + x].fill(RGB, Y, Y + H);
        else //pixel-by-pixel partial blended fill
            for (let x = 0; x < Math.min(W, this.width - X); ++x)
                for (let y = 0; y < Math.min(H, this.height - Y); ++y)
                    this.nodes2D[X + x][Y + y] = blender(this.nodes2D[X + x][Y + y], x, y);
    }
    this.dirty = true;
//    this.dump("after fill");
}

function fillinto(other_model, color, rect, blender)
{
//    wisemen[0].fillinto(model, 1, wisemen[0], wisemen[0].body);
    const want_debug = this.debug-- > 0;
    if (isUN(color)) fatal("fill no color"); //too error-prone to default
    const [X, Y, W, H] = rect? [rect.X || +rect.x || 0, rect.Y || +rect.y || 0, rect.W || +rect.w || this.width, rect.H || +rect.h || this.height]: [0, 0, this.width, this.height];
    const target = new Rect({X, Y, W, H});
//    debug("fill %'d x %'d = %'d node%s with %s %s", W, H, plural(W * H), plural(), isary(color)? "image": "scalar", isary(color)? color.map(c => hex(c, "0xFF")).join(", "): hex(color || BLACK, "0xFF"));
    assert(!isary(color)); //TODO: image
    assert(!XPM.isXPM(color)); //TODO: xpm
//scalar
    const RGB = asRGB(color); //(isobj(color) && color.RGB) || color; //NOTE: Uint32Array can't hold obj
debug("fillinto", color, {RGB, hex: hex(RGB), X, Y, W, H, want_debug, w: this.nodes2D.length, "rect?": !!rect, "blender?": !!blender}, srcline(+1));
    if (!rect && !blender)
        this.hwmap.forEach(node => other_model.nodes1D[node.hwofs] = RGB);
    else if (!blender) //column-by-column partial fill
//        for (let x = 0; x < Math.min(W, this.width - X); ++x)
//            this.nodes2D[X + x].fill(RGB, Y, Y + H);
        this.hwmap.map((node, inx) => /*debug("fillinfo", {inx, hwofs: node.hwofs, xy: node.xylist[0], hits: target.hits(node.xylist[0])}) &&*/ target.hits(node.xylist[0]) && (other_model.nodes1D[node.hwofs] = RGB));
    else //pixel-by-pixel partial blended fill
//        for (let x = 0; x < Math.min(W, this.width - X); ++x)
//            for (let y = 0; y < Math.min(H, this.height - Y); ++y)
//                this.nodes2D[X + x][Y + y] = blender(this.nodes2D[X + x][Y + y], x, y);
        this.hwmap.map(node => target.hits(node.xylist[0]) && (other_model.nodes1D[node.hwofs] = u32(blender(other_model.nodes1D[node.hwofs], RGB))));
}
TODO("create proxy node2D for fillinto?");


function setxy(points, color)
{
//    const want_debug = this.debug-- > 0;
    if (isUN(color)) throw "setxy no color".brightRed; //too error-prone to default
    const RGB = asRGB(color); //(isobj(color) && color.RGB) || color; //NOTE: Uint32Array can't hold obj
debug("setxy", points.length, JSON.stringify(points), color, RGB, hex(RGB), srcline(+1));
    points.forEach(point => /*debug("setxy", JSON.stringify(point), {x: point.x || point[0], y: point.y || point[1]}) &&*/ (this.nodes2D[point.x || point[0] || 0][point.y || point[1] || 0] = RGB));
//        if (isary(point)) this.nodes2D[point[0], point[1]] = color || PAL.OFF);
//        else if (isobj(point)) 
    this.dirty /*||=*/ = this.dirty || points.length;
}


//show node contents on screen:
//NOTE: uses caller-defined x/y (row/col) 2D coords
function dump(label, opts)
{
    debug(label || this.name, srcline(+1));
    const no_alpha = ((opts || {}).want_alpha !== false)? color => color & 0xFFFFFF: as_is;
    debug(this.area + ` contents${!no_alpha(0xff000000)? ", no alpha": ""}:`);
    const linelen = (opts || {}).linelen || this.width; //16;
    for (let y = 0; y < this.height; ++y)
        for (let x = 0; x < this.width; x += linelen)
            debug(`[${y}, ${x}]: ` + Array.from({length: this.width}, (_, x) => this.nodes2D[x][y]).map(rgb => hex(no_alpha(rgb))).join(" ")); //kludge: Uint32Array can't hold strings, so create normal ary here; CAUTION: jumping across cols, doesn't matter for debug/display purposes
    debug("dirty", this.dirty);
//    debug("-end-");
}


//write node map to csv:
TODO("fix this");
async function csv(label, fmt)
{
    const outfile = name2file(`data/${label || `${this.name}`}-model.csv`);
    outfile.writeln(`"${this.area}",${Object.keys(this.nodes2D).map((inx) => `"[${inx}][*]"`).join(",")}`);
    for (let y = 0; y < (this.height /*|| 1*/); ++y)
//wrong values            outfile.writeln(`"[*][${flip(y, this.height)}]",${this.nodes2D.map((col, x, all) => `${(all[x][flip.latest] == UNMAPPED)? '"x"': all[x][flip.latest]}`).join(",")}`); //origin is bottom left, but need to display top-to-bottom
//show hwmap, *not* current node values (might have changed):
        outfile.writeln(`"[*][${flip(y, this.height /*|| 1*/)}]",${this.nodes2D.map((col, x) => `${commas(this.hwmap[x * (this.height /*|| 1*/) + flip.latest]).replace(UNMAPPED.toString(), '"x"')}`).join(",")}`); //origin is bottom left, but need to display top-to-bottom
    outfile.writeln("");
    outfile.writeln(`total ${commas(this.numpx)} of ${commas(plural((this.width /*|| 1*/) * (this.height /*|| 1*/)))} node${plural()} mapped`.split(/\s+/).map((str) => `"${str}"`).join(","));
    outfile.end();
//        outfile.close();
//        debug("wrote %'d lines to '%s'", outfile.numwrites, outfile.name);
    await outfile.wait4close();
}


//dump node contents (for firmware gen):
//NOTE: uses hw map (node indexing)
TODO("no_alpha -> model.opts");
async function emit(label, opts) //, fmt)
{
//debug(JSON.stringify(this.hwmap));
//too strict    assert(this.hwmap.length == this.numpx, `hwmap len ${this.hwmap.length} != numpx ${this.numpx}`);
    const no_alpha = ((opts || {}).want_alpha !== false)? color => color & 0xFFFFFF: as_is; //color => color;
    const outfile = name2file(`data/${label || `${this.name}`}-emit.csv`);
    outfile.writeln(`;//${this.area} grid, ${commas(this.numpx)}/${commas(plural(this.nodes1D.length))} node${plural()} mapped${!no_alpha(0xff000000)? ", no alpha": ""}, ${datestr({want_time: true})}:`);
//    Object.entries(this.hwmap).forEach(([key, nodes], inx, all) => debug(`node[${inx}/${all.length}]: key ${key}, xy list ${nodes.length}:`, nodes.map(xy => `[x ${xy.x}, y ${xy.y}]`)));
//    const pal = this.hwmap.map(node => no_alpha(this.node2rgb(node))) //this.nodes2D[node.xylist[0].x][node.xylist[0].y]))
//        .reduce((palette, rgb) => (++palette[rgb] || (palette[rgb] = 1), palette), {}); //TODO: handle mult nodes
//    const pal_sorted = Object.entries(pal).map((palent, inx) => (palent.push(inx), palent))
//        .sort((lhs, rhs) => rhs[1] - lhs[1]); //desc freq, tag with orig inx before sorting
    const pal = Object.entries(this.hwmap.map(node => no_alpha(this.node2rgb(node)))
        .reduce((palette, rgb) => (++palette[rgb] || (palette[rgb] = 1), palette), {})) //TODO: handle mult nodes
        .map((palent, inx) => (palent.push(inx), palent)) //[key, node, pre_sort_inx]
        .sort((lhs, rhs) => rhs[1] - lhs[1]); //desc freq, tag with orig inx before sorting
    const pal_lkup = pal/*_sorted*/.reduce((lkup, palent, inx) => (lkup[palent[0]] = inx, lkup), {}); //rgb -> pal inx
    if ((opts || {}).want_pal !== false)
    {
        outfile.writeln(`;//${commas(plural(pal/*_sorted*/.length, "ies", "y"))} palette entr${plural()}:`);
        pal/*_sorted*/.forEach((palent, inx) => outfile.writeln(`;//palent[${/*palent[2]*/ inx}]: ${hex(palent[0])}, #occ ${commas(palent[1])}`));
    }
//debug(JSON.stringify(this.nodes1D));
//    const nodevals = Array.from({length: this.numpx}
    if ((opts || {}).want_grid !== false)
    {
        const linelen = Math.min((opts || {}).linelen || this.width, this.width); // || this.width; //16;
        outfile.writeln(";//grid data:");
        for (let ofs = 0; ofs < this.numpx; ofs += linelen)
//        outfile.writeln(`"[*][${flip(y, this.height || 1)}]",${this.nodes2D.map((col, x) => `${commas(this.hwmap[x * (this.height || 1) + flip.latest]).replace(UNMAPPED.toString(), '"x"')}`).join(",")}`); //origin is bottom left, but need to display top-to-bottom
//wrong        outfile.writeln(" DW " + Array.from(this.nodes1D.slice(ofs, ofs + linelen)).map(pxval => hex(no_alpha(pxval))).join(", ") + ";"); //CAUTION: need new (generic) ary here; Uint32Array won't hold hex strings
            outfile.writeln(" DW " + this.hwmap.slice(ofs, ofs + linelen).map(node => node.xylist.length? "[" + pal_lkup[no_alpha(this.node2rgb(node))] + "]": "null").join(", ") + `: //${commas(ofs)}..${commas(Math.min(ofs + linelen, this.hwmap.length) - 1)}`); //hwmap is ary of {x,y} index into nodes2D; NOTE: just taking first value for now
    }
    if ((opts || {}).want_rle !== false)
    {
        const linelen = 16; //Math.min((opts || {}).linelen, this.width) || this.width; //16;
        const rle = []; //list of node1D inx that change from previous color
        this.hwmap.forEach((node, inx, all) =>
        {
//if (inx < 50) debug("RLE", {inx, rle_count: rle.length, numpx: this.numpx, cur: hex(no_alpha(this.node2rgb(node))), prev: inx? hex(no_alpha(this.node2rgb(all[inx - 1]))): "--", ne_prev: !inx || no_alpha(this.node2rgb(node)) != no_alpha(this.node2rgb(all[inx - 1]))});
            if (!inx || no_alpha(this.node2rgb(node)) != no_alpha(this.node2rgb(all[inx - 1]))) rle.push(inx);
        });
        outfile.writeln(`;//${commas(plural(rle.length))} RLE block${plural()}:`);
        for (let ofs = 0; ofs < rle.length; ofs += linelen)
            outfile.writeln(" RLE " + rle.slice(ofs, ofs + linelen).map((blkst, inx, all) => commas((rle[ofs + inx + 1] || this.hwmap.length) - blkst) + "*[" + pal_lkup[no_alpha(this.node2rgb(this.hwmap[blkst]))] + "]").join(", ") + `; //${rle[ofs]}..${rle[ofs + linelen] || this.hwmap.length - 1}`);
    }
    if ((opts || {}).want_hwmap !== false)
    {
        outfile.writeln(`;//${commas(plural(this.hwmap.length))} hw mapped node${plural()}:`);
//        this.hwmap.forEach(node => outfile.writeln(`;//node[${node.hwofs}] ${plural(node.xylist.length)} node${plural()}: ${node.xylist.map(xy => `[${xy.x},${xy.y}]`).join(", ")}`));
        const linelen = (opts || {}).linelen || this.width; //16;
        const numdig = commas(this.numpx).length; //make it a little easier to read
//debug(numdig);
//outfile.writeln(JSON.stringify({
//outfile.writeln("hwmap " + JSON.stringify(this.hwmap));      
        for (let y = this.height - 1; y >= 0; --y)
            for (let xofs = 0; xofs < this.width; xofs += linelen)
                outfile.writeln(`;//[${xofs}..${Math.min(xofs + linelen, this.width) - 1}, ${y}]: ` + Array.from({length: this.width}, (_, x) => commas((this.hwmap.find(node => node.xylist[0].x == xofs + x && node.xylist[0].y == y) || {hwofs: "--"}).hwofs, numdig), numdig).join(" ")); //`${xofs + x},${y}`).join(" ")); //xLights model import wants csv
    }
    if ((opts || {}).want_xls !== false)
    {
        outfile.writeln(`//${commas(plural(this.hwmap.length))} xls/xLights tsv node${plural()}:`);
//        this.hwmap.forEach(node => outfile.writeln(`;//node[${node.hwofs}] ${plural(node.xylist.length)} node${plural()}: ${node.xylist.map(xy => `[${xy.x},${xy.y}]`).join(", ")}`));
        const linelen = (opts || {}).linelen || this.width; //16;
        const numdig = commas(this.numpx).length; //make it a little easier to read
//debug(numdig);
//outfile.writeln(JSON.stringify({
//outfile.writeln("hwmap " + JSON.stringify(this.hwmap));      
        for (let y = this.height - 1; y >= 0; --y)
            for (let xofs = 0; xofs < this.width; xofs += linelen)
                outfile.writeln(Array.from({length: this.width}, (_, x) => no_commas((this.hwmap.find(node => node.xylist[0].x == xofs + x && node.xylist[0].y == y) || {hwofs: -1}).hwofs + 1, numdig), numdig).join("\t")); //`${xofs + x},${y}`).join(" ") + ` #[${xofs}..${Math.min(xofs + linelen, this.width) - 1}][${y}]`); //put tag @end so it can be dropped without affecting node map; CAUTION: first node is 1 not 0
    }
    outfile.writeln(";//eof");
    outfile.end();
//        outfile.close();
//        debug("wrote %'d lines to '%s'", outfile.numwrites, outfile.name);
    await outfile.await4close();
    function no_commas(val, dig) { return val; }
}

//get (mapped) rgb value for a hw node:
//analyze() already reported empty or dup nodes; here just checks + chooses from conflicting values
//function nodergb(inx, pxlist, no_alpha)
//{
////    if (pxlist.length == 1) return this.nodes2D[pxlist.x][pxlist.y]; //simple case: exactly 1 choice
//    const retval = Object.keys(pxlist.map(xy => no_alpha(this.nodes2D[xy.x][xy.y])).reduce((nodevals, rgb) => (++nodevals[rgb], nodevals), {}));
//    if (retval.length != 1) warn(`node[${inx}] has ${retval.length} choices: ${retval.map(rgb => hex(rgb)).join(", ")}, using ${isUN(retval[0], this.bgcolor)}`);
//    return isUN(retval[0], this.bgcolor);
//}

function node2rgb(node) { return this.nodes2D[node.xylist[0].x][node.xylist[0].y]; }


/////////////////////////////////////////////////////////////////
////
/// helpers:
//

my_exports({ZZ, flip, Rect}); //, isRect}); //top, right});
//Rect(); //kludge: init prototype before first use

//define within ctor func to allow hoist
//for inheritance see https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Objects/Inheritance
//rect corners:
function Rect(...args) //opts)
{
//debug("is rect?", isRect(this), srcline(+1), srcline(+2));
    if (!isRect(this)) return new Rect(...args); //opts);
//    Object.call(this, ...args); //base class
//    const [opts] = args;
//debug("arect proto", Object.getPrototypeOf(this), this.constructor.name);
    const opts = defunc(args[0]) || {};
    if (!Rect.cls_init) //add props + methods to prototype; wan't done earlier due to hoist
    {
        Rect.cls_init = true;
        Rect.isRect = isRect; //(thing) = function(thing) { return thing instanceof Rect; };
        Rect.prototype = Object.create(Object.prototype, //); //inherit from base
//class props + methods:
//        Object.defineProperties(Rect.prototype, //Object.getPrototypeOf(this),
        {
            constructor: { value: Rect, }, //enumerable: false, }, //writable: true, }, //hide from "for in" loops
//        cls_init: { value: true, }, //enumerable: true, writable: false, },
            left:
            {
//                value: function() { return this.X || 0; }, enumerable},
                get() { return this.X || 0; },
                enumerable,
            },
            rightE: //CAUTION: edge (+1)
            {
                get() { return this.left + this.width; }, //X + this.W /*- 1*/; },
                set(newval) { this.W = Math.max(newval - (this.X /*- 1*/ || 0), 0); }, //clamp
                enumerable,
            },
            topE: //CAUTION: edge (+1)
            {
                get() { return this.bottom + this.height; }, //this.Y + this.H /*- 1*/; },
                set(newval) { this.H = Math.max(newval - (this.Y /*- 1*/ || 0), 0); }, //clamp
                enumerable,
            },
            bottom: //{ value: function() { return this.Y || 0; }, enumerable},
            {
                get() { return this.Y || 0; },
                enumerable,
            },
            width: { get() { return this.W || 1; }, enumerable, }, //alias
            centerX: { value: function(w) { return Math.trunc((this.width - (w || 0)) / 2); }, },
            height: { get() { return this.H || 1; }, enumerable, }, //alias
            numpx: { get() { return this.width * this.height; }, enumerable, },
            isEmpty: { get() { return !this.numpx; }, enumerable, },
            empty: { value: function() { this.W = this.H = 0; }, },
            hits: { value: function(xy) { return xy.x >= this.left && xy.x < this.rightE && xy.y >= this.bottom && xy.y < this.topE; }, },
            area: { get() { return `w ${this.width} x h ${this.height} = ${this.numpx}`; }, enumerable, },
        });
//debug("cls init", Object.getOwnPropertyDescriptors(Rect.prototype));
//noworky: debug("cls init", Object.getOwnPropertyDescriptors(this.prototype));
//debug("cls init", Object.getPrototypeOf(this));
  //      debug("need to re-create obj with correct prototype");
        return new Rect(...args); //opts); //kludge: re-create obj with correct prototype
    }
//debug(methodsof(this.prototype));
//    Object.defineProperties(this, //define some default props
//    {
//        X: {value: 0, enumerable, configurable},
//        Y: {value: 0, enumerable, configurable},
//        W: {value: 1, enumerable, configurable},
//        H: {value: 1, enumerable, configurable},
//        R: {get() { return this.X + this.W - 1; }, enumerable, configurable},
//        T: {get() { return this.Y + this.H - 1; }, enumerable, configurable},
//    });
//instance props + methods:
    this.srcline = srcline(+1.5); //track origin for easier debug
//nope    Object.assign(this, opts || {});
    Object.defineProperties(this, Object.getOwnPropertyDescriptors(opts)); //defunc(opts) || {})); //copy getters + values without running them yet, override defaults
    return this;
}
function isRect(thing) { return thing instanceof Rect; }


//zig-zag:
function ZZ(val, limit)
{
    const [cycle, step] = [Math.floor(val / limit), val % limit];
//debug(`ZZ(${val}, ${limit}) = [${cycle}, ${step}]`);
//    return (cycle & 1)? limit - step - 1: step;
    ZZ.cycle = cycle;
    return (cycle & 1)? flip(step, limit): step; //limit - step - 1: step;
}
//if (!module.parent) setImmediate(() => rgbtree().dump()); //unit-test; run after inline init


//flip (mirror):
function flip(val, limit)
{
//    return flip.latest = /*Array.isArray(val)? val.map((item) => flip1(item, limit):*/ flip1(val, limit);
//    function flip1(val, limit) { return (val < 0)? 0: (val >= limit)? limit - 1: limit - val - 1; } //clamp
    return flip.latest = (val < 0)? /*0*/ limit - 1: (val >= limit)? /*limit - 1*/ 0: Math.floor(limit - val - 1); //clamp
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// module:
//


function my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }


//CLI/unit test (debug):
//to validate use https://www.rapidtables.com/convert/color/rgb-to-hsv.html
// or https://www.rapidtables.com/convert/color/hsv-to-rgb.html
if (!module.parent)
{
    console.log(`Use "npm test" rather than running index.js directly.`.brightCyan, srcline());
    console.log("exports:".brightBlue, Object.entries(module.exports)
        .map(([key, val]) => `${key} = ${fmt(val, {truncate: 50, base: key.match(/mask|map/i)? 16: 10})} (${fmt.typeof})`), srcline());
    console.log("unit tests:".brightCyan, srcline());
    const testr = new Rect({W: 3, H: 4});
    console.log("new Rect", JSON.stringify(testr), methodsof(testr), {left: testr.left, right: testr.rightE, top: testr.topE, bottom: testr.bottom, width: testr.width, height: testr.height}, testr, srcline());
//    const testr2 = new Rect();
//    console.log("new Rect2", JSON.stringify(testr2), methodsof(testr2), {left: testr2.left, right: testr2.rightE, top: testr2.topE, bottom: testr2.bottom});
    const testm = new Model({/*width: 1, height: 1,*/ get numpx() { this.nodes2D[0][0] = 0; return 1; }});
    console.log("new Model", JSON.stringify(testm), methodsof(testm), srcline());
    for (let xy = 0; xy < 4*3; ++xy)
        debug("ZZ", xy, ZZ(xy, 4), ZZ.cycle);
}

//eoffunction my_exports(things) { return Object.assign(module.exports, things); } //{[entpt.name]: entpt}); }

//eof