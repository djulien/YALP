//EventEmitter2 extensions:
//use TCP for ipc events
//allow events to be logged (mainly for debug or just general comfort)


require('colors'); //var colors = require('colors/safe');
var events = module.exports = require('eventemitter2'); //https://github.com/asyncly/EventEmitter2
//var shortname = require('my-plugins/utils/shortname');
//var caller = require('my-plugins/utils/caller');
var logger = require('my-plugins/utils/logger'); //.logger;
var inspect = require('util').inspect;

logger("TODO: ipc events".red);

var base_emit = events.EventEmitter2.prototype.emit;
events.EventEmitter2.prototype.emit_logged = function(args) //show events; helpful for debug or just general comfort
{
//    var colors = require('colors/safe');
//    if (opts.silent !== false)
//    {
    if (arguments[0] != "newListener")
    {
        var type = args.match(/error/i)? 'red': args.match(/warn/i)? 'yellow': args.match(/ready|done/i)? 'green': 'blue';
//            arguments[1] = arguments[1][type];
//            console.log.apply(null, arguments);
        ++logger.depth_adjust; //show my caller, not me
        logger(10, /*colors[type]*/"%s %s event: %s"[type], /*shortname(module.parent.filename) caller(3),*/ this.constructor.name, arguments[0] || '??', inspect(arguments[1] || '??', {depth: 1})); //JSON.stringify(arguments[1] || '??'));
        debugger;
    }
//    }
    base_emit.apply(this, arguments); //CAUTION: avoid inf loop when overriding emit with emit_logged
}


//eof
