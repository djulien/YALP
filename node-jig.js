#!/usr/local/bin/node
//this will be executed prior to the requested node.js file
'use strict';

var path = require('path');
var target = path.resolve(process.cwd() + '/' + process.argv[2]);
console.log("node-jig on ", target);
//console.log(process.cwd());

require('my-plugins/my-extensions');
require(target);

//eof
