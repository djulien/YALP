//multi-core test
//idea:
// reserve one core for lighting I/O (to maximize L1 cache hits), then spawn child process on another core for cpu-intensive rendering; child process can shift between cores, non critical
//setup:
//in /boot/cmdline.txt add "isolcpus=0" to reserve first core for I/O handling
//run this js file on first core using "taskset -c 0 node thisfile.js"
//use "top" then "1" to show utilization of each core

'use strict';
require('colors');
//require('my-plugins/my-extensions/json-revival');
const fs = require('fs');
//const JsonStreamer = require('stream-json/Streamer');
//const through2 = require('through2');
//const readline = require('readline');
//const Readable = require('stream').Readable;
//const Writable = require('stream').Writable;
const stream = require('stream');
const childproc = require('child_process');
const OS = require('os');
const datefmt = require('dateformat');
const buffer = require('buffer');
buffer.INSPECT_MAX_BYTES = 120;


//stream api https://nodejs.org/docs/latest/api/stream.html
//for stream examples see https://github.com/substack/stream-handbook
//for multi-core examples see http://blog.carbonfive.com/2014/02/28/taking-advantage-of-multi-processor-environments-in-node-js/


function main()
{
//	console.log("i'm on cpu %d/%d".blue, getPSR(process.pid), OS.cpus().length);
//	step(gen_test());
//	return;

	switch (process.argv[2])
	{
		case 'r': create(); break;
		case 'w': playback(); break;
		default: console.log("huh? %s", process.argv[2]);
	}
}


function create()
{
	var src = rdstm();
//	src.setEncoding('utf8'); //return data as strings
//	src.setEncoding('hex'); //return data as hex strings
//	src.resume(); //start flow
//	var obj2txt = through2.obj(function(chunk, encoding, next) { this.push(JSON.stringify(chunk, null, 4) + '\n'); next(); })
//	var obj2txt = new stream.Transform({transform: function(chunk, encoding, next) { this.push(JSON.stringify(chunk) + '\n'); next(); }});

//	if (false)
	{
		src = src.pipe(Object2Text());
		var sink = fs.createWriteStream('stream.txt');
		src.pipe(sink);
		src.pipe(watch(process.stdout, "stdout")); //, {end: true}); //start flow, end writer when reader ends
	}
	if (false)
	setTimeout(function()
	{
		for (var i = 0; i < 5; ++i) console.log(i, src.read());
	}, 5000);
}


function playback()
{
//	var n = 0; src.on('readable', function() { if (++n < 6) console.dir(src.read()); }); //data is available
//	process.stdin.pipe(wr());
	var src = fs.createReadStream('stream.txt');
	src = src.pipe(Text2Object());
//	const rl = readline.createInterface({input: src});
//	rl.on('line', (line) => { console.log('Line from file:', line); });

	var sink = wrstm();
//	sink.write("hello");
//	sink.end("bye");
	src.pipe(Object2Text())
		.pipe(watch(process.stdout, "stdout")); //, {end: true}); //start flow, end writer when reader ends
	src.pipe(sink);
}


////////////////////////////////////////////////////////////////////////////////////
////
/// readable stream (render)
//

