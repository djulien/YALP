//YALP Playlist base class

'use strict'; //help catch errors

var glob = require('glob');
var caller = require('my-plugins/utils/caller').stack;
var shortname = require('my-plugins/utils/shortname');
var add_method = require('my-plugins/my-extensions/object-enum').add_method;

add_method(Array.prototype, 'push_ifdef', function(newval) { if (isdef(newval)) this.push(newval); });


var Playlist = module.exports = function(opts)
{
//    console.log("playlist args", arguments);
    if (!(this instanceof Playlist)) return setnew(Playlist, arguments);
    var add_prop = function(name, value) { if (!this[name]) Object.defineProperty(this, name, {value: value}); }.bind(this); //expose prop but leave it read-only

    add_prop('opts', (typeof opts !== 'object')? {name: opts}: opts || {}); //preserve unknown options for subclasses
    add_prop('name', this.opts.name || shortname(caller(2)));
    var m_songs = [];
    Object.defineProperty(this, 'songs',
    {
        get: function() { return m_songs; },
        set: function(newval) { (Array.isArray(newval)? newval: [newval]).forEach(function(path) { this.addSong(path); }.bind(this)); },
    });
    this.addSong = function(path)
    {
        var oldcount = this.songs.length;
        glob.sync(path).forEach(function(filename) { this.songs.push_ifdef(require(require.resolve(filename))); }.bind(this));
        if (this.songs.length == oldcount) throw "Can't find sequence at '" + path + "'";
        if (this.songs.length > oldcount + 1) throw "Multiple files found for '" + path + "'";
        return this; //fluent
    }

    this.debug = function() { debugger; }
    this.ports = {};

    function xadd_prop(name, value) //expose prop but leave it read-only
    {
//        console.log("this is ", this, this.constructor.name, this.constructor + '');
//        if (thing[name]) return; //already there
        Object.defineProperty(this, name, {value: value});
//        console.log("extended %s with %s".blue, thing.constructor.name, name);
    }
}

//wait until scheduled time, then run playlist:
Playlist.prototype.schedule = function(opts)
{
    console.log("Scheduling '%s' scheduler ...".green, this.name);
}

//start playlist running:
Playlist.prototype.run = function(opts)
{
    console.log("Running playlist '%s' ...".green, this.name);
}



function isdef(thing)
{
    return (typeof thing !== 'undefined');
}

function setnew(type, args)
{
//    if (this instanceof type) return;
    return new (type.bind.apply(type, [null].concat(Array.from(args))))(); //http://stackoverflow.com/questions/1606797/use-of-apply-with-new-operator-is-this-possible
}

//eof
