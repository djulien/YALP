//misc utility functions for typical class-related setup

'use strict';

var inherits = require('inherits');
var stack = require('my-plugins/utils/caller').stack;

module.exports.nameof = nameof;
module.exports.add_prop = add_prop;
module.exports.allow_opts = allow_opts;
module.exports.inherits_etc = inherits_etc;
module.exports.inst_tracking = inst_tracking;
module.exports.caller_exports = caller_exports;
module.exports.inherits = inherits; //might as well also expose this one since we have it anyway


function nameof(thing)
{
    var name = (thing + '').match(/^function\s+([A-Z_0-9$]+)\s*\(/i);
    if (name) name = name[1];
    if (!name) throw "can't figure out caller's name";
    return name;
}


//find caller's exports:
function caller_exports(level_adjust)
{
    var caller = stack(2 + (level_adjust || 0)); //1 == self, 2 == my caller
//    var caller_exports = require(caller); //caller's module.exports; don't use this - access by module id rather than path
    var caller_module_exports = require.cache[caller].exports; //find caller using filename rather than id
    if (!caller_module_exports) throw "can't find " + caller + " exports";
//    console.log("caller's exports", Object.keys(caller_exports));
//    var name = nameof(classname);
//    console.log("typeof " + nameof(thisclass) + " " + typeof thisclass + ", typeof " + nameof(superclass) + " " + typeof superclass);
//    console.log("caller ", caller);
//    console.log("add " + classname + " to caller's exports", Object.keys(caller_module.exports));
    return caller_module_exports;
}


//allow parent to track instances:
function inst_tracking(parent)
{
    parent.all = {}; //allow class to keep track of instances
    Object.defineProperties(parent.all, //NOTE: enumerable + redefinable default to false, read-only defaults to true
    {
        length: {value: 0, configurable: true}, //make it read-only but redefinable
        push:
        {
            value: function(inst)
            {
                this[inst.name || inst.opts.name || 'inst#' + this.length] = inst;
//                ++this.length; //throws read-only exception
                Object.defineProperty(parent.all, 'length', {value: this.length + 1}); //update read-only value (node inspector seems to be more picky about this than Chrome itself)
            },
        },
    });
}


//do some common class setup stuff:
function inherits_etc(thisclass, superclass, exports)
{
    if (arguments.length > 1) inherits(thisclass, superclass);
    caller_exports(+1)[nameof(thisclass)] = thisclass; //add another name to caller's exports
    inst_tracking(thisclass);
//    thisclass.prototype.add_prop = add_prop;
    thisclass.add_prop = add_prop; //NOTE: need to bind this one before using it
    allow_opts(thisclass);
}


//add a read-only property:
function add_prop(name, value, vis)
{
    if (this[name]) return; //already there
    Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); //}.bind(this); //expose prop but leave it read-only
}


//allow default options to be preset on a ctor:
//NOTE: this sets up a static hash on the ctor itself, not the prototype
function allow_opts(classname)
{
    classname.DefaultOptions = {};
    Object.defineProperty(classname, 'opts',
    {
        get() { return classname.DefaultOptions; },
        set(newopts) //iterate over options and add to current defaults
        {
            if (!classname.DefaultOptions) classname.DefaultOptions = {};
            newopts.forEach(function(opt_val, opt_name) { classname.DefaultOptions[opt_name] = opt_val; });
        },
    });
}


//eof