//readable stream:
//send rendered frame data
function rdstm()
{
	return step(inner());
//generator + yield allows async code to be written using sync style
function* inner()
{
//	const epoch = Date.now(); //elapsed();
	console.log("rd stm created", stamp(null)); //epoch));
	var rs = watch(new stream.Readable({objectMode: true, highWaterMark: 2, read: function(size_ignored) { step(this.myit); } }), "readable"); //read ahead max 2 frames
	rs.desc = "read stream"; //for easier debug
//	var old_push = rs.push; rs.push = function(str) { return old_push.call(rs, (str !== null)? str + '\n': str); };
//    var old_write = port.inbuf.write;
//    port.inbuf.write = function(args) { logger("inbuf write"); return old_write.apply(port.inbuf, arguments); }
/*
	rs.pushframe = function(data, delay)
	{
//		if (this.isTTY && (str !== null)) str += '\n';
		if (typeof data !== 'String') data = JSON.stringify(data) + '\n'; //make compatible with text streams; must be string or buffer, not object
//		console.log("send: " + str);
//no worky		if (this.ended || this.finished) { console.log("stream ended"); return; }
//		yield this; //give caller readable stream; don't generate chunks until requested
//		setTimeout(function () { if (!rs.eof) rs.push.call(rs, str); }, 100);
//		setTimeout(function () { rs.push.call(rs, str); }, 500);
		console.log("push " + str);
		return {rstrm: this, pushret: this.push(str)};
	};
*/
//	rs._read = function(size_ignored) { step(this.myit); } //wake up stream when consumer wants more data

	const seqlen = 5*1000-2, interval = 20*50, numintv = Math.ceil(seqlen / interval);
	for (var frnum = 0, delay = 0; frnum <= numintv /*delay < seqlen + interval*/; ++frnum, delay += interval)
	{
		var wait4req = frame(delay, 'frame ' + frnum);
		if (wait4req) yield wait4req; //wait until sink wants more data
//		yield rs; //enque first frame so it's available on demand, *then* wait until reader wants more data
	}
//	yield rs; //wait until reader wants data
//	rs.pushline('-eof-');
	console.log("rd stm eof", stamp());
	rs.push(null); //eof
//	rs.close();
//	return rs;

	function frame(delay, data) //package and send next frame
	{
debugger;
		var buf = {delay: delay, data: data};
//		if (rs.isTTY && (str !== null)) str += '\n';
//		if ((typeof data == 'string') || Buffer.isBuffer(data)) return data; //okay to send as-is
//		if (typeof buf !== 'String')) buf = JSON.stringify(data) + '\n'; //make compatible with text streams; must be string or buffer, not object
		if (!delay) rs.push({delay: -1, seqlen: seqlen, interval: interval, numintv: numintv, comment: 'created ' + datefmt(Date.now())});
		var want_more = rs.push(buf); //enque data immediately so it's available on demand, *then* wait until reader wants more
		console.log("rd stm more? %s, pushed", want_more, buf, stamp());
		return !want_more? function(myit) { /*myit.step()*/ rs.myit = myit; return rs; }: null;
	}
}
}


////////////////////////////////////////////////////////////////////////////////////
////
/// writable stream (hardware control)
//

//writable stream:
//sends data to hardware using precise timing
function wrstm()
{
//	const epoch = Date.now(); //elapsed();
	console.log("wr stm created", stamp(null));
//	var ws = watch(new stream.Writable(
	var ws = watch(new stream.Transform( //kludge: Writable uses Socket which rejects objects, so use inbound side of Transform instead
	{
		objectMode: true,
//		readableObjectMode: true,
		highWaterMark: 2, //read ahead max 2 frames
		decodeStrings: true,
//		write: function(chunk, enc, next_cb)
		transform: function(chunk, enc, done_cb)
		{
debugger;
//			if (typeof chunk === 'String') chunk = JSON.parse(chunk, enc);
//			chunk = JSON.parse(chunk, enc); //only needed if options.decodeStrings == false
//			if ((typeof chunk !== 'String') && !Buffer.isBuffer(chunk)) chunk = JSON.stringify(chunk) + '\n'; //make compatible with text streams; must be string or buffer
//			step(this.myit, chunk);
//			this.push(chunk);
			var delay = 0;
			if (typeof chunk.delay != 'undefined')
			{
//??				if (chunk.delay === 0) epoch = Date.now(); //reset to account for startup latency
				delay = chunk.delay - elapsed();
			}
			console.log("delay %d msec for:", delay, chunk, stamp());
			if (delay > 0) setTimeout(function() { console.log("wr", chunk.data, stamp()); done_cb(); }, delay); //done_cb(); //tell sender to write more data
			else { console.log("wr immed", chunk.data || chunk.comment, stamp()); done_cb(); }
		},
	}), "writable");
	ws.desc = "write stream"; //for easier debug
	return ws;

	return step(inner());
//generator + yield allows async code to be written using sync style
function* inner()
{
//	const epoch = Date.now(); //elapsed();
	console.log("wr stm created", stamp(null));
	var ws = watch(new stream.Writable({objectMode: true, highWaterMark: 2, xdecodeStrings: true }), "writable"); //write ahead max 2 frames
	ws.desc = "write stream"; //for easier debug
	ws._write = function(chunk, enc, next)
	{
debugger;
//		if (typeof chunk === 'String') chunk = JSON.parse(chunk, enc);
//		chunk = JSON.parse(chunk, enc); //only needed if options.decodeStrings == false
		console.log("write:", chunk);
//		step(this.myit, chunk);
		next(); //tell sender to write more data
	};

//	yield wait4frame();
	for (;;)
	{
		var frame = yield wait4frame();
		console.log("wr stm", frame, stamp());
		if (!frame) break; //eof
//		yield wait(frame.delay);
	}
	console.log("wr stm eof", stamp());

	function wait4frame()
	{
		return function(myit) { ws.myit = myit; return ws; };
	}
}
}


