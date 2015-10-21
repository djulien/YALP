//EventEmitter2 extensions:
//use TCP for ipc events
//allow events to be logged (mainly for debug or just general comfort)


require('colors'); //var colors = require('colors/safe');
var events = module.exports = require('eventemitter2'); //https://github.com/asyncly/EventEmitter2
var shortname = require('my-plugins/utils/shortname');
console.log("TODO: ipc events".red);

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
        console.log(/*colors[type]*/"%s event: %s"[type], shortname(module.parent.filename), arguments[0] || '??', arguments[1] || '??');
        debugger;
    }
//    }
    base_emit.apply(this, arguments); //CAUTION: avoid inf loop when overriding emit with emit_logged
}


//eof
