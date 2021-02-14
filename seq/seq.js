#!/usr/bin/env node
//YALP seq player
//place a copy of this file into each folder containing a playable Vixen 2 song/seq

"use strict";
const {vix2player, find_files} = require("yalp20/incl/Vix2Player");


function main()
{
    const opts =
    {
//1 of each (required) for Vixen 2 seq:
        seq: find_files("!(*-bk).vix", 1)[0],
        prof: find_files("!(*-bk).pro", 1)[0],
        mp3: find_files("!(*-bk).mp3", 1)[0],
    };
    return vix2player(opts);
}
if (!module.parent) setImmediate(main);

//eof