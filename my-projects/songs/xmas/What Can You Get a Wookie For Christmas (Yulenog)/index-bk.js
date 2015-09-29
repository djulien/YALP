//YALP custom sequence proxy; collects misc data and presents it as a sequence object to YALP

'use strict';

var seq = module.exports = require('my-projects/songs/sequence.js'){auto_collect: true}); //base class; defines default behavior
//var Model = require('my-projects/models.js'); //base class
//var Model =
//var Fx =

//var seq = module.exports = /*new*/ Sequence({auto_collect: true}); //comonjs

seq.name = 'Wookie';
//seq.path = './What Can You Get a Wookie for Christmas (Yulenog & Nathan Kuruna-trimmed).mp3';
//seq.tracks = './tracks.txt'; //Audacity label file
/*not needed, too complicated
function Wookie(path, name) //ctor
{
    base.call(this, arguments); //parent ctor
    this.cues =
    [
    ];
    this.models =
    [
    ];
    return this;
};
//for js oop intro see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript
Wookie.prototype = Object.create(base.prototype); //inherit from base class
Wookie.prototype.constructor = Wookie; //set ctor back to child class
*/
seq.models =
[
    'M-tree',
    'Gdoor',
    'Shepherd1',
    'Shepherd2',
];

//eof
