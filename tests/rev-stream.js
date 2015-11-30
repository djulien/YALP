//revivable stream test

'use strict';

require('colors');
const fs = require('fs');
const path = require('path');
const inherits = require('inherits');
const makenew = require('my-plugins/utils/makenew');
const YalpRef = require('my-plugins/utils/YalpRef').YalpRef;
const Revivable = require('my-plugins/my-extensions/json-revival').Revivable;
const stream = require('stream');
const Readable = stream.Readable || require('readable-stream').Readable; //http://codewinds.com/blog/2013-08-04-nodejs-readable-streams.html
const Writable = stream.Writable || require('readable-stream').Writable; //http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Outbound (source)
//

function RevSource()
{
    if (!(this instanceof RevSource)) return makenew(RevSource, arguments);
    this.objectMode = true;
    Readable.apply(this, arguments);
    this.recnum = 0;
}
inherits(RevSource, Readable);

RevSource.prototype._read = function(size_gnored)
{
    throw "TODO: define _read";
    this.push("data");
    done();
}


function myclass(val)
{
    this.val = val;
//    Revivable.call(this); //base class
    console.log("hello from obj# %s", val);
}
//inherits(Aclass, Revivable); //allows auto-revival after serialize/deserialize
module.exports.myclass = myclass;
myclass.prototype.func = function(val)
{
    return val + this.val;
}


var myobj = new myclass(3), mylist = [new myclass(4), 5, 6];
Revivable(myobj);
var mystr = new RevSource();
mystr._read = function(ignored_size)
{
    var outbuf;
    switch (this.recnum++)
    {
        case 0: outbuf = {which: 1, count: 4, comment: "hello"}; break;
        case 1: outbuf = {which: 2, comment: "rev obj", rv: myobj}; break;
        case 2: outbuf = {which: 3, comment: "eof"}; break;
        case 3: outbuf = null; break;
        default: return;
    }
    return this.push((outbuf !== null)? JSON.stringify(outbuf) + '\n': null); //null => eof
}


const outname = "zout.txt";
//mystr.pipe(fs.createWriteStream(outname, {encoding: 'utf-8'})); //capture to file
//console.log("sent to %s".cyan, outname);


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////
/// Inbound (sink)
//

function RevSink()
{
    if (!(this instanceof RevSink)) return makenew(RevSink, arguments);
    this.objectMode = true;
    Writable.apply(this, arguments);
    this.recnum = 0;
}
inherits(RevSink, Writable);

RevSink.prototype._write = function(chunk, encoding, done)
{
    throw "TODO: define _write";
    var data = JSON.parse(chunk); //, encoding);
//TODO: something with data
    done();
}



var mystr2 = new RevSink();
mystr2._write = function(chunk, encoding, done)
{
//    var buffer = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, enc);
//console.log("got %d:'%s'", chunk.length, chunk); //.toString(encoding), encoding);
    var data = JSON.parse(chunk); //.toString(encoding));
    console.log("got ", data);
//TODO: something with data
    done();
}

function fromJSON(props)
{
//    console.log("TODO: override fromJSON".red);
    return props;
}
mystr2.fromJSON = fromJSON;


var rl = require('readline').createInterface(
{
  input: require('fs').createReadStream(outname)
});
rl.on('line', function (line)
{
  console.log('Line from file:', line);
  mystr2.write(line);
});


//fs.createReadStream(outname/*, {encoding: 'utf-8'}*/).pipe(mystr2); //process file
console.log("read from %s".cyan, outname);

//eof