////////////////////////////////////////////////////////////////////////////////////
////
/// transforms
//

function Object2Text()
{
	var retval = inner();
	retval.desc = "object to text"; //for easier debug
	return retval;
function inner()
{
	return new stream.Transform(
	{
		readableObjectMode: true,
		writableObjectMode: true, //NOTE: required; allows objects to be received without error, then stringified
		transform: function(chunk, enc, done_cb)
		{
//console.log("obj2txt:", chunk, enc);
			if ((typeof chunk !== 'String') && !Buffer.isBuffer(chunk)) chunk = JSON.stringify(chunk) + '\n'; //make compatible with text streams; must be string or buffer
			this.push(chunk);
			done_cb();
		},
	});
}
}


//parse JSON text lines back into objects:
//see example at https://nodejs.org/api/stream.html
function Text2Object()
{
	var retval = inner();
	retval.desc = "text to object"; //for easier debug
	return retval;
function inner()
{
	return new stream.Transform(
	{
		readableObjectMode: true, //NOTE: required; allows objects to be written
//		writableObjectMode: true, //NOTE: required; allows delimited strings to be parsed back into objects
		transform: function(chunk, enc, done_cb)
		{
//console.log("txt2obj:", chunk, enc);
debugger;
//			var data = (enc === 'buffer')? 
//				JSON.parse(chunk, (key, value) => { return (value && (value.type === 'Buffer'))? Buffer.from(value.data): value; }):
//				chunk.toString(enc);
			var data = (enc !== 'buffer')? chunk.toString(enc): chunk.toString(); //NOTE: can't use JSON.parse yet because text line might be incomplete
			if (this.linebuf) data = this.linebuf + data;
			var lines = data.split(/\r?\n/);
			this.linebuf = lines.pop(); //splice(lines.length-1,1)[0]; //save last partial line for next time
//			lines.forEach(this.push.bind(this));
			lines.forEach(function(line) { this.push(parse(line)); }.bind(this));
			done_cb();
		},
		flush: function(done_cb)
		{
			if (this.linebuf) this.push(parse(this.linebuf));
			this.linebuf = null;
			done_cb();
		},
	});

	function parse(str)
	{
debugger;
		return JSON.parse(str, (key, value) => { return (value && (value.type === 'Buffer'))? Buffer.from(value.data): value; });
	}
}
}


////////////////////////////////////////////////////////////////////////////////////
////
/// helpers
//

