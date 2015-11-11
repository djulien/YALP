#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict'; //catch errors more easily

var Clock = require('my-plugins/utils/clock');
var Elapsed = require('my-plugins/utils/elapsed');
var logger = require('my-plugins/utils/logger');
var ipc = require('my-plugins/utils/ipc');
var baseclass = require('my-plugins/utils/my-eventemitter2').EventEmitter2; //eventemitter2').EventEmitter2; //https://github.com/asyncly/EventEmitter2
var inherits = require('inherits');
function ipc_eventemitter(opts)
{
//    if (!(this instanceof ipc_eventemitter)) return new ipc_eventemitter.apply(this, arguments);
    if (!(this instanceof ipc_eventemitter)) return new (ipc_eventemitter.bind.apply(Sequence, [null].concat(Array.from(arguments))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
    baseclass.apply(this, arguments);
    var m_que = ipc('player#0'); //TODO: allow multiple instances?
    var m_reply = null;
    this.on = function(name, cb)
    {
        m_que.rcv(name, function(data, reply_cb)
        {
            m_reply = reply_cb;
            cb(data);
        }
    }
    this.emit = function(name, args)
    {
        if (!m_reply) throw "ipc-eventemitter: no active req to emit-reply to";
        m_reply(
    }
}
inherits(ipc_eventemitter, baseclass);
baseclass = ipc_eventemitter; //wedge in shim

const STATES = {idle: 0, playing: 1, paused: 2, error: -1};
const MSGTYPES = {error: -1, warn: 0, ack: 1};

//Player is a separate process so it can be started/stopped independently of other components
//only one player should be instantiated, but define a class to allow multiple in future

if (module && module.exports) module.exports = Player;
if (module.main == __filename) new Player.apply(this, process.argv); //instantiate now if running as a separate process


function Player(opts)
{
    if (!(this instanceof Player)) return new Player.apply(this, arguments);
    baseclass.apply(this, arguments);
    opts = ((typeof opts !== 'object') && (typeof opts !== 'undefined'))? {thing: opts}: opts || {};

    this.isPlayer = true; //used for context/type checking
    var m_started = Clock.Now();
    var m_elapsed = new Elapsed();
    var m_frame = {}; //{frnum, timestamp, ports}
    var m_ports = []; //{device, handler}
    var m_media = {}; //{path, duration}
    var m_state = STATES.idle;

//    addprop('duration', function(newval)
//    {
//        if (newval) throw "Duration is read-only"; //only allow it to be cleared
//        return true;
//    });
    addprop('speed')(function(newval)
    {
        this_check();
        if (newval != 1.0) throw "TODO: speed";
//TODO        if (this.selected < this.songs.length) this.songs[this.selected].speed = newval;
        return true;
    });
    addprop('volume', function(newval)
    {
        this_check();
//        if (this.decoder) mp3volume.setVolume(this.decoder.mh, newval); //TODO
        return true;
    });
//    require('./mixins/promise-keepers')(this, 7500);

//reply:
    this.error = function(args) { return this.emit.apply(this, 'error', arguments); }
    this.warn = function(args) { return this.emit.apply(this, 'warn', arguments); }
    this.ack = function(args) { return this.emit.apply(this, 'ack', arguments); }
//var error, warn, ack;
    function set_reply(cb)
    {
        this_check();
        this.error = cb? function(msg) { cb({status: MSGTYPES.error, msg: msg}): null;
        this.warn = cb? function(msg) { cb({status: MSGTYPES.warn, msg: msg}): null;
        this.ack = cb? function(msg) { cb({status: MSGTYPES.ack, msg: msg}): null;
    }

//command dispatch:
    this.on('cmd', function(data, reply_cb)
    {
        set_reply(reply_cb);
//    seqnum = data;
        switch (data.cmd)
        {
//        case 'play': reply(play(data)); break;
//        case 'pause': reply(pause(data)); break;
//        case 'quit': reply(quit(data)); break;
//        case 'media': reply(media(data)); break;
//        case 'ports': reply(ports(data)); break;
//        case 'volume': reply(volume(data)); break;
//        case 'speed': reply(speed(data)); break;
//        case 'seek': reply(seek(data)); break;
            default: error("Unknown command: '%s'", data.cmd || '(none)');
        }
    }.bind(this));

//frame data handler:
    this.on('frame', function(frame, reply_cb)
    {
        set_reply(reply_cb);
//debugger;
        logger(10, "player got frame data:", frame);
        port_feedback(); //gather up return data before sending anything new; give it max available time
        if (frame.time < 
        var isdue = (frame.time - this.elapsed_loop <= m_opts.tslop); }.bind(this);

    send();

    function send() //1-shot
    {
//        if (seqnum < 5) console.log("reply ", {seqnum: seqnum}, states);
        if (reply({seqnum: seqnum++}) <= 0) { console.log("stopped sending"); return; } //stop sending
//        if (seqnum % 10) //~1K/sec
//        if (seqnum % 100) //~7.5K/sec
        if (seqnum % 1000) //~33K/sec
            process.nextTick(function() { send(); });
        else
            setTimeout(function() { send(); }, 10);
    }
});


function play(opts)
{
    if (opts)
    return {status: MSGTYPE.ack, msg: sprintf("Unknown command: '%s':, data.cmd || '(none)'));
}

//eof







    var m_ports = {};
    (opts.ports || []).forEach(function(port, inx)
    {
        logger(10, "Player instantiating port[%d/%d] '%s' using handler '%s', %d options:", inx, opts.ports.length, port.name, port.handler, port.opts.length, port.opts);
        var device = new require(port.handler).apply(this, port.opts); //instantiate port, don't open yet
        if (device) m_ports[name] = device; //m_ports[name].isopen = true; }
    });
    if (!Object.keys(m_ports).count) this.warn("No Player ports");
    function closeall()
    {
        var closed = 0;
        for (var name in m_ports)
        {
            if (!m_ports[name].isopen)) continue;
            m_ports[name].close();
            m_ports[name].isopen = false;
            ++closed;
        }
        logger(10, "Player: closed %d/%d ports", closed, Object.keys(m_ports).length);
    }

    this.on('cmd', function(cmd, opts)
    {
        if (!this.isPlayer) throw "wrong 'this'"; //paranoid/sanity context check
//enforce encapsulation by using private functions:
        switch (cmd || '')
        {
            case 'play':
                if (resume.call(this, opts)) return;
//                play.apply(this, Array.prototype.slice.call(arguments, 1));
                play.apply(this, Array.from(arguments).slice(1));
                return;
            case 'pause': pause.call(this, opts); return;
//            case 'resume': resume.call(this, opts); return;
            case 'stop': stop.call(this, opts); return;
            case 'volume': this.volume = opts; return;
            case 'speed': this.speed = opts; return;
            case 'quit': closeall(); return;
            default: this.warn("Unknown player command: '%s'", cmd || '');
        }
    }.bind(this));

    var m_private;
//add private/cached prop:
    addprop = function(name, validate) //chkprop,
    {
//        var m_private; //private so it can be cached across songs
//        var chkprop = 'is' + that.constructor.name;
        Object.defineProperty(this, name,
        {
            get: function() { return m_private[name]; },
            set: function(newval)
            {
//                if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
                if (!this.isPlayer) throw "This is not a Player"; //paranoid/sanity context check
                if (!validate || validate(newval)) m_private[name] = newval; //do this even if value didn't change (setter might need it again)
            }, //.bind(this),
            enumerable: true,
        });
    } //.bind(this);
}
inherits(Player, baseclass);


Player.prototype.addMedia = function(filename)
{
    if (!this.isSequence) throw "wrong 'this'"; //paranoid/sanity context check


//eof
