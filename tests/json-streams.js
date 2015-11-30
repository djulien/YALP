
'use strict';

var fs = require("fs");


/*
var options = {};
var Parser = require("stream-json/Parser");
var parser = new Parser(options);

var fname = "sample.json";
var outfile = "zout.txt";
var next = fs.createReadStream(fname).pipe(parser);
next.pipe(fs.createWriteStream(outfile));
*/


/*
var Emitter = require("stream-json/Emitter");
var emitter = new Emitter(options);

// Example of use:

emitter.on("startArray", function(){
    console.log("array!");
});
emitter.on("numberValue", function(value){
    console.log("number:", value);
});
emitter.on("finish", function(){
    console.log("done");
});

fs.createReadStream(fname).
    pipe(parser).pipe(streamer).pipe(packer).pipe(emitter);
*/


/*
var makeSource = require("stream-json");
var source = makeSource();

var objectCounter = 0;
source.on("startObject", function(){ ++objectCounter; });
source.on("end", function(){
    console.log("Found ", objectCounter, " objects.");
});

fs.createReadStream("sample.json").pipe(source.input);
*/


//eof
