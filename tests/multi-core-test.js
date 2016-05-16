//multi-core test
//idea:
// reserve one core for lighting I/O (to maximize L1 cache hits), then spawn child process on another core for cpu-intensive rendering; child process can shift between cores, non critical
//setup:
//in /boot/cmdline.txt add "isolcpus=0" to reserve first core for I/O handling
//run this js file on first core using "taskset -c 0 node thisfile.js"
//use "top" then "1" to show utilization of each core

'use strict';
require('colors');
const fs = require('fs');
const Readable = require('stream').Readable;
const Writable = require('stream').Writable;
const childproc = require('child_process');
const OS = require('os');


//stream api https://nodejs.org/docs/latest/api/stream.html
//for stream examples see https://github.com/substack/stream-handbook
//for multi-core examples see http://blog.carbonfive.com/2014/02/28/taking-advantage-of-multi-processor-environments-in-node-js/


function main()
{
	console.log("i'm on cpu %d/%d".blue, getPSR(process.pid), OS.cpus().length);
//	step(gen_test());
//	return;

//	var info = gen.next().value;
	var src = step(rdstm());
//	src.setEncoding('utf8'); //return data as strings
//	src.setEncoding('hex'); //return data as hex strings
//	src.resume(); //start flow
	if (false)
	{
		var sink = fs.createWriteStream('stream.txt');
		src.pipe(sink);
		src.pipe(watch(process.stdout, "stdout"), {end: true}); //start flow, end writer when reader ends
	}
//	var n = 0;
//	if (false)
	setTimeout(function()
	{
		for (var i = 0; i < 5; ++i) console.log(i, src.read());
	}, 5000);
//	src.on('readable', function() { if (++n < 6) console.dir(src.read()); }); //data is available
//	process.stdin.pipe(wr());
	return;
	var sink = step(wrstm());
//	sink.write("hello");
//	sink.end("bye");
	src.pipe(sink);
//	src.pipe(process.stdout, {end: true}); //start flow, end
}


////////////////////////////////////////////////////////////////////////////////////
////
/// readable
//

//readable stream:
//generator + yield allows async code to be written using sync style
function* rdstm()
{
	const epoch = Date.now(); //elapsed();
	console.log("rd stm created", '@' + elapsed(epoch));
	var rs = watch(new Readable({objectMode: true, highWaterMark: 2, read: function(size_ignored) { this.myit.step(); } }), "readable"); //read ahead max 2 frames
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
//	rs._read = function(size_ignored) { this.myit.step(); } //wake up stream when consumer wants more data

	const seqlen = 1000-2, interval = 50;
	for (var frnum = 0, delay = 0; delay < seqlen + interval; ++frnum, delay += interval)
	{
		var wait4req = frame(delay, 'frame ' + frnum);
		if (wait4req) yield wait4req; //wait until sink wants more data
//		yield rs; //enque first frame so it's available on demand, *then* wait until reader wants more data
	}
//	yield rs; //wait until reader wants data
//	rs.pushline('-eof-');
	console.log("rd stm eof", '@' + elapsed(epoch));
	rs.push(null); //eof
//	return rs;

	function frame(delay, data) //package and send next frame
	{
		var buf = data = {delay: delay, data: data};
//		if (rs.isTTY && (str !== null)) str += '\n';
		if (typeof buf !== 'String') buf = JSON.stringify(data) + '\n'; //make compatible with text streams; must be string or buffer, not object
		var want_more = rs.push(buf); //enque data immediately so it's available on demand, *then* wait until reader wants more
		console.log("rd stm more? %s, pushed", want_more, data, '@' + elapsed(epoch));
		return !want_more? function(myit) { /*myit.step()*/ rs.myit = myit; return rs; }: null;
	}
}


////////////////////////////////////////////////////////////////////////////////////
////
/// writable
//

//writable stream:
//generator + yield allows async code to be written using sync style
function* wrstm()
{
	const epoch = Date.now(); //elapsed();
	console.log("wr stm created", '@' + elapsed(epoch));
	var ws = watch(new Writable({objectMode: true, highWaterMark: 2, xdecodeStrings: true }), "writable"); //write ahead max 2 frames
/*
	ws._write = function(chunk, enc, next)
	{
//		if (typeof chunk === 'String') decode;
		debugger;
		console.log("write:", chunk);
		next(); //tell consumer to write more data
	};
	return ws;
*/

	for (;;)
	{
		var frame = yield wait4frame();
		console.log("wr stm", frame, '@' + elapsed(epoch));
		if (!frame) break; //eof
	}
	console.log("wr stm eof", '@' + elapsed(epoch));

	function wait4frame()
	{
		return function(myit) { /*myit.step()*/ rs.myit = myit; return rs; };
	}
}


////////////////////////////////////////////////////////////////////////////////////
////
/// helpers
//

//watch for events on a stream:
function watch(str, desc)
{
	return str
//	var x; x
	        .on('open', function() { console.log("opened %s".green, desc); })
	        .on('readable', function(data) { console.log("readable %s".blue, desc); data = null; })
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
function step(gen)
{
	debugger;
//	console.log(typeof gen);
	var retval = gen.next(); //step generator function to next yield
	gen.step = function() { return step(gen); } //allow next step to call this function using oo syntax
//	return retval.done? retval.value: retval.value(gen);
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
function getPSR(pid) //, callback)
{
    var exec = childproc.execSync;
    var command = 'ps -A -o pid,psr -p ' + pid + ' | grep ' + pid + ' | grep -v grep |head -n 1 | awk \'{print $2}\'';
    var result = exec(command);
    return result.toString("utf-8").trim();
}


//elapsed time:
function elapsed(epoch)
{
	if (!elapsed.start) elapsed.start = epoch || Date.now(); // + (earlier || 0);
	return (epoch || Date.now()) - elapsed.start; //msec
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
	console.log("test start", '@' + elapsed());
	yield wait(1000, true);
	for (var i = 0; i < 5; ++i)
	{
		console.log("test " + i, '@' + elapsed());
		yield wait(2000, true);
	}
	console.log("test end", '@' + elapsed());
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
			if (delay > 0) setTimeout(function() { myit.step(); }, delay);
			else myit.step(); //no delay or overdue
		}
	}
}


main(); //must be at eof to errors due to avoid hoisting

//eof
