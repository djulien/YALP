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

var portnames = [];
ChannelPool.all.forEach(function(chpool) { portnames.push(chpool.name); });


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

    var m_numfr = 0;
    var m_prevouts = null;
    var m_counts = {};
    var m_delays = {};
    var m_outbufs = {}, m_inbufs = {}, m_cmpbufs = {};
    var m_playlist = ipc.open('player');
    var m_trace = fs.createWriteStream(path.join(__dirname, '../tmp/iostats.log'), {flags: (opts.append === false)? 'w': 'a'});
    m_trace.write("start " + clock.Now.asDateTimeString() + "\n");
    m_playlist.send('iostats', "hello!", function(data) //subscribe to player iostats
    {
        if (typeof data !== 'object') return true; //ignore ack msg
        if (!data.frtime) //clear stats at start of song
        {
            m_numfr = 0;
            m_prevouts = null;
            m_counts = {};
            m_delays = {};
            m_outbufs = {};
            m_inbufs = {};
            m_cmpbufs = {};
        }
        buffix(data.outbufs);
        buffix(data.inbufs);
//        ++m_numfr;
        var numfr = Math.ceil(data.duration / 50);
        var frnum = Math.floor(data.frtime / 50);
        var showbuf = {}, buf;
        var delay_bucket = buckets(data.delay, 3);
        m_delays[delay_bucket] = (m_delays[delay_bucket] || 0) + 1;
//        var outstatus = (data.delay < -this.opts.tslop)? "overdue": delay? "not-bad": "good";
        m_counts[data.outstatus] = (m_counts[data.outstatus] || 0) + 1;
        if (data.premature) m_counts.premature = (m_counts.premature || 0) + 1;
//        (data.inbufs || {}).forEach(function(key, bufval) { m_inlens[key] = (m_inlens[key] || 0) + 1; });
//        (data.outbufs || {}).forEach(function(key, bufval) { m_outlens[key] = (m_outlens[key] || 0) + 1; });
        showbuf.position = sprintf('loop[%s], song[%s], frtime[%s] %d%%, fr# %s', isdef(data.loop)? data.loop: '-', isdef(data.song)? data.song: '-', isdef(data.frtime)? data.frtime: '-', Math.round(100 * frnum / numfr), frnum);
//show % wrt frames that have occurred so far, not total #fr; this gives a better mid-song picture
        buf = '';
        m_delays.forEach(function(count, key) { buf += ', ' + (key? '..' : '') + key + ': ' + pct(count, frnum); });
        showbuf.delay = buf.substr(2);
        buf = '';
        m_counts.forEach(function(count, key) { buf += ', ' + key + ': ' + pct(count, frnum); });
        showbuf.status = buf.substr(2);
//        buf = '';
//        (data.outbufs || {}).forEach(function(bufval, key) { buf += ', ' + key + ' ' + (bufval.length || 0); });
//        showbuf.outbufs = buf.substr(2);
//        buf = '';
//        (data.inbufs || {}).forEach(function(bufval, key) { buf += ', ' + key + ' ' + (bufval.length || 0); });
//        showbuf.inbufs = buf.substr(2);
//        if (m_prevouts)
        portnames.forEach(function(name)
        {
            var outbuf = /*data.outbufs*/ (m_prevouts || {})[name] || [];
            var outbuf_bucket = name + ':' + buckets(outbuf.length || 0, 10);
            m_outbufs[outbuf_bucket] = (m_outbufs[outbuf_bucket] || 0) + 1;
        });
        buf = '';
        m_outbufs.forEach(function(count, key)
        {
            buf += ', ' + key + ': ' + pct(count, frnum);
        });
        showbuf.outbufs = buf.substr(2);
        portnames.forEach(function(name)
        {
            var inbuf = (data.inbufs || {})[name] || [];
            var inbuf_bucket = name + ':' + buckets(inbuf.length || 0, 10);
            m_inbufs[inbuf_bucket] = (m_inbufs[inbuf_bucket] || 0) + 1;
        });
        buf = '';
        m_inbufs.forEach(function(count, key)
        {
            buf += ', ' + key + ': ' + pct(count, frnum);
        });
        showbuf.inbufs = buf.substr(2);
//        if (m_prevouts)
        portnames.forEach(function(name)
        {
            var cmp = name + ':' + (bufdiff((m_prevouts || {})[name], (m_inbufs || {})[name])? "NE": "EQ");
            m_cmpbufs[cmp] = (m_cmpbufs[cmp] || 0) + 1;
        });
        buf = '';
        m_cmpbufs.forEach(function(count, key)
        {
            buf += ', ' + key + ': ' + pct(count, frnum);
        });
        showbuf.cmpbufs = buf.substr(2);
        m_prevouts = data.outbufs; //inbufs are one frame later, so delay outbufs to match inbufs
        showbuf.time_debug = data.time_debug || '-';
        m_trace.write(JSON.stringify({data: data, showbuf: showbuf}) + '\n\n'); //showbuf.Concentrate().buffer(showbuf).result());
        console.log("iostats", showbuf);
        console.log();
//if (data.frtime == 50) { console.log("y out buf", m_prevouts['FTDI-Y'], data.outbufs['FTDI-Y'], m_prevouts['FTDI-Y'].length, data.outbufs['FTDI-Y'].length); process.exit(); }
        return true; //request more data

        function pct(val, denom)
        {
            return sprintf("%d (%d%%)", val, denom? Math.round(100 * val / denom): 0);
        }
    }.bind(this));

}

function buffix(bufs)
{
    if (!bufs) return;
    for (var port in bufs)
    {
        var buf = bufs[port];
        if (buf && !isdef(buf.length)) { console.log(buf); process.exit(1); }
        if (buf && !isdef(buf.length)) buf.length = buf.data.length; //kludge: repair buffer (type changed somewhere along the way, maybe during socketio)
    }
}

function buckets(val, size)
{
    return (val < 0)? -size * Math.floor((size - 1 - val) / size): size * Math.floor((size - 1 + val) / size);
}


var iostats = new IOStats({append: false});

//eof
