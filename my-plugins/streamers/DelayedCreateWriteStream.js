
'use strict';

const fs = module.exports = require('fs');
//const inherits = require('inherits');
//const makenew = require('my-plugins/utils/makenew');


//wrapper to delay file creation until actually needed (avoids empty files):
//NOTE: fs.createWriteStream just calls the fs.WriteStream ctor
//module.exports =
//function DelayedCreateWriteStream(args)
//{
//debugger;
//    var open_args = null;
////    fs.createWriteStream.apply(this, arguments); //base class; CAUTION: don't call until open wedge is installed above
//    return makenew(fs.WriteStream, arguments);
//}
//n/a inherits(DelayedCreateWriteStream, fs.createWriteStream);


var old_open = fs.WriteStream.prototype.open, old_write = fs.WriteStream.prototype.write;
fs.WriteStream.prototype.open = function delayed_open()
{
debugger;
    console.log("delay cre", arguments, "path", this.path, "flags", this.flags, "mode", this.mode.toString(8));
    this.open_args = arguments;
}

fs.WriteStream.prototype._write = function first_write(data, encoding, cb)
{
debugger;
    if (this.open_args) console.log("okay, now cre", this.open_args, "path", this.path, "flags", this.flags, "mode", this.mode.toString(8));
    if (this.open_args) fs.openSync(this.path, this.flags, this.mode); //NOTE: need to use Sync version here since caller is expecting the file to be open immediately //old_open.apply(this, this.open_args);
    this.open_args = null;
    return old_write.apply(this, arguments);
}


//eof
