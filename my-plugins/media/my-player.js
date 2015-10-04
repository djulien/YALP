
var Player = require('player');

//extensions:
//function myPlayer(args) //ctor
//{
//    if (!(this instanceof myPlayer)) return new myPlayer(); //TODO: .apply()
//    this.player = new Player();
//    this.on = this.player.on; //pass-thru


//player.playlistlen = 0; //remember how many songs are queued
//player.preserved = {play: player.play, stop: player.stop, next: player.next};
//player.busy = false; //Player drops requests if they happen too fast, so queue them
//this.queued = null;

module.exports = function (args) //ctor
{
    var this_player = this; //CAUTION: need to save context for setTimeout and eventEmitter
    this.player = new Player(args) //.apply(null, arguments)
        .on('playing', function(song)
        {
            console.log("my-player playing ", (this.playing || {})._id, song._id);
//            if (song.meta) this.progress(song.meta)
            this_player.dequeue.apply(this_player, [true]);
        })
        .on('playend', function(song)
        {
            console.log("my-player stopped ", (this.playing || {})._id, song._id);
            this_player.dequeue.apply(this_player, [false]);
        })
        .on('error', function(err)
        {
            console.log("my-player error ", (this.playing || {})._id);
//??        if (!this_player.busy) throw "Player didn't know it was busy";
            this_player.dequeue.apply(this_player, [false]); //probably no longer playing
        });

//    this.busy = false;
//    this.queued = null;
//    this.isplaying = false;
//    this.queue = null;
    this.dequeue = function(isplaying)
    {
        if (!this.busy) /*throw*/ console.log("Player wasn't busy"); //NOTE: auto-play next song wont show as busy
        this.busy = false;
        this.isplaying = isplaying;
        if (!this.queued) return; //typeof this.queued !== 'object') return; //no other command pending
//        console.log(typeof this.queued, this.queued);
        if (this.queued.song < 0) this.stop();
//causes write after close error        else if (this.isplaying) { this.busy = true; this.player.stop(); } //sound card seems to allow dual playback; inject stop command before playing next song
//        else if (this.isplaying) this.player.next.apply(this.player, arguments); //play(inx)?
        else this.play(this.queued.song, this.queued.duration);
    }

    this.playlistlen = 0;
    this.add = function(src)
    {
        if (!src) return;
        this.player.add.apply(this.player, arguments);
        this.playlistlen += (src.constructor === Array)? src.length: 1;
        console.log("my-player: listlen %d vs %d", this.player.list.length, this.playlistlen);
    }

    this.stop = function(inx)
    {
        console.log("my-player: stop ", arguments, this.queued);
        this.timer(); //will stop asap so don't need pending timer
//        if (!this.busy && !this.isplaying) return; //ignore redundant request
        if (this.enqueued(-1)) return; //deferred until later
        this.player.stop.apply(this.player, arguments);
    }

    this.play = function(inx, duration)
    {
        console.log("my-player: play ", arguments, this.queued);
//        if (inx < 0) return this.stop();
        if (this.enqueued(inx, duration)) return; //deferred until later
        this.curinx = inx;
        this.timer(duration);
        this.player.play.apply(this.player, arguments);
    }

    this.next = function(inx)
    {
        console.log("my-player: next ", arguments);
/*
        var nextinx = (this.curinx + 1) % this.playlistlen;
        if (!this.busy)
        {
            this.busy = true;
            this.curinx = nextinx;
//            this.isplaying = true;
            this.queued = null;
            return this.player.next.apply(this.player, arguments); //play(inx)?
        }
        this.queued = nextinx;
*/
        return this.play((this.curinx + 1) % this.playlistlen);
    }

    this.enqueued = function (inx, duration)
    {
        if (this.busy) { this.queued = {song: inx, duration: duration}; return true; }
        this.busy = true;
        this.queued = null;
        return false;
    }

    this.timer = function(duration)
    {
        if (this.timer_pending) { clearTimeout(this.timer_pending); this.timer_pending = null; }
        if (typeof duration === 'undefined') return;
        this.timer_pending = setTimeout(function() { this_player.stop(); }, duration);
    }

    this.on = this.player.on; //pass-thru
    return this; //chainable
}

//eof
