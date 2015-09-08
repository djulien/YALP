'use strict';
//base class for sequenced songs

console.log("sequence-base load ...");
console.timeStamp(); //shows time in FF, adds event to timeline in Chrome

var fileio = require('fileio'); //'../plugins/services/fileio');

//for js oop intro see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript
/*not needed
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
Wookie.prototype = Object.create(base.prototype); //inherit from base class
Wookie.prototype.constructor = Wookie; //set ctor back to child class
*/


//var YALP = YALP || {}; //namespace
/*YALP.*/ sequence = function(path, name) //ctor
{
    this.path = path || "";
    this.name = name || fileio.basename(path) || "";
    this.cues = [];
    this.models = [];
    return this;
};

//YALP.Sequence.prototype.load = function()
//{
//    console.log("Hello, I'm " + this.firstName);
//};


module.exports = sequence;

console.timeStamp(); //shows time in FF, adds event to timeline in Chrome
console.log("... sequence-base loaded");

//return module.exports; //send api back to caller
//eof
