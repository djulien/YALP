'use strict';

//if (!global.has_ext)
//{
//    global.has_ext = require('my-plugins/my-extensions/');
//    delete require.cache[require.resolve(__filename)];
//    require(__filename); //re-load myself with language extensions enabled
//}
//else { ... }
console.log("START UP");

require('colors');
var scaled = require('my-plugins/utils/time-scale');


var fs = require('fs');
var lame = require('lame');
var binread = require('binary-reader'); //https://github.com/gagle/node-binary-reader

function test3()
{
    var relpath = require('my-plugins/utils/relpath');
    var glob = {sync: function(pattern) { console.log("glob(%s)".blue, pattern); return require('glob').sync(pattern); }, };
    var files = glob.sync(process.cwd() + '/my-projects/songs/xmas/**/!(*-bk).mp3');
//see http://stackoverflow.com/questions/383164/how-to-retrieve-duration-of-mp3-in-net/13269914#13269914
    var duration = [0.0, 0.0, 0.0];
    var frames = [0, 0, 0];
    var total = [0, 0, 0];
    var ofs = 0;
    files.slice(0, 1).forEach(function (filename, inx)
    {
        console.log("analyzing file ", relpath(filename));
/*
        fs.createReadStream(filename)
//            .pipe(pool) //does this make much difference?
            .pipe(new lame.Decoder())
             .once('format', function (format)
            {
                console.log("raw_encoding: %d, sampleRate: %d, channels: %d, signed? %d, float? %d, ulaw? %d, alaw? %d, bitDepth: %d".cyan, format.raw_encoding, format.sampleRate, format.channels, format.signed, format.float, format.ulaw, format.alaw, format.bitDepth);
//            this.pipe(this_seq.speaker = new Speaker(format))
            })
            .on('data', function(data)
            {
                if (!ofs)
                {
                    if ((data.charCodeAt(0) == 0xff) && ((data.charCodeAt(1) & 0xe0) == 0xe0)) //11-bit sync
                    {
                        var info = parseFrameHeader(data.substr(0, 4));
                    }

                }
                ofs += data.length;

                total[inx] += data.length;
                console.log("data[%d]: %d", frames[inx]++, data.length);
            })
            .once('close', function() { console.log("close"); })
            .once('end', function()
            {
                console.log("end: len decoded: %d, chunks: %d", total[inx], frames[inx]);
            });
    });
*/
/*
        var audio = fs.createReadStream(filename);
        {
            Mp3Frame frame = Mp3Frame.LoadFromStream(fs);
            if (frame != null)
            {
                _sampleFrequency = (uint)frame.SampleRate;
            }
            while (frame != null)
            {
                if (frame.ChannelMode == ChannelMode.Mono)
                {
                    duration += (double)frame.SampleCount * 2.0 / (double)frame.SampleRate;
                }
                else
                {
                    duration += (double)frame.SampleCount * 4.0 / (double)frame.SampleRate;
                }
                frame = Mp3Frame.LoadFromStream(fs);
            }
        }
        return duration;
*/
//        console.log("cbr est: %d", getDurationEstimate(filename)); //(faster) for CBR only
//        console.log("vbr est: %d", getDuration(filename)); //(slower) for VBR (or CBR)
        getDuration(filename, true, function(duration) //(faster) for CBR only
        {
            console.log("cbr est: %d", duration);
        });
        getDuration(filename, function(duration) //(slower) for VBR (or CBR)
        {
            console.log("vbr est: %d", duration);
        });
    });
}

