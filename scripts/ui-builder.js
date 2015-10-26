//ui bundler

'use strict';

//browserify script to bundle modules for ui
var fs = require('fs');
var path = require('path');
var browserify = require('browserify');

//from https://github.com/thlorenz/brace/blob/master/example/build.js
browserify()
//    .require(require.resolve('brace/example/javascript-editor'), { entry: true })
//    .require(require.resolve('./coffee-editor'), { entry: true })
//    .require(require.resolve('./json-editor'), { entry: true })
//    .require(require.resolve('./lua-editor'), { entry: true })
    .require(require.resolve('./ui-entry'), { entry: true })
    .bundle() //{ debug: true })
    .pipe(fs.createWriteStream(path.join(__dirname, '..', 'public', 'js', 'uibundle.js')));

//eof
