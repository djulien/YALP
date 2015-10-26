//Hween2015 YALP playlist
'use strict';

//require('colors');
//require('longjohn'); //http://www.mattinsler.com/post/26396305882/announcing-longjohn-long-stack-traces-for-nodejs


var Playlist = require('my-projects/shared/playlist'); //base class
var hween = module.exports = new Playlist({logging: 'terse'});
//hween.name = 'Hween2015';
//hween.volume = 1.0;


hween.songs =
[
    "my-projects/Hween2015/Ghost*",
    "my-projects/Hween2015/Monster*",
    "my-projects/Hween2015/Thriller*",
];
//hween.opening = "thx"; //TODO
//hween.closing = "goodnight"; //TODO


var AM = 0, PM = 1200;
hween.schedule =
[
    {
        name: 'weekof',
        day_from: 1024, //mmdd
        day_to: 1030, //mmdd
        time_from: 530 +PM, //hhmm
        time_to: 930 +PM, //hhmm
    },
    {
        name: 'dayof',
        day_from: 1031, //mmdd
        day_to: 1031, //mmdd
        time_from: 530 +PM, //hhmm
        time_to: 1130 +PM, //hhmm
    },
];


//playlist.ready(); //allow caller to use it now
//hween.debug();
//setTimeout(function() { hween.emit('cmd', 'play'); }, 10000);

//eof