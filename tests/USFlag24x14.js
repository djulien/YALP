//US waving flag fx
//TODO: generic scroll, rotate, zoom, fade fx

'use strict';

require('colors');
const OS = require('os');
const stream = require('stream');
const childproc = require('child_process');
const datefmt = require('dateformat');
//const makenew = require('my-plugins/utils/makenew');
//const pnglib = require('pnglib');
const XPM = require('my-plugins/image/xpm');

module.exports.stream = function (opts) { return step(USFlag(opts)); }
module.exports.images = function (img)
{
}


////////////////////////////////////////////////////////////////////////////////////
////
/// Readable stream definition
//

/* XPM */
const USflag24x13_xpm =
[
"24 13 4 2",
"  	c #000000",
". 	c #FF0000",
"# 	c #0000FF",
"& 	c #FFFFFF",
"# # # # # # # # # . . . . . . . . . . . . . . . ",
"# & # & # & # & # & & & & & & & & & & & & & & & ",
"# # & # & # & # # . . . . . . . . . . . . . . . ",
"# & # & # & # & # & & & & & & & & & & & & & & & ",
"# # & # & # & # # . . . . . . . . . . . . . . . ",
"# & # & # & # & # & & & & & & & & & & & & & & & ",
"# # # # # # # # # . . . . . . . . . . . . . . . ",
"& & & & & & & & & & & & & & & & & & & & & & & & ",
". . . . . . . . . . . . . . . . . . . . . . . . ",
"& & & & & & & & & & & & & & & & & & & & & & & & ",
". . . . . . . . . . . . . . . . . . . . . . . . ",
"& & & & & & & & & & & & & & & & & & & & & & & & ",
". . . . . . . . . . . . . . . . . . . . . . . . ",
];


//returns Readable stream of rendered frame data:
//generator + yield allows async code to be written using sync style
//options:
// duration = how long to display image (msec); 0 => one frame only; -1 => forever; default: 0
// interval = frame interval if animation is in effect (msec); default: 50
//TODO:
// w, h = image width, height (pixels); default = 24 x 13
// xofs, yofs = horizontal, vertival offsets (pixels); default = 0, 0
// fade = fade out time
// xscroll, yscroll
// wave = apply waving effect; default: false
// speed (wave)
// ripple width (wave)
function* USFlag(opts)
{
	const epoch = Date.now(); //elapsed();
//	if (typeof opts != 'object') opts = {duration: opts};
	opts = Object.assign({}, (typeof opts != 'object')? {duration: opts}: opts);
	if (isNaN(opts.duration *= 1)) opts.duration = 0; //msec
	if (isNaN(opts.interval *= 1)) opts.interval = 50; //msec
	console.log("rd stm created %s".blue, stamp(null)); //epoch));
	var rs = new stream.Readable({objectMode: true, highWaterMark: 2, read: function(size_ignored) { step(this.myit); } }); //read ahead max 2 frames
	rs.desc = "read stream"; //for easier debug

//load images:
	const flag = new XPM(USflag24x13_xpm);
	flag.resize(flag.width, flag.height + 2);
	flag.scroll(+0, +1);
	const flag_up = flag.clone(), flag_down = flag.clone();
	for (var x = 0; x < flag.width; ++x)
	{
	    if (!(Math.floor(x / 4) & 1)) continue;
	    flag_up.scroll1col(x, -1);
	    flag_down.scroll1col(x, +1);
	}

	const numintv = opts.interval? Math.ceil(opts.duration / opts.interval): 0;
	for (var frnum = 0, delay = 0; frnum <= numintv /*delay < opts.duration + opts.interval*/; ++frnum, delay += opts.interval)
	{
            var img = flag;
            switch (frnum & 3)
            {
                case 1: img = flag_up; break;
                case 3: img = flag_down; break;
            }
//            img.draw(ctx, {x: 10, y: 10, /*w: 100, h: 100,*/ scale: 20, clear: true}, true);
		var wait4req = frame(delay, img.imgdata());
		if (wait4req) yield wait4req; //wait until sink wants more data
//		yield rs; //enque first frame so it's available on demand, *then* wait until reader wants more data
	}
	console.log("rd stm eof %s".blue, stamp());
	rs.push(null); //eof

	function frame(delay, data) //package and send next frame
	{
debugger;
		var buf = {delay: delay, data: data};
//		if (typeof buf !== 'String')) buf = JSON.stringify(data) + '\n'; //make compatible with text streams; must be string or buffer, not object
		if (!delay) rs.push({delay: -1, duration: opts.duration, interval: opts.interval, numintv: numintv, opts: opts, comment: 'created ' + datefmt(Date.now())});
		var want_more = rs.push(buf); //enque data immediately so it's available on demand, *then* wait until reader wants more
		console.log("rd stm more? %s, pushed %j %s".blue, want_more, buf, stamp());
		return !want_more? function(myit) { /*myit.step()*/ rs.myit = myit; return rs; }: null;
	}
}


////////////////////////////////////////////////////////////////////////////////////
////
/// misc helpers
//

//Array scrolling extension:
if (!Array.prototype.scroll)
Array.prototype.scroll = function scroll(ofs, newvals)
{
    if (!ofs) return null;
    var svlen = this.length;
    var removed = (ofs < 0)? this.splice(0, -ofs): this.splice(this.length - ofs, ofs);
    console.log("array.scroll: removed %d..+%d: %d".blue, (ofs < 0)? 0: svlen - ofs, (ofs < 0)? -ofs: ofs, removed.length);
    if (arguments.length > 1) removed.forEach(newvals); //function(y, row) { row.forEach(function(x) { row[x] = newval; }); }); //initialize moved values
    if (arguments.length > 1) console.log("array.scroll: init to %j".blue, newvals);
    svlen = this.length;
//wrong    this.splice((ofs < 0)? this.length: 0, 0, removed);
    removed.splice(0, 0, (ofs < 0)? this.length: 0, 0);
    this.splice.apply(this, removed);
    console.log("array.scroll: added %d..+%d: %d".blue, (ofs < 0)? svlen: 0, 0, removed.length);
    return removed;
}


//step a generator function:
//returns intermediate or final value
function step(gen, args)
{
debugger;
	args = Array.from(arguments); args.shift();
	var retval = gen.next.apply(gen, args); //send remaining args to next yield within generator function
//	gen.step = function(args) { args = Array.from(arguments); args.unshift(gen); return step.apply(args); } //allow next step to call this function using oo syntax
//	return retval.done? retval.value: retval.value(gen);
	return (typeof retval.value == 'function')? retval.value(gen): retval.value;
}


//elapsed time:
function elapsed(epoch)
{
	if (!elapsed.start || (epoch === null)) elapsed.start = epoch || Date.now(); // + (earlier || 0);
	return (epoch || Date.now()) - elapsed.start; //msec
}


function stamp(epoch)
{
	return '@' + elapsed(epoch) + ' &' + cpuid();
}


//get processor of a process:
//from http://stackoverflow.com/questions/30496989/determine-which-core-is-running-node-js-process-at-runtime
function cpuid()
{
//	console.log("i'm on cpu %d/%d".blue, getPSR(process.pid), OS.cpus().length);
	return getPSR(process.pid) + '/' + OS.cpus().length;

function getPSR(pid) //, callback)
{
    var exec = childproc.execSync;
    var command = 'ps -A -o pid,psr -p ' + pid + ' | grep ' + pid + ' | grep -v grep |head -n 1 | awk \'{print $2}\'';
    var result = exec(command);
    return result.toString("utf-8").trim();
}
}


//eof
