'use strict';

var fs = require('fs');
var lame = require('lame');
var Speaker = require('speaker');
var rpio = require('rpio');


function pir()
{
	const PIR = 13;
	rpio.open(PIR, rpio.INPUT);
	var previous;

	var check = function()
	{
//		console.log("pir " + PIR + " is " + (rpio.read(PIR)? "on": "off") + ", busy? " + (busy? "Y": "N"));
		var current = rpio.read(PIR);
		if (current && !previous) sound();
		previous = current;
//NO		rpio.msleep(100); //NOTE: interferes with mp3 playback
		setTimeout(check, 100);
	}

	check();
}


var sounds =
[
	"640149main_Computers are in Control.mp3",
	"574928main_houston_problem.mp3",
	"584852main_Apollo-12_All-Weather-Testing.mp3",
	"640148main_APU Shutdown.mp3",
	"640150main_Go at Throttle Up.mp3",
	"640164main_Go for Deploy.mp3",
	"640165main_Lookin At It.mp3",
	"640166main_MECO.mp3",
	"640173main_Vector Transfer.mp3",
];

var selected = 0;
function sound()
{
	const dir = __dirname + "/sounds/";
	if (busy) return;
	console.log("playing " + dir + sounds[selected]);
	playback(dir + sounds[selected]);
	if (++selected >= sounds.length) selected = 0;
}

//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/
//this is impressively awesome - 6 lines of portable code!
var busy;
function playback(filename)
{
	busy = true;
	fs.createReadStream(filename)
    		.pipe(new lame.Decoder())
    		.on('format', function (format)
    		{
        		this.pipe(new Speaker(format))
				.once('close', function()
				{
					console.log("done");
					busy = false;
				})
				.once('error', function()
				{
					console.log("ERROR");
					busy = false;
				});
    		})
		.once('error', function()
		{
			console.log("ERROR");
			busy = false;
		});
}


setTimeout(function()
{
	sound();
	pir();
}, 20000); //kludge: give O/S time to start up
console.log("waiting 20 sec ...");

//eof
