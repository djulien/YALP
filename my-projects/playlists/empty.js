//dummy YALP playlist to force custom definitions to load

'use strict';

//require('colors');
//require('longjohn'); //http://www.mattinsler.com/post/26396305882/announcing-longjohn-long-stack-traces-for-nodejs

var Playlist = require('my-projects/shared/my-models').Playlist; //playlist'); //base class
var dummy = module.exports = new Playlist({auto_collect: false, auto_play: false}); //{auto_play: false && true, loop: 2, xspeed: 10, folder: 'my-projects/songs/xmas'});

//eof
