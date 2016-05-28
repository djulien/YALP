//#!/usr/local/bin/node
'use strict';

//require('colors');
const fs = require('fs');

debugger;
const USflag = require('./USFlag24x14.js'); //({w: 24, h: 14});
const Object2Text = require('my-plugins/streamers/txt2obj').Object2Text;
const watch = require('my-plugins/streamers/stmon').watch;

//require('my-plugins/my-extensions/json-revival');


function main()
{
	saveas();
}


function saveas()
{
	console.log("saving flag stream to stream.txt".cyan);
	var src = USflag.stream({duration: 10000, interval: 1000}); //Readable
	src = src.pipe(Object2Text());
	var sink = fs.createWriteStream('stream.txt');
	src.pipe(sink);
	src.pipe(watch(process.stdout, "stdout")); //, {end: true}); //start flow, end writer when reader ends
}


function save_delay()
{
	console.log("reading a few frames from flag stream".cyan);
	var src = USflag.stream(); //Readable
	setTimeout(function()
	{
		for (var i = 0; i < 5; ++i) console.log(i, src.read());
	}, 5000);
}


main(); //put this at eof to avoid hoisting errors

//eof