//logic taken from http://www.zedwood.com/article/php-calculate-duration-of-mp3
//see also http://stackoverflow.com/questions/383164/how-to-retrieve-duration-of-mp3-in-net/13269914#13269914
//Read first mp3 frame only...  use for CBR constant bit rate MP3s
//TODO: rewrite to use node-binary, node-struct, or binary-parser module?
function getDuration(filename, use_cbr_estimate, cb)
{
    if (typeof use_cbr_estimate === 'function') { cb = use_cbr_estimate; use_cbr_estimate = false; } //optional param
//    fs.open(filename, 'r', function(err, fd)
//    {wstream.write(buffer);
//        if (err) { console.log(err.message); return; }
//        var buffer = new Buffer(100);
//        fs.read(fd, buffer, 0, 100, 0, function(err, num)
//        {
//            console.log(buffer.toString('utf8', 0, num));
//        });
//    });
/*
    fs.readFile(filename, 'utf8', function(err, chunk)
    {
        if (err) throw err;
        var data = chunk.toString('utf8');
        var duration = 0;
        console.log(typeof data);
        var block = data.substr(0, 100); //fread($fd, 100);
        var offset = skipID3v2Tag(block);
        var filesize = fs.statSync(filename).size;
//        fseek($fd, $offset, SEEK_SET);
//        while (!feof($fd))
*/

/*
    var sdata = [], dataLen = 0;
    fs.createReadStream(filename)
//            .pipe(pool) //does this make much difference?
//        .pipe(new lame.Decoder())
        .on('data', function(chunk)
        {
            sdata.push(chunk);
            dataLen += chunk.length;
        })
        .on('end', function()
        {
            var buf = new Buffer(dataLen);
            for (var i=0, len=sdata.length, pos=0; i<len; i++)
            {
                sdata[i].copy(buf, pos);
                pos += sdata[i].length;
            }

            var duration = 0;
            var data = buf.toString('utf8');
            console.log(typeof data, data.length, sdata.length, dataLen);
            var block = data.substr(0, 100); //fread($fd, 100);
console.log("buf[%d..] %d %d %d %d %d %d %d %d %d %d", offset, data.charCodeAt(offset), data.charCodeAt(offset+1), data.charCodeAt(offset+2), data.charCodeAt(offset+3), data.charCodeAt(offset+4), data.charCodeAt(offset+5), data.charCodeAt(offset+6), data.charCodeAt(offset+7), data.charCodeAt(offset+8), data.charCodeAt(offset+9));
            var offset = skipID3v2Tag(block);
            var filesize = dataLen; //fs.statSync(filename).size;
var look = 0;
            while (offset < filesize)
            {
if (++look < 10) console.log("buf[%d..] %d %d %d %d %d %d %d %d %d %d", offset, data.charCodeAt(offset), data.charCodeAt(offset+1), data.charCodeAt(offset+2), data.charCodeAt(offset+3), data.charCodeAt(offset+4), data.charCodeAt(offset+5), data.charCodeAt(offset+6), data.charCodeAt(offset+7), data.charCodeAt(offset+8), data.charCodeAt(offset+9));
                var block = data.substr(offset, 10); offset += 10; //fread($fd, 10);
                if (block.length < 10) break;
                //looking for 1111 1111 111 (frame synchronization bits)
                else if ((block.charCodeAt(0) == 0xff) && ((block.charCodeAt(1) & 0xe0) == 0xe0))
                {
                    console.log("hdr at ofs %d", offset - 10);
                    var info = parseFrameHeader(block.substr(0, 4));
                    if (!info.Framesize) return duration; //some corrupt mp3 files
                    if (use_cbr_estimate && info)
                    {
                        cb(estimateDuration(filesize, info.Bitrate, offset));
                        return;
                    }
//                fseek($fd, $info['Framesize']-10, SEEK_CUR);
                    offset += info.Framesize - 10;
                    duration += info.Samples / info['Sampling Rate'];
                }
                else if (block.substr(0, 3) == 'TAG')
                {
                    console.log("tag at ofs %d", offset - 10);
//                fseek($fd, 128-10, SEEK_CUR);//skip over id3v1 tag size
                    offset += 128 - 10;
                }
                else
                {
//                fseek($fd, -9, SEEK_CUR);
                    offset += -9;
                }
            }
            cb(Math.round(duration));
            return;
        });
*/
    binread.open(filename)
        .on ("error", function (error)
        {
            console.error ("ERROR: ", error);
        })
        .on ("close", function ()
        {
            console.log("closed");
        })
        .read(100, function (rdlen, buffer) //, cb)
        {
            var offset = 0; var data = buffer;
console.log("buf[%d..] %d %d %d %d %d %d %d %d %d %d", offset, data[offset], data[offset+1], data[offset+2], data[offset+3], data[offset+4], data[offset+5], data[offset+6], data[offset+7], data[offset+8], data[offset+9]);
            var offset = skipID3v2Tag(buffer);
            console.log("ID3 v2 tag ofs %d", offset);
            get_next(this);

            function get_next(reader)
            {
                reader
                    .seek(offset)
                    .read(10, function (rdlen, buffer)
                    {
                        if (rdlen < 10) { this.cancel(); return cb(duration); }
                        var data = buffer.toString('utf8');
                        if ((buffer[0] == 0xff) && ((buffer[1] & 0xe0) == 0xe0))
                        {
                            console.log("hdr at ofs %d", offset);
                            var info = parseFrameHeader(buffer);
                            if (!info.Framesize)
                            {
                                console.log("corrupt file?");
                                return cb(duration); //some corrupt mp3 files
                            }
                            if (use_cbr_estimate && info)
                            {
                                return cb(estimateDuration(this.size(), info.Bitrate, offset));
                            }
                            offset += info.Framesize;
                            duration += info.Samples / info['Sampling Rate'];
                        }
                        else if (data.substr(0, 3) == 'TAG')
                        {
                            console.log("tag at ofs %d", offset);
//                fseek($fd, 128-10, SEEK_CUR);//skip over id3v1 tag size
                            offset += 128;
                        }
                        else
                        {
//                fseek($fd, -9, SEEK_CUR);
                            ++offset;
                        }
                    });
            }
        })
        .close();
}

