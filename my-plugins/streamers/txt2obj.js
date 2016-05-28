//test<->object transforms

'use strict';

const stream = require('stream');


module.exports.Object2Text =
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
module.exports.Text2Object = 
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


//eof
