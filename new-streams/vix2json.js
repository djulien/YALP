no worky

'use strict';

//concise summary of duplex vs. tranform vs. read + write streams: http://stackoverflow.com/questions/18096266/whats-the-difference-between-write-and-push-for-passthrough-streams

const fs = require('fs');
const Elapsed = require('my-plugins/utils/elapsed');
const logger = require('my-plugins/utils/logger')({detail: 99, filename: "zout.log"});
const XmlStream = require('xml-stream'); //https://codeforgeek.com/2014/10/parse-large-xml-files-node/


const infile = "my-projects/songs/xmas/Amaz*/!(*-bk).vix";
const outfile = "zout.json";

var filename = glob.unique(infile);
var ins = fs.createReadStream(filename);
var xml = new XmlStream(ins);
var outs = fs.createWriteStream(outfile)
    .on('open', function() { logger("outfile '%s' opened".green, outfile); })
    .on('data', function() { logger("outfile data".blue); })
    .on('close', function() { logger("outfile '%s' closed".green, outfile); })
    .on('error', function(err) { logger("outfile '%s' error: %j".red, outfile, err); });
outs.write(JSON.stringify(xml)) //+ '\n');
outs.end(); //eof
logger("file written".cyan); //"%d frames written".cyan, frags.length);

//eof
