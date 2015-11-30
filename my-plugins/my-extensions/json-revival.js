//Custom JSON hooks to auto-deserialize objects; also repairs deserialized Buffers

'use strict';

require('colors');
const path = require('path');
const stack = require('my-plugins/utils/caller').stack;
const bufferJSON = require('buffer-json'); //https://github.com/jprichardson/buffer-json
//no const Transform = stream.Transform || require('readable-stream').Transform;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// JSON reviver hooks
//

// https://github.com/nodejs/node-v0.x-archive/issues/5110
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse

//wedge a couple of revivers into global JSON parser:
JSON.old_parse = JSON.parse;
JSON.parse = function(json_str, old_reviver) //apply some global revivers
{
    return JSON.old_parse(json_str, revival.bind(null, old_reviver || function(key, val) { /*console.log("chain: key %s, val %j", key, val)*/; return val; })); //call my_reviver first; inject param for additional external reviver
}


//let's start a revival :)
//var rev_cache = {};
function revival(chain, key, val)
{
    var parts;
//    console.log("\nreviver IN: key '%s', val %s '%j'", key, typeof val, val);
    const rev_pattern = /^\s*([A-Z][A-Z0-9$_.]+)\s*\|\s*([^|*?<>\$]+)\s*$/i; //"ctor name | module id"; filename cannot contain | * ? < > $ (some platforms allow other chars)

//repair buffers:
//    if ((val.type === 'Buffer') && (Array.isArray(val.data) || typeof val.data == 'string')) return new Buffer(val.data);
    val = bufferJSON.reviver(key, val); //repair buffers; see https://github.com/jprichardson/buffer-json
//try to auto-revive objects:
    if ((typeof val.reviver == 'string') && (parts = val.reviver.match(rev_pattern))) try //try to revive object using specified ctor (generic)
    {
//        var buf = [];
//        for (var i in require.cache) buf.push(i);
//        console.log("req cache", buf.join("\n"));
//yes        parts[2] = path.resolve(process.cwd(), parts[2]); //use abs path (rel path might not be on node search list)
//        if (!path.extname(parts[2]) parts[2] += '.js';
//        var test = require("tests/json-reviver");
//        var test = require("/home/dj/Documents/djdev/my-npm/yalp/tests/json-reviver");
//        console.log("found? %s" + !!test, test);
//        var str = (parts[1]? 'require("' + parts[2] + '").': '') + parts[1];
//        console.log("reviver: str '%s', key '%s', partial obj %j".green, str, key, val); //, this);
//        console.log("caller ", parts[2], require.cache[parts[2]]);
//        var func = eval('(' + str + ')'); //assume it's a function
//yes        var func = require(parts[2]); //CAUTION: throws error if not found
//yes        parts[1].split('.').forEach(function(name) { func = func[name] || func.prototype[name]; }); //console.log("'%s' in func? %s", name, !!func); }); //traverse namespaces manually
//        console.error("reviver: %j from str '%s'", (func + '').substr(0, 100), parts[0]);
        var func = FindPath(parts[2], parts[1]);
        var obj = func? func(val): null;
//            if (obj) Object.assign(obj, val);
//        console.error("final obj: %j".green, obj);
        if (obj) return obj;
    }
    catch (exc) { console.log("my_reviver: %j".red, exc); }
//try other reviver:
//    var retval = chain(key, val); //try pre-existing parser or pass-thru
    var val = chain(key, val); //try pre-existing parser or pass-thru
//    console.log("reviver OUT: key '%s', val %s '%j', retval %j", key, typeof val, val, retval);
    return val;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Base class to make auto-revivable classes
//

//base class to make derived classes revivable:
//toJSON + fromJSON methods will be added to any derived class, making it automatically revival via the reviver hook above
//can also be called explicily on an object or class prototype
//no- base class is stream Transform since that is the main purpose of this thing
function Revivable(inst)
{
//call as a regular function as an alternate way to make a single object or class revivable without derivation
    var caller = stack(2); //1 == me, 2 == my caller; assume caller's module is where object or class ctor is defined
    if (this instanceof Revivable) //called from within ctor chain
    {
//already checked       if (!(this instanceof Revivable)) return makenew(Revivable, arguments);
        inst = this;
//no        this.objectMode = true; //one read/write per record on binary data (ignores length)
//no        Transform.apply(this, arguments); //base class ctor
//        this.opts = Object.assign({}, Revivable.DefaultOptions, (typeof opts == 'string')? {name: opts}: opts || {}); //expose unknown options to others
//    if (this.opts.auto_export && this.opts.name) caller_exports(+1)[this.opts.name] = this;
//        if (this.opts.name) YalpXform.all.push(this);
    }
    else
    {
//        console.log("Revivable: add toJSON, fromJSON to inst".blue);
//        var func = require(caller); //CAUTION: throws error if not found
//        (inst.constructor.name + '.fromJSON').split('.').forEach(function(name) { func = func[name] || func.prototype[name]; }); //console.log("'%s' in func? %s", name, !!func); }); //traverse namespaces manually
        var func = FindPath(caller, inst.constructor.name); // + '.fromJSON');
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
//        inst.reviver = inst.constructor.name + '.fromJSON|';
//        inst.reviver += path.relative(process.cwd(), caller).replace(/\.js$/i, ""); //module name relative to startup folder; trim extension if normal
//        console.log("Revivable: add reviver".blue, inst.reviver);
        SetPath(inst);
    }
}
//no inherits(Revivable, Transform);
module.exports.Revivable = Revivable;


//preserve props better than stringify:
function toJSON() //NOTE: returns shallow copy of object which will subsequently be stringified, not necessarily a string itself
{
//    var base = Object.toJSON.apply(this);
    return this; //see http://stackoverflow.com/questions/20734894/difference-between-tojson-and-json-stringify
}
Revivable.prototype.toJSON = toJSON;


//dummy method:
//should be overridden in derived classes
function fromJSON(props)
{
//    console.log("TODO: override fromJSON".red);
    throw "Revivable: derived class should override fromJSON";
    var obj = Object.create(prototype, props); //http://www.htmlgoodies.com/beyond/javascript/object.create-the-new-way-to-create-objects-in-javascript.html
    return props;
}
Revivable.prototype.fromJSON = fromJSON;


//generate path to auto-revive function:
function SetPath(inst)
{
    var caller = stack(2+1); //1 == self, 2 == my caller
//        console.log("caller ", caller, require.cache[caller]);
//        console.log("rel path", path.relative(process.cwd(), caller));
//        this.module = path.relative(process.cwd(), caller).slice(0, -path.extname(caller).length);
//        this.reviver = 'fromJSON'; //tell receiver how to revive caller's data; must be instance data, not prototype
    return (inst || this).reviver = (inst || this).constructor.name + '.fromJSON|' + path.relative(process.cwd(), caller).replace(/\.js$/i, ""); //module name relative to startup folder; trim extension if normal
}
Revivable.prototype.SetPath = SetPath;


//follow path to auto-reviver function:
function FindPath(relpath, namesp)
{
    var abspath = path.resolve(process.cwd(), relpath); //use abs path (rel path might not be on node search list)
//        if (!path.extname(parts[2]) parts[2] += '.js';
//        console.log("caller ", parts[2], require.cache[parts[2]]);
//        var func = eval('(' + str + ')'); //assume it's a function
    var func = chk(require(abspath), 'req path'); //CAUTION: throws error if not found
    namesp.split('.').forEach(function(name) { func = chk((func.prototype || func)[name], name); }); //console.log("'%s' in func? %s", name, !!func); }); //traverse namespaces manually
//        console.error("reviver: %j from str '%s'", (func + '').substr(0, 100), parts[0]);
    return func; //var obj = func? func(val): null;
    function chk(fp, where)
    {
        if (where) where = '@' + where;
        if (!fp) throw "Revivable.FindPath: can't find '" + namesp + "' " + where + ".  Was it exported?";
        else console.log("Revivable.FindPath okay: " + where);
        return fp;
    }
}
Revivable.prototype.FindPath = FindPath;


//eof