function estimateDuration(filesize, bitrate, offset)
{
    var kbps = (bitrate * 1000) / 8;
    var datasize = /*fs.statSync(filename).*/ filesize - offset;
    return Math.round(datasize / kbps);
}


function skipID3v2Tag(block)
{
    var data = block.toString('utf8');
    if (data.substr(0, 3) == "ID3")
    {
        var id3v2_major_version = block[3]; //.charCodeAt(3);
        var id3v2_minor_version = block[4]; //.charCodeAt(4);
        var id3v2_flags = block[5]; //.charCodeAt(5);
        var flag_unsynchronisation  = (id3v2_flags & 0x80)? 1: 0;
        var flag_extended_header = (id3v2_flags & 0x40)? 1: 0;
        var flag_experimental_ind = (id3v2_flags & 0x20)? 1: 0;
        var flag_footer_present = (id3v2_flags & 0x10)? 1: 0;
        var z0 = block[6]; //.charCodeAt(6);
        var z1 = block[7]; //.charCodeAt(7);
        var z2 = block[8]; //.charCodeAt(8);
        var z3 = block[9]; //.charCodeAt(9);
        if (!(z0 & 0x80) && !(z1 & 0x80) && !(z2 & 0x80) && !(z3 & 0x80))
        {
            var header_size = 10;
            var tag_size = ((z0 & 0x7f) * 2097152) + ((z1 & 0x7f) * 16384) + ((z2 & 0x7f) * 128) + (z3 & 0x7f);
            var footer_size = flag_footer_present? 10: 0;
            return header_size + tag_size + footer_size; //bytes to skip
        }
    }
    return 0;
}


