//example mp3 player from https://gist.github.com/TooTallNate/3947591
//more info: https://jwarren.co.uk/blog/audio-on-the-raspberry-pi-with-node-js/

//this is impressively awesome - 6 lines of portable code!


var fs = require('fs');
var lame = require('lame');
var Speaker = require('speaker');

fs.createReadStream(process.argv[2]) //specify mp3 file on command line
    .pipe(new lame.Decoder())
    .on('format', function (format)
    {
        this.pipe(new Speaker(format));
    });

//eof
