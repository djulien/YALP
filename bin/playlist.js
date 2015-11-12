#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict';

require('colors');
var glob = require('glob');
var path = require('path');

//TODO
//var findpkg = require('my-plugins/utils/find-pkg')(__dirname);
//var cfg = require(findpkg('package.json'));
//var cfg = require('package.json');

//load main package.json:
//console.log(require.resolve(path.join(__dirname, 'package.json')));
for (var cfgdir = __dirname; cfgdir; cfgdir = path.dirname(cfgdir))
{
//    console.log("check %s", path.join(cfgdir, 'package.json'));
    try { var cfg = require(path.join(cfgdir, 'package.json')).yalp || {}; break; }
    catch (exc) {} //console.log("package.json not found at %s", cfgdir); }
}
//console.log(cfg);
//console.log("cfg path ", path.join(cfgdir, cfg.playlist)); process.exit(0);
//if (cfg.playlist) cfg.playlist = require.resolve(cfg.playlist); //path.join(cfgdir, cfg.playlist); //path.relative(__dirname, path.join(cfgdir, cfg.playlist));
//console.log("playlist %s", require.resolve(cfg.playlist)); //path.resolve(__dirname, cfg.playlist)); process.exit(0);
//console.log(glob.sync(path.join(cfgdir, cfg.playlist)));

var playlist = cfg.playlist? require(cfg.playlist): null; //'my-projects/playlists/xmas2015');
//console.log("songs %j", playlist.songs);
//if (cfg.playlist) console.log("pl", require.resolve(cfg.playlist)); process.exit(0);
//(playlist.songs || []).forEach(function(song, inx) { require(require.resolve(glob.sync(song)[0])); }); //path.relative(__dirname, glob.sync(song)[0])); });

//(playlist.songs || []).forEach(function(song, inx) { cmd('add', require.resolve(glob.sync(song)[0])); }); //path.relative(__dirname, glob.sync(song)[0])); });
//(playlist.schedule || []).sort(function(lhs, rhs) { return priority(lhs) - priority(rhs); }); //place schedule in order of preference by duration
//if ((playlist.opts || {}).autoplay) setTimeout(function() { scheduler(playlist); }, 1000); //kludge: give async files time to load

if (!playlist) { console.log("no playlist".red); process.exit(1); }
if (playlist.opts.auto_play === false) playlist.play(); //just run once if auto-play not enabled

//eof
