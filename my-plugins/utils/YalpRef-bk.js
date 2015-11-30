
'use strict';

require('colors');
const path = require('path');
const stack = require('my-plugins/utils/caller').stack;
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json

module.exports.YalpRef = YalpRef;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// JSON reviver hooks
//

// https://github.com/nodejs/node-v0.x-archive/issues/5110
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse

//wedge a generic reviver into global JSON:
JSON.old_parse = JSON.parse;
JSON.parse = function(str, old_reviver) //add reviver below to all calls
{
    return JSON.old_parse(str, revival.bind(null, old_reviver || function(key, val) { /*console.log("chain: key %s, val %j", key, val)*/; return val; })); //call my_reviver first; inject param for previous reviver
}

//let's start a revival :)
function revival(chain, key, val)
{
    var parts;
//    console.log("\nreviver IN: key '%s', val %s '%j'", key, typeof val, val);
    const rev_pattern = /^\s*([A-Z][A-Z0-9$_.]+)\s*\|\s*([^|*?<>\$]+)\s*$/i; //"ctor name | module id"; filename cannot contain | * ? < > $ (some platforms allow other chars)
    if ((typeof val.reviver == 'string') && (parts = val.reviver.match(rev_pattern))) try //try to revive object using specified ctor (generic)
    {
//        var buf = [];
//        for (var i in require.cache) buf.push(i);
//        console.log("req cache", buf.join("\n"));
        parts[2] = path.resolve(process.cwd(), parts[2]); //use abs path (rel path might not be on node search list)
//        if (!path.extname(parts[2]) parts[2] += '.js';
//        var test = require("tests/json-reviver");
//        var test = require("/home/dj/Documents/djdev/my-npm/yalp/tests/json-reviver");
//        console.log("found? %s" + !!test, test);
//        var str = (parts[1]? 'require("' + parts[2] + '").': '') + parts[1];
//        console.log("reviver: str '%s', key '%s', partial obj %j".green, str, key, val); //, this);
//        console.log("caller ", parts[2], require.cache[parts[2]]);
//        var func = eval('(' + str + ')'); //assume it's a function
        var func = require(parts[2]); //CAUTION: throws error if not found
        parts[1].split('.').forEach(function(name) { func = func[name] || func.prototype[name]; }); //console.log("'%s' in func? %s", name, !!func); }); //traverse namespaces manually
//        console.error("reviver: %j from str '%s'", (func + '').substr(0, 100), parts[0]);
        var obj = func? func(val): null;
//            if (obj) Object.assign(obj, val);
//        console.error("final obj: %j".green, obj);
        if (obj) return obj;
    }
    catch (exc) { console.log("my_reviver: %j".red, exc); }
//    var retval = chain(key, val); //try pre-existing parser or pass-thru
    var retval = chain(key, val); //try pre-existing parser or pass-thru
//    console.log("reviver OUT: key '%s', val %s '%j', retval %j", key, typeof val, val, retval);
    return val;
}


//base class to make derived classes revivable:
//toJSON + fromJSON methods will be added to any derived class, making it automatically revival via the reviver hook above
//can also be called explicily on an object or class prototype
function Revivable(inst)
{
//call as a regular function as an alternate way to make a single object or class revivable without derivation
    var caller = stack(2); //1 == me, 2 == my caller; assume caller's module is where object or class ctor is defined
    if (this instanceof Revivable) inst = this; //called from within ctor chain
    else
    {
//        console.log("Revivable: add toJSON, fromJSON to inst".blue);
        var func = require(caller); //CAUTION: throws error if not found
        (inst.constructor.name + '.fromJSON').split('.').forEach(function(name) { func = func[name] || func.prototype[name]; }); //console.log("'%s' in func? %s", name, !!func); }); //traverse namespaces manually
//        console.error("reviver: %j from str '%s'", (func + '').substr(0, 100), parts[0]);
//        var obj = func? func(val): null;
        if (func.prototype) func = func.prototype; //assume caller wants all instances to be revivable
        if (!func.toJSON) func.toJSON = Revivable.prototype.toJSON;
        if (!func.fromJSON) func.fromSON = Revivable.prototype.fromJSON;
    }
    if (!inst.reviver) //tell deserializer how to revive this object; must be instance data, not prototype
    {
//        console.log("caller ", caller, require.cache[caller]);
//        console.log("rel path", path.relative(process.cwd(), caller));
        inst.reviver = inst.constructor.name + '.fromJSON|';
        inst.reviver += path.relative(process.cwd(), caller).replace(/\.js$/i, ""); //module name relative to startup folder; trim extension if normal
//        console.log("Revivable: add reviver".blue, inst.reviver);
    }
}
module.exports.Revivable = Revivable;

Revivable.prototype.toJSON = function() //NOTE: returns shallow copy of object which will subsequently be stringified, not necessarily a string itself
{
//    var base = Object.toJSON.apply(this);
    return this; //see http://stackoverflow.com/questions/20734894/difference-between-tojson-and-json-stringify
}

