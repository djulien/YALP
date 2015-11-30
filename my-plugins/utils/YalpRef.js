//In-memory cache for De/Serialization

//Streams only accept string or buffer data types.
//For data already in process memory, serialize/deserialize is needless extra overhead.
//This object class is used to pin a reference to binary data going across serialization boundaries.
//Basically, somewhat of a mini-redis with custom JSON replacer/reviver.
//Passing only a reference thru the stream interface is much lower overhead (especially for larger binary structures).
//However, copy-on-write semantics are needed if the data is altered and used elsewhere.

'use strict';

require('colors');
const path = require('path');
require('my-plugins/my-extensions/json-revival');
//const stack = require('my-plugins/utils/caller').stack;


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// De/Serialization cache
//

//light-weight object wrapper for de/serialization:
//lifespan: > 0 how long to keep in memory (msec); < 0 number of times to deserialize before dropping it; == 0 just leave it in memory
function YalpRef(data, lifespan)
{
    if (!(this instanceof YalpRef)) return makenew(YalpRef, arguments);
//deref data for more efficient + compact serialization:
    this.refdata = data; //arguments; //hang on to caller's data, but not directly within instance object
    this.lifespan = (arguments.length < 2)? 0: (lifespan > 0)? lifespan + Date.now(): lifespan || 0; //#times to deserialize; count must be shared by all consumers
}
module.exports.YalpRef = YalpRef;


YalpRef.prototype.toJSON = function() //NOTE: returns shallow copy of object, not a string
{
    this.ref(); //move data to shared memory so it won't be serialized
    return this; //see http://stackoverflow.com/questions/20734894/difference-between-tojson-and-json-stringify
}


