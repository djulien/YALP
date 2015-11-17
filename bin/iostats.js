#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict';

require('colors');
require('sprintf.js');
var fs = require('fs');
//var glob = require('glob');
var path = require('path');
var bufdiff = require('my-plugins/utils/buf-diff');
//var abspath = require('m-plugins/utils/abspath');
//var inherits = require('inherits');
var makenew = require('my-plugins/utils/makenew');
var caller = require('my-plugins/utils/caller').stack;
var ipc = require('my-plugins/utils/ipc');
var clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
var shortname = require('my-plugins/utils/shortname');
var Concentrate = require('concentrate'); //https://github.com/deoxxa/concentrate
//var add_method = require('my-plugins/my-extensions/object-enum').add_method;
//var baseclass = require('my-plugins/utils/my-eventemitter2').EventEmitter2; //eventemitter2').EventEmitter2; //https://github.com/asyncly/EventEmitter2
require('my-plugins/my-extensions/object-enum');


function isdef(thing) { return (typeof thing !== 'undefined'); }

//require('my-projects/shared/my-custom');
var empty = require('my-projects/playlists/empty'); //force custom models to load
var ChannelPool = require('my-projects/models/chpool');


function IOStats(opts)
{
//    console.log("player args", arguments);
    if (!(this instanceof IOStats)) return makenew(IOStats, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
    this.debug = function() { debugger; }

    add_prop('opts', (typeof opts !== 'object')? {name: opts}: opts || {}); //preserve unknown options for subclasses
    console.log("player opts %j", this.opts);
    add_prop('folder', this.opts.folder || path.dirname(caller(1, __filename))); //allow caller to override auto-collect folder in case playlist is elsewhere
    this.name = this.opts.name || shortname(this.folder); //caller(2)));
    this.started = clock.Now();

    var m_que = ipc.open('iostats'); //TODO: add designator to allow multiple iostats?
//send command to myself:
    this.cmd = function(args) //, cb)
    {
        m_que.send('cmd', Array.from(arguments), function(data, reply)
        {
            console.log("reply: ", data);
            return false; //i don't want more
        });
    }
    m_que.rcv('cmd', function(data, reply)
    {
//try{
//    console.log("cmd: length %d, data %j", data.length, data);
        switch (!data.length? data + '!': data[0] + ((data.length < 2)? '!': '*'))
        {
            case 'quit!':
                reply("will quit now");
                process.exit(0);
                break;
            default:
                reply("unknown command: %j", data);
                break;
        }
//}catch(exc){ reply("error: " + exc); }
    }.bind(this));

    var m_numfr = 0, m_prevouts = {};
    var m_counts = {};
    var m_delays = {};
    var m_cmpbufs = {};
    var m_playlist = ipc.open('player');
    var m_trace = fs.createWriteStream(path.join(__dirname, '../tmp/iostats.log'), {flags: (opts.append === false)? 'w': 'a'});
    m_trace.write("start " + clock.Now.asString() + "\n");
    m_playlist.send('iostats', "hello!", function(data) //subscribe to player iostats
    {
        if (typeof data !== 'object') return true; //ignore ack msg
        ++m_numfr;
        var showbuf = {}, buf;
        m_delays[data.delay] = (m_delays[data.delay] || 0) + 1;
        m_counts[data.outstatus] = (m_counts[data.outstatus] || 0) + 1;
//        (data.inbufs || {}).forEach(function(key, bufval) { m_inlens[key] = (m_inlens[key] || 0) + 1; });
//        (data.outbufs || {}).forEach(function(key, bufval) { m_outlens[key] = (m_outlens[key] || 0) + 1; });
        showbuf.position = 'loop[' + (isdef(data.loop)? data.loop: '-') + '], song[' + (isdef(data.song)? data.song: '-') + '], frtime[' + (isdef(data.frtime)? data.frtime: '-') + '], #' + m_numfr;
        buf = '';
        m_delays.forEach(function(val, key) { buf += ', ' + key + ' ' + pct(val); });
        showbuf.delay = buf.substr(2);
        buf = '';
        m_counts.forEach(function(val, key) { buf += ', ' + key + ' ' + pct(val); });
        showbuf.status = buf.substr(2);
        buf = '';
        (data.outbufs || {}).forEach(function(bufval, key) { buf += ', ' + key + ' ' + (bufval.byteLength || bufval.length || 0); });
        showbuf.outbufs = buf.substr(2);
        buf = '';
        (data.inbufs || {}).forEach(function(bufval, key) { buf += ', ' + key + ' ' + (bufval.byteLength || bufval.length || 0); });
        showbuf.inbufs = buf.substr(2);
        buf = '';
        (m_prevouts || {}).forEach(function(bufval, key)
        {
            var cmp = bufdiff(bufval, (data.inbufs || {})[key])? "NE": "EQ";
            key += ':' + cmp;
            m_cmpbufs[key] = (m_cmpbufs[key] || 0) + 1;
            buf += ', ' + key + ' ' + pct(m_cmpbufs[key]);
        });
        m_prevouts = data.outbufs; //inbufs are one frame later
        showbuf.cmpbufs = buf.substr(2);
        showbuf.time_debug = data.time_debug || '-';
        m_trace.write(JSON.stringify({data: data, showbuf: showbuf}) + '\n\n'); //showbuf.Concentrate().buffer(showbuf).result());
        console.log("iostats", showbuf);
        console.log();
        return true; //request more data
    }.bind(this));

    function pct(val)
    {
        return sprintf("%d (%d%%)", val, Math.round(100 * val / m_numfr));
    }
}


var iostats = new IOStats({append: false});

//eof