function parseFrameHeader(fourbytes)
{
    const versions = {0x0: '2.5', 0x1: 'x', 0x2: '2', 0x3: '1', }; // x=>'reserved'
    const layers = {0x0: 'x', 0x1: '3', 0x2: '2', 0x3: '1', }; // x=>'reserved'
    const bitrates =
    {
        'V1L1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288,320,352,384,416,448],
        'V1L2': [0,32,48,56, 64, 80, 96,112,128,160,192,224,256,320,384],
        'V1L3': [0,32,40,48, 56, 64, 80, 96,112,128,160,192,224,256,320],
        'V2L1': [0,32,48,56, 64, 80, 96,112,128,144,160,176,192,224,256],
        'V2L2': [0, 8,16,24, 32, 40, 48, 56, 64, 80, 96,112,128,144,160],
        'V2L3': [0, 8,16,24, 32, 40, 48, 56, 64, 80, 96,112,128,144,160],
    };
    const sample_rates =
    {
        '1': [44100,48000,32000],
        '2': [22050,24000,16000],
        '2.5': [11025,12000, 8000],
    };
    const samples =
    {
        1: {1: 384, 2: 1152, 3: 1152, }, //MPEGv1,     Layers 1,2,3
        2: { 1: 384, 2: 1152, 3: 576, }, //MPEGv2/2.5, Layers 1,2,3
    };
    //var b0 = fourbytes[0]; //.charCodeAt(0); //will always be 0xff
    var b1 = fourbytes[1]; //.charCodeAt(1);
    var b2 = fourbytes[2]; //.charCodeAt(2);
    var b3 = fourbytes[3]; //.charCodeAt(3);

    var version_bits = (b1 & 0x18) >> 3;
    var version = versions[version_bits];
    var simple_version = (version == '2.5')? 2: version;

    var layer_bits = (b1 & 0x06) >> 1;
    var layer = layers[layer_bits];

    var protection_bit = (b1 & 0x01);
    var bitrate_key = 'V' + simple_version + 'L' + layer; //sprintf('V%dL%d', simple_version , layer);
    var bitrate_idx = (b2 & 0xf0) >> 4;
    var bitrate = bitrates[bitrate_key][bitrate_idx] || 0;

    var sample_rate_idx = (b2 & 0x0c) >> 2; //0xc => b1100
    var sample_rate = sample_rates[version][sample_rate_idx] || 0;
    var padding_bit = (b2 & 0x02) >> 1;
    var private_bit = (b2 & 0x01);
    var channel_mode_bits = (b3 & 0xc0) >> 6;
    var mode_extension_bits = (b3 & 0x30) >> 4;
    var copyright_bit = (b3 & 0x08) >> 3;
    var original_bit = (b3 & 0x04) >> 2;
    var emphasis = (b3 & 0x03);

    var info = {};
    info.Version = version; //MPEGVersion
    info.Layer = layer;
    //$info['Protection Bit'] = $protection_bit; //0=> protected by 2 byte CRC, 1=>not protected
    info.Bitrate = bitrate;
    info['Sampling Rate'] = sample_rate;
    //$info['Padding Bit'] = $padding_bit;
    //$info['Private Bit'] = $private_bit;
    //$info['Channel Mode'] = $channel_mode_bits;
    //$info['Mode Extension'] = $mode_extension_bits;
    //$info['Copyright'] = $copyright_bit;
    //$info['Original'] = $original_bit;
    //$info['Emphasis'] = $emphasis;
    info.Framesize = framesize(layer, bitrate, sample_rate, padding_bit);
    info.Samples = samples[simple_version][layer];
    return info;
}

function framesize(layer, bitrate, sample_rate, padding_bit)
{
    var factor = (layer == 1)? [12, 4]: [144, 1]; //MPEG layer 1 vs. 2/3
    return Math.floor(((factor[0] * bitrate * 1000 / sample_rate) + padding_bit) * factor[1]);
}


