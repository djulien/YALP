
'use strict';

var empty = require('my-projects/playlists/empty');
var canvas = require('my-projects/shared/my-custom').canvas;

var ctx = canvas.getContext('2d');

//fs.readFile(__dirname + '/images/squid.png', function(err, squid)
//{
//  if (err) throw err;
//  img = new Image;
//  img.src = squid;
//  ctx.drawImage(img, 0, 0, img.width / 4, img.height / 4);
//});

/*
ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
ctx.fillRect(0, 0, 200, 200);

ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
ctx.beginPath();
ctx.lineTo(50, 102);
ctx.lineTo(50 + te.width, 102);
ctx.stroke();
*/

//ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
//ctx.fillRect(0, 0, 200, 200);
//    ctx.strokeStyle = "rgba(0, 0, 200, 0.5)";
//    ctx.moveTo(0, 0);
//    ctx.lineTo(100, 0);
//    ctx.stroke();
    ctx.strokeStyle = "rgb(200, 100, 50)";
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 100);
    ctx.stroke();

//var myImageData = ctx.createImageData(10, 10); //w, h
var myImageData = ctx.getImageData(0, 0, 10, 10); //left, top, width, height);
var buf = myImageData.data; //Uint8ClampedArray of RGBA values
console.log("w %d, h %d, len %d:", myImageData.width, myImageData.height, buf.length, buf);

//var buf = canvas.toBuffer();
//console.log(buf);


//example from https://www.npmjs.com/package/canvas
//var fs = require('fs')
//  , out = fs.createWriteStream(__dirname + '/text.png')
//  , stream = canvas.pngStream();
//stream.on('data', function(chunk) { out.write(chunk); });
//stream.on('end', function() { console.log('saved png'); });

//eof
