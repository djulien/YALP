#!/usr/local/bin/node --expose-gc
//this will be executed prior to the requested node.js file
'use strict';

var path = require('path');
var target = path.resolve(process.cwd() + '/' + process.argv[2]);
console.log("node-jig on ", target);
//console.log(process.cwd());

require('my-plugins/my-extensions');
delete require.cache[target]; //kludge: make sure we get a fresh copy (sometimes node.js seems to keep old code active)
require(target);

//eof
