#!/usr/bin/env node
//#!/usr/local/bin/node --expose-gc

'use strict';

var que = require('my-plugins/utils/ipc')('playlist');

var songs = [];
var selected = 0, frnum = 0;
que.rcv('cmd', function(data, reply)
{
    switch (data)
    {
        case 'add':
            reply("add song[%d]: ", songs.length, data);
            songs.push(data);
            break;
        case 'play':
            if (!songs.length) { reply("no songs"); break; }
            reply("now playing, was? %d", !!playing);
            if (!playing) send_frame();
            break;
        case 'pause':
            reply("now paused, was? %d", !playing);
            if (playing) clearTimeout(playing);
            playing = null;
            break;
        case 'status':
            reply("song %d/%d, frame %d/%d, playing? %d", selected, songs.length, frnum, songs[selected].duration, !!playing);
            break;
        default:
            reply("unknown command: '%s'", data || '??');
            break;
    }
});

var subscribers = [];
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
        console.log("prep song[%d/%d].frame[%d/%d]", selected, songs.length, frnum, songs[selected].duration);
    }
    if (++frnum >= songs[selected].duration) //advance to next frame, wrap at end
    {
        frnum = 0;
        if (++selected >= songs.length) selected = 0;
    }

    var keepers = [];
    subscribers.forEach(function(reply_cb, inx)
    {
        if (reply_cb(frame_data) > 0) keepers.push(reply_cb);
        else console.log("stop sending to %d", inx);
    });
    if (keepers.length < subscribers.length)
    {
        var pruned = subscribers.length - keepers.length;
        subscribers = keepers;
        console.log("%s subscribers left after prune %d", subscribers.length, pruned);
    }
    playing = setTimeout(function() { send_frame(); }, 500);
}

//eof