//watch for events on a stream:
function watch(stm, desc)
{
	return stm
//	var x; x
	        .on('open', function() { console.log("opened %s".green, desc); })
//CAUTION: leaves process stuck at end	        .on('readable', function(data) { console.log("readable %s".blue, desc); data = null; })
//CAUTION: triggers classic mode	        .on('data', function (data) { console.log("data %s".cyan, desc); data = null; })
	        .on('drain', function() { console.log("drained %s".green, desc); }) //writable only
	        .on('pipe', function(src) { console.log("piped %s".cyan, desc); })
	        .on('unpipe', function(src) { console.log("unpiped %s".cyan, desc); })
	        .on('end', function() { console.log("end %s".green, desc); }) //readable only?
	        .on('finish', function() { console.log("flushed %s".green, desc); }) // eof; writable only?
	        .on('close', function() { console.log("closed %s".yellow, desc); })
	        .on('error', function(err) { console.error("error %s: %j".red, desc, err.message || err); err = null; });
}


//step all the way thru a generator function:
//function x_step_delays(gen)
//{
//	var it = gen.next();
//	return it.done? it.value: setTimeout(function() { step(gen); }, it.value);
//}


//step a generator function:
//returns intermediate or final value
function step(gen, args)
{
//	console.log("step ...", arguments.length, gen);
debugger;
//	console.log(typeof gen);
	args = Array.from(arguments); args.shift();
	var retval = gen.next.apply(gen, args); //send remaining args to next yield within generator function
//	gen.step = function(args) { args = Array.from(arguments); args.unshift(gen); return step.apply(args); } //allow next step to call this function using oo syntax
//	return retval.done? retval.value: retval.value(gen);
//	console.log("... step");
	return (typeof retval.value == 'function')? retval.value(gen): retval.value;
}


//shim to step a yielded stream:
//function x_stream_yield(str_gen)
//{
//	var info = str_gen.next().value; //{str: actual stream object, more: continue reading}
//	info.str._read = function(size_ignored) //generate another chunk for reader
//	{
//		debugger;
//		var retval = str_gen.next();
//		return {rstrm: this, pushret: this.push(str)};
//	}
////	retval._flush = function() { console.log("flush"); }
//	return info.str;
//}


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


//elapsed time:
function elapsed(epoch)
{
	if (!elapsed.start || (epoch === null)) elapsed.start = epoch || Date.now(); // + (earlier || 0);
//	console.log("elapsed: (%s || %s) - %s = %s", epoch, Date.now(), elapsed.start, (epoch || Date.now()) - elapsed.start); //msec
	return (epoch || Date.now()) - elapsed.start; //msec
}


function stamp(epoch)
{
	return '@' + elapsed(epoch) + '&' + cpuid();
}


////////////////////////////////////////////////////////////////////////////////////
////
/// mainline
//

//cpu affinity test:
function cpu_loop()
{
	var x = 0;
	for (;;)
	{
		if (!(++x % 10000000)) console.log("x = " + x);
	}
}


//generator function stepping test:
//wraps async delays using sync syntax
function* gen_test()
{
	console.log("test start", stamp());
	yield wait(1000, true);
	for (var i = 0; i < 5; ++i)
	{
		console.log("test " + i, stamp());
		yield wait(2000, true);
	}
	console.log("test end", stamp());
	return -1;

	function wait(delay, adjust) //return a dispatcher function
	{
		if (!wait.cumulative) wait.cumulative = 0;
		adjust = adjust? elapsed() - wait.cumulative: 0;
//		if (adjust) console.log("timer compensate", adjust);
		wait.cumulative += delay;
		delay -= adjust; //compensate for inaccurate timer
		return function(myit)
		{
			if (delay > 0) setTimeout(function() { step(myit); }, delay);
			else step(myit); //no delay or overdue
		}
	}
}


main(); //must be at eof to errors due to avoid hoisting

//http://stackoverflow.com/questions/17960452/how-can-i-get-a-list-of-callbacks-in-the-node-work-queue-or-why-wont-node-ex
if (false)
setTimeout(function()
{
    console.log(process._getActiveHandles());
    console.log(process._getActiveRequests());
}, 10000);

//eof