function test1()
{
var fs = require('fs');
var glob = {sync: function(pattern) { console.log("glob(%s)".blue, pattern); return require('glob').sync(pattern); }, };
var relpath = require('my-plugins/utils/relpath');
var elapsed = require('my-plugins/utils/elapsed');
var PoolStream = require('pool_stream');
var MuteStream = require('mute-stream')
var Speaker = require('speaker');
this.media = glob.sync(process.cwd() + '/my-projects/songs/xmas/Amaz*/!(*-bk).mp3');
console.log("media: ", JSON.stringify(this.media));
this.selected = 0;
var this_seq = this;
this.elapsed = new elapsed();
        console.log("open [%d/%d] '%s' for playback".cyan, this.selected, this.media.length, relpath(this.media[this.selected]));
        var pool = new PoolStream() //TODO: is pool useful here?
        var mute = new MuteStream();
        fs.createReadStream(this.media[this.selected])
//BROKEN            .pipe(pool) //does this make much difference?
            .pipe(mute)
            .pipe(new lame.Decoder())
            .once('format', function (format)
            {
                console.log("raw_encoding: %d, sampleRate: %d, channels: %d, signed? %d, float? %d, ulaw? %d, alaw? %d, bitDepth: %d".cyan, format.raw_encoding, format.sampleRate, format.channels, format.signed, format.float, format.ulaw, format.alaw, format.bitDepth);
                console.log("fmt @%s: ", this_seq.elapsed.scaled(), JSON.stringify(format));
                console.log(this.media || "not there".red);
                this.pipe(new Speaker(format))
//                    .on('end', function ()
//                    {
//                        console.log('speaker end time is: %s', this_seq.elapsed.scaled());
//                    })
                    .once('open', function () //speaker
                    {
                        console.log('speaker open time is: %s', this_seq.elapsed.scaled());
                    })
                    .once('flush', function () //speaker
                    {
                        console.log('speaker flush time is: %s', this_seq.elapsed.scaled());
                    })
                    .once('close', function () //speaker
                    {
                        console.log('speaker close time is: %s', this_seq.elapsed.scaled());
                    })
                    .on('error', function (err) //stream or speaker
                    {
                        console.log('speaker error: '.red, err);
                    })
                    .once('finish', function () //stream
                    {
                        console.log('speaker finish time is: %s', this_seq.elapsed.scaled());
                    });
            })
            .on('error', function (err)
            {
                console.log('lame error: '.red, err);
            });
}



function test2()
{
    var playlist = require('my-projects/playlists/xmas2015');
//    playlist.play(); return; //do this once to load cache
//    playlist.pipe(outhw); //NOTE: starts playback

//    setTimeout(test, 21000); //give async scan time to run and cache time to write

//    return;
//    console.log("%s duration: %s, #songs %d, scheduled? %d", playlist.name, scaled(playlist.duration), playlist.songs.length, !!playlist.scheduler);
    setTimeout(function()
    {
        playback(playlist); //.play()); //play once
    }, 3000); //kludge: give async data a chance to settle
//playback(playlist.scheduled()); //play according to schedule
}


function playback(player)
{
    player.volume = 1.0;
    player
      .on('begin', function(err, info) { if (err) showerr("begin", err); else console.log("begin".green); })
      .on('start', function(err, info) { if (err) showerr("start", err); else status("start", info.current); })
      .on('progress', function(err, info) { if (err) showerr("progess", err); else status("progress", info.current); })
//      .on('pause', function(err, info) { if (err) showerr("pause", err); else status("pause", info.current); })
//      .on('resume', function(err, info) { if (err) showerr("resume", err); else status("resume", info.current); })
      .on('stop', function(err, info) { if (err) showerr("stop", err); else status("stop", info.current); }) //, info.next); })
      .on('end', function(err, info) { if (err) showerr("end", err); else console.log("end".cyan); })
      .on('error', function(err) { if (err) showerr("end", err); })
      .play({loop: 10, }); //single: true, }); //{single: true, index: 1, }); //{loop: 2, single: true, index: 1});
//    setTimeout(function() { player.volume = 0.5; }, 2000);
//    setTimeout(function() { player.volume = 0.3; }, 3000);
//    setTimeout(function() { player.volume = 2.0; }, 6000);
//    setTimeout(function() { player.mute(); }, 16000);
//    setTimeout(function() { player.unmute(); }, 26000);
}

function status(when, current, next)
{
    var color = (when == "start")? 'green': (when.indexOf("next") != -1)? 'cyan': 'blue';
    console.log("%s song[%d] %s, duration %s, elapsed %s, played %d%%, buffered %d%%"[color], when, current.index, current.name, scaled(current.duration), current.elapsed.scaled(), 100*current.played/current.duration, 100*current.buffered/current.duration);
    if (next) status("  " + when + " next", next);
}

function showerr(when, err)
{
    console.log("%s ERROR: ".red, when, JSON.stringify(err));
}

test2();

//eof
