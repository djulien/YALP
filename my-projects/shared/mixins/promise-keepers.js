//add a methods to keep promise
'use strict';

//var Q = require('q'); //https://github.com/kriskowal/q
var sprintf = require('sprintf-js').sprintf; //, vsprintf = require('sprintf-js').vprintf;
//var caller = require('my-plugins/utils/caller');
var logger = require('my-plugins/utils/logger').logger;

module.exports = addPromiseKeeper;


//promise-keepers:
function addPromiseKeeper(that, deadline) //, chkprop)
{
//    var this_playlist = this; //kludge: preserve context; TODO: bind http://stackoverflow.com/questions/15455009/js-call-apply-vs-bind
    var chkprop = 'is' + that.constructor.name;
//    /*var m_promise =*/ Q.Promise(function(resolve, reject, notify)
//    {
//        if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
//        var pl = new Playlist(opts, resolve, reject, notify);
    that.ready = function(msg)
    {
        if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
        if (this.validate) this.validate();
        if (!this.resolved) throw "already resolved"; //return; //already resolved
        if (arguments.length > 1) msg = sprintf.apply(null, arguments);
        else if (!arguments.length) msg = sprintf("%s '%s' is ready after %s", chkprop.substr(2), this.name, this.elapsed.scaled());
//            if (opts.silent !== false) console.log(msg.green);
//            if (opts.debug !== false) debugger;
        ++logger.depth_adjust; //show my caller, not me
        this.emit(chkprop.substr(2).toLowerCase() + '.ready', msg);
        this.debug();
//            resolve(this);
        clearTimeout(this.resolved); this.resolved = null;
    }.bind(that);
    that.error = function(msg)
    {
        if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
        if (!this.resolved) throw "already resolved"; //return; //already resolved
//            console.trace();
//            var stack = require('callsite')(); //https://www.npmjs.com/package/callsite
//            stack.forEach(function(site, inx){ console.log('stk[%d]: %s@%s:%d'.blue, inx, site.getFunctionName() || 'anonymous', relpath(site.getFileName()), site.getLineNumber()); });
        if (arguments.length > 1) msg = sprintf.apply(null, arguments);
//            if (opts.silent !== false) console.log("Playlist '%s' ERROR after %s: ".red, msg, this.name, this.elapsed.scaled(), msg);
//            if (opts.debug !== false) debugger;
        ++logger.depth_adjust; //show my caller, not me
        this.emit('error', msg); //??redundant; this one will be emitted automatically
        this.debug();
//            reject(msg);
        clearTimeout(this.resolved); this.resolved = null;
    }.bind(that);
    that.warn = function(msg)
    {
        if (arguments.length > 1) msg = sprintf.apply(null, arguments);
//            if (!msg)
//            {
//                require('callsite')().forEach(function(stack, inx) { console.log(stack.getFunctionName() || '(anonymous)', require('my-plugins/utils/relpath')(stack.getFileName()) + ':' + stack.getLineNumber()); });
//                throw "no msg";
//            }
//            if (opts.silent !== false) console.log("Playlist '%s' warning: ".yellow, msg);
//            if (opts.debug !== false) debugger;
        ++logger.depth_adjust; //show my caller, not me
        if (m_pending) msg += ", #pending: " + m_pending;
        this.emit(chkprop.substr(2).toLowerCase() + '.warn', msg);
//            notify(msg);
    }.bind(that);
//    }.bind(that))
//    .timeout(deadline, chkprop.substr(2) + " is taking too long to load!");
    that.resolved = setTimeout(function()
    {
        this.resolved = null;
        this.error(chkprop.substr(2) + " is taking too long to load!");
    }.bind(that), deadline);
//not needed?? caller has until process.nextTick to pend changes anyway
//    this.isReady = function(cb) //expose promise call-back as a method so playlist api can be used before it's ready
//    {
//        return m_promise.then(cb);
//    }

    var m_pending = 0;
//NOTE: at least one pend/unpend must occur in order for playlist to be marked ready (resolved)
    that.pend = function(count, msg)
    {
        if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
//http://stackoverflow.com/questions/15455009/js-call-apply-vs-bind
        var args = Array.prototype.slice.call(arguments); //extract sprintf params
//    console.log(arguments.length + " pend args: ", arguments);
        if (typeof count === 'string') { msg = count; count = null; args.splice(0, 0, null); } //Array.prototype.splice.call(arguments, 0, 0, 1); }
        if (args.length > 2) msg = sprintf.apply(null, args.slice(1)); //Array.prototype.slice.call(arguments, 1));
//    console.log(" => ", args.length, args);
        ++logger.depth_adjust; //show my caller, not me
        if (args.length > 1) this.warn(msg);
        else logger.depth_adjust = 0; //clear depth adjust in lieu of warn()->emit()->logger() call
//console.log("playlist %s pend+ %d", this.name, m_pending);
        m_pending += (count || 1);
//        console.log("PEND from %s: now %d", caller(), m_pending);
    }.bind(that);
    that.unpend = function(count, msg)
    {
        if (chkprop && !this[chkprop]) throw "This is not a '" + chkprop.substr(2) + "'"; //paranoid/sanity context check
        var args = Array.prototype.slice.call(arguments); //extract sprintf params
        if (typeof count === 'string') { msg = count; count = null; args.splice(0, 0, null); } //Array.prototype.splice.call(arguments, 0, 0, 1); }
        if (args.length > 2) msg = sprintf.apply(null, args.slice(1)); //Array.prototype.slice.call(arguments, 1));
        ++logger.depth_adjust; //show my caller, not me
        if (args.length > 1) this.warn(msg);
        else logger.depth_adjust = 0; //clear depth adjust in lieu of warn()->emit()->logger() call
//        console.log("playlist %s pend- %d", this.name, m_pending - (num || 1));
        m_pending -= (count || 1);
//        console.log("UNPEND from %s: now %d", caller(), m_pending);
        if (m_pending) return;
        this.ready();
    }.bind(that);
}


//eof