Revivable.prototype.fromJSON = function(props)
{
//    console.log("TODO: override fromJSON".red);
    throw "Revivable: derived class should override fromJSON";
    return props;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// exported class
//

//somewhat of a mini-redis with custom JSON replacer/reviver
//lifespan: > 0 how long to keep in memory (msec); < 0 number of times to deserialize before dropping it; == 0 just leave it in memory
function YalpRef(data, lifespan)
{
    if (!(this instanceof YalpRef)) return makenew(YalpRef, arguments);
//deref data for more efficient + compact serialization:
    this.refdata = data; //arguments; //hang on to caller's data, but not directly within instance object
    this.lifespan = (arguments.length < 2)? 0: (lifespan > 0)? lifespan + Date.now(): lifespan || 0; //#times to deserialize; count must be shared by all consumers
}


YalpRef.prototype.toJSON = function() //NOTE: returns shallow copy of object, not a string
{
    this.ref(); //move data to shared memory so it won't be serialized
    return this; //see http://stackoverflow.com/questions/20734894/difference-between-tojson-and-json-stringify
}


YalpRef.prototype.ref = function()
{
    var ptr = this.key? YalpRef.all[this.key]: null;
    if (!ptr)
    {
        var ttl = (this.lifespan > 0)? this.lifespan - Date.now(): 99;
        if (ttl <= 0) throw "YalpRef: key " + (this.key || '(none yet)') + " expired before reffed";
        ptr = YalpRef.all[this.key = YalpRef.next_key++] = {}; //assign unique key
//        this.module = 'my-plugins/utils/YalpRef';
        var caller = stack(2); //1 == self, 2 == my caller
//        console.log("caller ", caller, require.cache[caller]);
//        console.log("rel path", path.relative(process.cwd(), caller));
        this.module = path.relative(process.cwd(), caller).slice(0, -path.extname(caller).length);
        this.reviver = 'fromJSON'; //tell receiver how to revive caller's data; must be instance data, not prototype
        console.log("moved data to shared key '%s'".cyan, this.key);
        ptr.key = this.key; //useful for debug and helps delete self
        if ((ptr.lifespan = this.lifespan) > 0) setTimeout(function() { delete YalpRef.all[ptr.key]; }, ttl); //(arguments.length < 2)? -1: (lifespan > 0)? lifespan + Date.now(): lifespan || 0, //#times to deserialize; count must be shared by all consumers
        ptr.refdata = this.refdata; //data, //arguments; //hang on to caller's data, but not directly within instance object
        delete this.lifespan; //prevent real data from being serialized
        delete this.refdata;
    }
    if (ptr.lifespan <= 0) --ptr.lifespan; //bump manual ref count
}


YalpRef.prototype.deref = function(that_key)
{
//    if (!this.key) throw "YalpRef: no ref key";
//    var ptr = this.key? YalpRef.all[this.key]: null;
    var ptr = YalpRef.all[this.key || that_key || 'junk'];
    if (!ptr) throw "YalpRef: no data for key " + (this.key || that_key || '(none)'); //timer expired or all consumers dereffed
    console.log("pulled data for '%s' from shared".cyan, this.key || that_key);
    this.refdata = ptr.refdata; //bring data back into this object from shared memory
    if ((ptr.lifespan < 0) && !++ptr.lifespan)
    {
        this.lifespan = 0;
        delete YalpRef.all[this.key || that.key]; //remove from shared memory
        delete this.reviver;
        delete this.key;
    }
//    else if (!ptr.lifespan); //stays forever
//    else if (ptr.lifespan <= Date.now()) throw "YalpRef: " + ptr.key + " expired"; //TODO: set timer to clean it up
    return this; //fluent
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///
// static/shared data + helpers:

YalpRef.all = {}; //NOTE: needs to be static/shared to be excluded from serialization
YalpRef.next_key = 0xFEED;

//static helper functions, not on prototype:
//    this.reviver = this.toJSON + ''; //force to string so JSON will preserve it

YalpRef.fromJSON = function(json) //already parsed by JSON.parse, just needs to be assembled
{
    console.error("TODO: from JSON '%j'".red, json);
    return new YalpRef().deref(json.key);
}


/*
    if ((typeof val.key != 'number') || (val.reviver !== 'YalpRef')) //
    if (!(this instanceof YalpRef)) //deserialize
    {
//        console.log("deserialize-1 ", typeof opts, "isbuf? " + Buffer.isBuffer(opts), opts);
//not needed?        if (Buffer.isBuffer(opts)) opts = new Buffer(opts);
//        console.log("deserialize-2 ", typeof opts, "isstr? " + (typeof opts == 'string'), opts);
        data = JSON.parse(data); //NOTE: this can handle strings or buffers
        var wrapper = (data.reviver === 'YalpRef')? YalpRef.all[data.key || 'nothing']: null;
//        console.log("deserialize-3 ", typeof opts, opts);
////        var matches = (typeof opts == 'string')? opts.match(/^{"key":([0-9]+)}$/): [];
////        console.log("deserialize-3 key ", matches);
        if (!wrapper) { if (count) throw "YalpRef not found"; return; } //undefined; //required vs. optional
        if (--wrapper.refcount < 1) delete YalpRef.all[data.key]; //tidy up shared data
        return wrapper.refdata; //return caller's data if found
    }
    return YalpRef(val);
}
*/


var rev_cache = {};

YalpRef.reviver = function(key, val) //generic function; can be used with any object type (that i know about)
{
    console.error("revive: key %j, val %j".blue, key, val);
    if (key === '') //top-level object
    {
        if (typeof val.reviver == 'string') try //try to revive object using specified ctor (generic)
        {
            debugger;
//            if (val.module) require(val.module);
            var str = val.module? 'require("' + val.module + '").': '';
            str += val.reviver;
            var func = eval('(' + str + ')'); //assume it's a function
//            console.error("reviver: %j from str '%s'", func + '', str);
            var obj = func? func(val): null;
//            if (obj) Object.assign(obj, val);
            console.error("final obj: %j", obj);
            if (obj) return obj;
        }
        catch (exc) { console.error("failed to revive: %j".red, exc + ''); }
        return val; //see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
    }
    return bufferJSON.reviver(key, val); //repair buffers; see https://github.com/jprichardson/buffer-json
}


//YalpRef.replacer = function(key, val)
//{
//    return new YalpRef(val);
//}


//eof
