#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict';

var que = require('my-plugins/utils/ipc').open('playlist');

var songs = []; //{name, path, duration}
var selected = 0, frnum = 0;
que.rcv('cmd', function(data, reply)
{
//try{
    switch (!data.length? data + '!': data[0] + ((data.length < 2)? '!': '*'))
    {
        case 'add*':
            var song = require(data[1]);
            if (song) song.path = require.resolve(data[1]); //get path name
            reply("add song[%d] '%s' ok? %s: %j", songs.length, data[1], !!song, song);
            songs.push(song);
            break;
        case 'play!':
            if (!songs.length) { reply("no songs"); break; }
            reply("now playing, was? %s", !!playing);
            if (!playing) send_frame();
            break;
        case 'pause!':
            reply("now paused, was? %s", !playing);
            if (playing) clearTimeout(playing);
            playing = null;
            break;
        case 'status!':
            reply("song[%d/%d].frame[%d/%d], playing? %s, #subscribers %d", selected, songs.length, frnum, (selected < songs.length)? songs[selected].duration: -1, !!playing, subscribers.length);
            break;
        case 'quit!':
            reply("will quit now");
            process.exit(0);
            break;
        default:
            reply("unknown command: %j", data);
            break;
    }
//}catch(exc){ reply("error: " + exc); }
});

var subscribers = [];
var good = 0, bad = 0;
que.rcv('frames', function(data_ignore, reply_cb)
{
//debugger;
    console.log("subscribe req:", data_ignore);
    subscribers.push(reply_cb);
    reply_cb("okay, will send you frames");
});

var playing = null;
function send_frame()
{
    if (subscribers.length)
    {
        var frame_data = {song: selected, frnum: frnum};
        console.log("prep song[%d/%d].frame[%d/%d] for %d subscribers (%d good, %d bad)", selected, songs.length, frnum, songs[selected].duration, subscribers.length, good, bad);
    }
    if (++frnum >= songs[selected].duration) //advance to next frame, wrap at end
    {
        frnum = 0;
        if (++selected >= songs.length) selected = 0;
//        console.log("next up: song[%d/%d]: ", selected, songs.length, songs[selected]);
    }

    var keepers = [];
    good = bad = 0;
    subscribers.forEach(function(reply_cb, inx)
    {
        if (reply_cb(frame_data) > 0) { ++good; keepers.push(reply_cb); }
        else { console.log("stop sending to %d", inx); ++bad; }
    });
    if (keepers.length < subscribers.length)
    {
        var pruned = subscribers.length - keepers.length;
        subscribers = keepers;
        console.log("%d subscribers left after pruned %d", subscribers.length, pruned);
    }
    playing = setTimeout(function() { send_frame(); }, 500);
}

//eof
