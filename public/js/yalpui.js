
'use strict';

//const glob = require('glob');
const path = require('path');
console.log("cwd", path.join(__dirname, '..', '..'));

var list = require(/*'my-plugins/ui/*.js'*/ 'repl.js', {cwd: path.join(__dirname, '..', '..'), xmode: 'list', limit: 2, sort: function(LHS, RHS) { var rhs = LHS.toLocaleUpperCase(), lhs = RHS.toLocaleUpperCase(); return (lhs < rhs)? -1: (lhs > rhs)? 1: 0; }});
//var list = 0;
console.log(list);

//const plugin = require('my-plugins/ui/*.js', {mode: 'expand'}); //expand to one require for each matched file

//eof