//move data from object to shared memory cache:
YalpRef.prototype.ref = function()
{
    var ptr = this.key? YalpRef.all[this.key]: null;
    if (!ptr)
    {
        var ttl = (this.lifespan > 0)? this.lifespan - Date.now(): 99;
        if (ttl <= 0) throw "YalpRef: key " + (this.key || '(none yet)') + " expired before reffed";
        ptr = YalpRef.all[this.key = YalpRef.next_key++] = {}; //assign unique key
//        this.module = 'my-plugins/utils/YalpRef';
//yes        var caller = stack(2); //1 == self, 2 == my caller
//        console.log("caller ", caller, require.cache[caller]);
//        console.log("rel path", path.relative(process.cwd(), caller));
//        this.module = path.relative(process.cwd(), caller).slice(0, -path.extname(caller).length);
//        this.reviver = 'fromJSON'; //tell receiver how to revive caller's data; must be instance data, not prototype
//yes        inst.reviver = this.constructor.name + '.fromJSON|' + path.relative(process.cwd(), caller).replace(/\.js$/i, ""); //module name relative to startup folder; trim extension if normal
        Reviver.prototype.SetPath.apply(this);
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
////
/// static/shared data + helpers:
//

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

//eof

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// first try
//

/*
//use ctor to create ref, func call to deref
function YalpRef(opts, count)
{
    if (!YalpRef.all) { YalpRef.all = {}; YalpRef.next_key = 0xFEED0000; } //NOTE: needs to be static/shared to be excluded from serialization
    if (!(this instanceof YalpRef)) //deserialize
    {
//        console.log("deserialize-1 ", typeof opts, "isbuf? " + Buffer.isBuffer(opts), opts);
//not needed?        if (Buffer.isBuffer(opts)) opts = new Buffer(opts);
//        console.log("deserialize-2 ", typeof opts, "isstr? " + (typeof opts == 'string'), opts);
        opts = JSON.parse(opts); //NOTE: this can handle strings or buffers
//        console.log("deserialize-3 ", typeof opts, opts);
////        var matches = (typeof opts == 'string')? opts.match(/^{"key":([0-9]+)}$/): [];
////        console.log("deserialize-3 key ", matches);
        var retval = YalpRef.all[opts.objref || 'nothing'];
        /-*if (!keep)*-/ if ((typeof retval != 'undefined') && (--retval.refcount < 1) delete YalpRef.all[opts.objref]; //tidy up shared data
        return retval; //return caller's data if found
    }
//set up for serialization:
    this.objref = YalpRef.next_key++; //assign unique key
    YalpRef.all[this.objref] =
    {
        refcount: count || 1, //how many times it will be deserialized; needs to be outside of object since same data is streamed to all consumers
        wrapped: opts, //arguments; //hang on to caller's data, but not directly within this object
    };
}
module.exports.YalpRef = YalpRef; //TODO: allow outside to see it?


//TODO: make yalp2yalp automatic (source needs to send callback info downstream so destination can tell it to do this)
//NOTE: feedback loop can be done this way as well
//TODO: actually, if next stage is a Yalp stream anyway, just call onFrame directly
function serialize(data, want_strline, yalp2yalp)
{
    if ((typeof data == 'string') || Buffer.isBuffer(data)) return data; //okay to send as-is
//stream will only accept string or buffer
//        if (('want_strline' in this.opts) && (typeof data != 'string') && !Buffer.isBuffer(data))
//        {
//            data = JSON.stringify(data) + (this.opts.want_strline? '\n': ''); //to string; new Buffer(retval); //convert to buffer each time instead of preallocating so it can be released each time
////            data = 'STR[@' + this.elapsed.now + ']:' + data.slice(0, -1) + ", eof? " + is_last_frame + "\n";
//        }
    if (yalp2yalp) data = new YalpRef(data); //replace data with wrapper + key
    data = JSON.stringify(data) + (want_strline? '\n': ''); //to string; //new Buffer(retval); //convert to buffer each time instead of preallocating so it can be released each time
//    console.log("serialize yalpref", typeof data, data); //.prototype.constructor.name);
    return data;
}


function deserialize(chunk, encoding)
{
//    if (chunk instanceof YalpRef) return chunk.deref();
    var retval = YalpRef(chunk);
//    console.log("deserialized yalp ref", typeof chunk, retval); //.prototype.constructor.name);
    if (typeof retval != 'undefined') return retval;
//fall back to manual reconstruction if YalpRef not found:
//    console.log("deserialize non-yalp ref", typeof chunk, chunk); //.prototype.constructor.name);
//    var buffer = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, encoding); //convert string to buffer if needed
//NOTE: assumes objectMode, so object is not broken up
    var frdata = JSON.parse(chunk); //NOTE: incoming data had to be serialized, so it must be deserialized here
    var had_newline = (chunk.slice(-1) === '\n')? '\n': '';
    if (frdata.data) //try to reconstruct data/buffer; format varies
    {
//TODO: replace this with JSON reviver?
        switch (frdata.data.type || '(none)')
        {
            case 'Buffer':
//                console.log("try rebuild buf", JSON.stringify(frdata.data).slice(0, 100));
                var rebuilt = new Buffer(frdata.data, encoding);
//                console.log("rebuilt buf", rebuilt);
                frdata.data = rebuilt;
                break;
            case '(none)':
//                console.log("no type, leave as-is", JSON.stringify(frdata.data).slice(0, 100));
                break;
            default:
//                console.log("unhandled data type: %s", frdata.data.type);
//                console.log("try rebuild ", frdata.data.type, JSON.stringify(frdata.data).slice(0, 100));
                var rebuilt = JSON.parse(frdata.data);
//                console.log("rebuilt %s", frdata.data.type, rebuilt);
                frdata.data = rebuilt;
                break;
        }
    }
//    var buffer = !Buffer.isBuffer(chunk)? new Buffer(chunk, encoding): chunk;
//    console.log("buffer#" + this.processed, buffer);
//    chunk.toString();
//    var buf = '';
//    for (var i in frdata.data) buf += ', ' + typeof frdata.data[i] + ' ' + i;
//        if (buf && !isdef(buf.length)) buf.length = buf.data.length; //kludge: repair buffer (type changed somewhere along the way, maybe during socketio)
//    console.error("processed rec# %s, enc %s, frtime %s, frnext %s, data ", this.processed, encoding, !isNaN(frdata.frtime)? frdata.frtime: 'huh?', !isNaN(frdata.frnext)? frdata.frnext: 'huh?', Buffer.isBuffer(frdata.data)? 'buffer len ' + frdata.data.length: frdata.data? (typeof frdata.data) + ' ' + frdata.data: '(no data per se)'); //buf.data? buf.data.length: 'none'); //typeof chunk, chunk.slice(0, 180), "frtime ", chunk.frtime || 'huh?');
//    console.error(typeof buf, buf, buf.frtime || 'huh?');
//    if (Buffer.isBuffer(frdata.data)) { frdata.data = frdata.data.slice(0, 10); frdata.trunc = true; chunk = JSON.stringify(frdata); }
    return frdata;
}
*/
