'use strict';
//YALP server - main logic

require('yalp-plugins/misc/debug');
require('yalp-plugins/formatters/load-debug');
//BROKEN require('yalp-plugins/formatters/line-stamps');
require('autostrip-json-comments'); //https://github.com/uTest/autostrip-json-comments

//BROKEN var assert = require('yalp-plugins/formatters/my-insist'); //'insist'); //http://seanmonstar.com/post/69703845045/insist-better-assertions-for-nodejs
//var someArr = [15, 20, 5, 30];
//assert(someArr.every(function(val) { return val > 10; }));
//console.log("assert", assert);
//assert(1 < 2);
//assert(1 > 2);
//var j = require('./test.json');
//console.log(j);

//require('./dummy');
var p = require('yalp-plugins/misc/first');
p("hello");

console.log("-exit-");
//eof
