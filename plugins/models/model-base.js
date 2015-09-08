'use strict';
console.log("model-base plugin load ...");
console.timeStamp(); //shows time in FF, adds event to timeline in Chrome

var Color = require('./color');

//base class for models:
function model_base() //ctor
{
    this.xform = null; //rotate, scale
    this.xlate = [0, 0, 0]; //origin
    this.nodes = [];
    return this;
}

//model_base.fill = function(color /*:Color*/)
//{
//}

module.exports = model_base; //commonjs

console.timeStamp(); //shows time in FF, adds event to timeline in Chrome
console.log("... model-base plugin loaded");

//eof
