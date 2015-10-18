//add a methods to keep promise
'use strict';

module.exports = addPromiseKeeper;


//promise-keepers:
function addPromiseKeeper(that, deadline) //, chkprop)
{
//    var this_playlist = this; //kludge: preserve context; TODO: bind http://stackoverflow.com/questions/15455009/js-call-apply-vs-bind
    var chkprop = 'is' + typeof that;
    var m_promise = Q.Promise(function(resolve, reject, notify)
    {
        if (chkprop && !this[chkprop]) throw "This is not a '" + typeof that + "'"; //paranoid/sanity context check
//        var pl = new Playlist(opts, resolve, reject, notify);
        that.ready = function(msg)
        {
            if (arguments.length > 1) msg = sprintf.apply(null, arguments);
            else if (!arguments.length) msg = sprintf("%s '%s' is ready after %s", typeof that, that.name, that.elapsed.scaled());
//            if (opts.silent !== false) console.log(msg.green);
//            if (opts.debug !== false) debugger;
            that.emit((typeof that).toLowerCase() + '.ready', msg);
            that.debug();
            resolve(that);
        };
        that.error = function(msg)
        {
//            console.trace();
//            var stack = require('callsite')(); //https://www.npmjs.com/package/callsite
//            stack.forEach(function(site, inx){ console.log('stk[%d]: %s@%s:%d'.blue, inx, site.getFunctionName() || 'anonymous', relpath(site.getFileName()), site.getLineNumber()); });
            if (arguments.length > 1) msg = sprintf.apply(null, arguments);
//            if (opts.silent !== false) console.log("Playlist '%s' ERROR after %s: ".red, msg, this_playlist.name, this_playlist.elapsed.scaled(), msg);
//            if (opts.debug !== false) debugger;
            that.emit('error', msg); //redundant; this one will be emitted automatically
            that.debug();
            reject(msg);
        };
        that.warn = function(msg)
        {
//            if (opts.silent !== false) console.log("Playlist '%s' warning: ".yellow, msg);
//            if (opts.debug !== false) debugger;
            that.emit((typeof that).toLowerCase() + '.warn', msg);
            notify(msg);
        };
    })
    .timeout(deadline, typeof that + " is taking too long to load!");
//not needed?? caller has until process.nextTick to pend changes anyway
//    this.isReady = function(cb) //expose promise call-back as a method so playlist api can be used before it's ready
//    {
//        return m_promise.then(cb);
//    }

    var m_pending = 0;
//NOTE: at least one pend/unpend must occur in order for playlist to be marked ready (resolved)
    that.pend = function(count, msg)
    {
        if (chkprop && !this[chkprop]) throw "This is not a '" + typeof that + "'"; //paranoid/sanity context check
//http://stackoverflow.com/questions/15455009/js-call-apply-vs-bind
        if (typeof count === 'string') { msg = count; count = null; Array.prototype.splice.call(arguments, 0, 0, 1); }
        if (arguments.length > 2) msg = sprintf.apply(null, Array.prototype.slice.call(arguments, 1));
        if (arguments.length > 1) that.warn(msg);
//console.log("playlist %s pend+ %d", this.name, m_pending);
        m_pending += (count || 1);
    }
    this.unpend = function(count, msg)
    {
        if (chkprop && !this[chkprop]) throw "This is not a '" + typeof that + "'"; //paranoid/sanity context check
        if (typeof count === 'string') { msg = count; count = null; Array.prototype.splice.call(arguments, 0, 0, 1); }
        if (arguments.length > 2) msg = sprintf.apply(null, Array.prototype.slice.call(arguments, 1));
        if (arguments.length > 1) this.warn(msg);
//        console.log("playlist %s pend- %d", this.name, m_pending - (num || 1));
        m_pending -= (count || 1);
        if (m_pending) return;
        this.ready();
    }
}

//eof
