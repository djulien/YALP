//get YALP config info

require('colors');
var fs = require('fs');
var path = require('path');
//var pkgpath = path.join(global.ROOTDIR, 'package.json');
//console.log("config: cwd %s".blue, process.cwd());
//console.log("config: pkg path %s".blue, pkgpath);
//console.log("THIS?".cyan, path.resolve(pkgpath, '../../package.json'));
//var pkg; //kludge: js parsers want static string, so hard-code expected case here
//if (pkgpath == 'xyz') pkg = require('xyz'); //introspect: read my package + config settings
//else pkg = require('add more cases here');
//console.log(".", fs.statSync('package.json').isFile());
//console.log("..", fs.statSync('../package.json').isFile());
//console.log("../..", fs.statSync('../../package.json').isFile());

//var pkg = require('package.json'); //require(path.join(global.ROOTDIR, 'package.json')); //introspect: read my package + config settings
//    fs.statSync('package.json').isFile()? require('package.json')
//    : fs.statSync('../package.json').isFile()? require('../package.json')
//    : fs.statSync('../../package.json').isFile()? require('../../package.json')
//    : require('../../../package.json'); //look max 3 levels deep

//NOTE: can't use require() here because nodejs will look within node_modules
//CAUTION: this assumes cwd == yalp root
var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
//console.log("pkg", pkg);

//module.exports = global.CFG = //not needed; module will be cached anyway; //make it global so other modules can check it easily
var cfg = module.exports = pkg.yalp || {};
cfg.pkg = pkg; //give access to pkg info as well
delete cfg.pkg.yalp; //remove circular ref
//??if (!cfg.debug) cfg.debug = {};
try { require('credentials')(cfg); } catch(exc) {} //pull in optional private settings from a secure place

//console.log("config: ".blue, cfg);
require('my-plugins/utils/json-bool-fixup')(cfg);

//eof
