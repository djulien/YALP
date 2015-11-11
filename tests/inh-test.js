
'use strict';

var inherits = require('inherits');

function MixinA() {}
MixinA.prototype.newfunc = function()
{
    console.log("mixin A new func");
}
MixinA.prototype.overridden = function()
{
    console.log("mixin A overridden func");
}


function MixinB() {}
MixinB.prototype.nudderfunc = function()
{
    console.log("mixin B nudder func");
}
MixinB.prototype.overridden = function()
{
    console.log("mixin B overridden func");
}


function base()
{
//    console.log("playlist args", arguments);
    if (!(this instanceof base)) return setnew(base, arguments);
    var add_prop = function(name, value, vis) { if (!this[name]) Object.defineProperty(this, name, {value: value, enumerable: vis !== false}); }.bind(this); //expose prop but leave it read-only
}
//inherits(base, MixinA); //adds new methods, does not override existing methods
//inherits(base, MixinB); //drops MixinA, adds new methods, does not override existing methods
//Object.assign(base.prototype, MixinA.prototype);
//Object.assign(base.prototype, MixinB.prototype);
//for (var i in base.prototype) console.log("base prototype[%s] = %j", i, base.prototype[i]);
//for (var i in MixinA.prototype) console.log("mixin A prototype[%s] = %j", i, MixinA.prototype[i]);
//for (var i in MixinB.prototype) console.log("mixin B prototype[%s] = %j", i, MixinB.prototype[i]);

base.prototype.func = function()
{
    console.log("base func");
}

base.prototype.overridden = function()
{
    console.log("base overridable func");
}

//inherits(base, MixinA); //completely replaces prototype
//Object.assign(base.prototype, MixinA.prototype); //overwrites all
//Object.assign(base.prototype, MixinB.prototype);

var test = new base();
if (test.func) test.func();
if (test.overridden) test.overridden();
if (test.newfunc) test.newfunc();
if (test.nudderfunc) test.nudderfunc();


function isdef(thing)
{
    return (typeof thing !== 'undefined');
}

function setnew(type, args)
{
//    if (this instanceof type) return;
    return new (type.bind.apply(type, [null].concat(Array.from(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
}

//epf