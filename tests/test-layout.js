
'use strict';

var fs = require('fs');
var glob = require('glob');
var path = require('path');
//var BISON = require('bison');
//var Concentrate = require('concentrate'); //https://github.com/deoxxa/concentrate

//var models = require('my-projects/shared/my-models');
//var empty = require('my-projects/playlists/empty');
var xmas = require('my-projects/playlists/xmas2015');
//var song = require(require.resolve(glob.sync(path.join("my-projects/songs/xmas/Amaz*", '**', '!(*-bk).js'))[0]));
xmas.auto_play = false;

debugger;
//var ports = require('my-projects/shared/my-models').Ports;
//ports.all.forEach(function(port, inx, all)

//var Model2D = require('my-projects/models/model-2d');
//Model2D.all.forEach(function(model, inx, all)
//{
//    model.setRenderType('raw'); //RgbQuant in encode() wants raw pixel data
//});

//var Color = require('onecolor');
//console.log( Color('#123456').cssa());

/*
var CustomModels = require('my-projects/shared/my-models').CustomModels;
var entire = CustomModels.entire;
//var colL = CustomModels.colL;
var ic1 = CustomModels.ic1;
//entire.fill('#fcfdfe');
//colL.fill('#101112');
//ic1.pixel(0, 0, '#223344');
//ic1.pixel(33-1, 10-1, '#667788');
ic1.fill('#336699');

entire.wrframe();
*/


/*
//var imgdata = entire.canvas.toBuffer(); //canvas.imgdata();
var imgdata = entire.imgdata();
if (imgdata) imgdata = imgdata.data;
console.log("imgdata len %s", imgdata.length); //data.length);
console.log("imgdata ", imgdata); //data.length);
var buf = new Buffer(imgdata);
//console.log("buf len %s", buf.length); //data.length);
//console.log("buf ", buf); //data.length);
*/


//console.log("playlist ", xmas);
var frdata = xmas.songs[0].render(this.frtime);
//console.log("fr[0] data", frdata);

for (var i in frdata)
    console.log("%s len %s", i, (frdata[i] || []).length);


/*
var buf = new Buffer(frdata);
var m_str = fs.createWriteStream(process.cwd() + '/frame.data', {flags: 'w', objectMode: true});
m_str.write(buf); //.data);
m_str.end(); //'\n');
*/


//var wrdata = Concentrate().buffer(frdata).result();
//m_str.end(JSON.stringify(frdata), 'utf-8');
//JSON.stringify(frdata);

//console.log("fr[0] %s bytes", BISON.encode(frdata).length);

//setTimeout(function() { console.log("handles", process._getActiveHandles()); }, 5000);
console.error("done");

//eof
