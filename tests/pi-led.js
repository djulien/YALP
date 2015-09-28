'use strict';
//see https://www.npmjs.com/package/onoff

require('colors');

//pinout: see http://www.element14.com/community/docs/DOC-73950/l/raspberry-pi-2-model-b-gpio-40-pin-block-pinout
//https://github.com/fivdi/epoll
//with RPi 2 @ 900Mhz, epoll gets > 10K int/sec (< 100 usec, which is okay)

var Gpio = require('onoff').Gpio; //uses /sys/class/gpio internally
var led = new Gpio(15, 'out');
var button = new Gpio(14, 'in', 'both');


//green LED Vf ~= 2.1V, limit to 4 mA from 3.3V using 300 ohm series res (725 ohm for 5V)


//on/off
function test1()
{
setInterval(tick, 1000); //.unref(); //don't let timer keep program alive; https://nodejs.org/api/timers.html#timers_setinterval_callback_delay_arg

function tick()
{
    led.writeSync(1); //on
    console.log("on".green);
    setTimeout(function() { led.writeSync(0); console.log("off".red); }, 200); //off 1/5 sec later
}
}


//echo
//NOTE: should enable internal pull-up/down or use external
//https://github.com/fivdi/onoff/wiki/Enabling-Pullup-and-Pulldown-Resistors-on-The-Raspberry-Pi
function test2()
{
    console.log("led:", led);
    console.log("button:", button);
    setTimeout(function() { console.log("bye".red); }, 10000);

    button.watch(function(err, value)
    {
        if (err) { console.log("ERROR".red, err); throw err; }
        led.writeSync(value);
        console.log("value: %d".yellow, value);
    });
}


//watch using streams
//https://learn.adafruit.com/node-embedded-development/streams
function test3()
{
var GpioStream = require('gpio-stream'),
    http = require('http'),
    button = GpioStream.readable(17),
    led = GpioStream.writable(18);

var stream = button.pipe(led);

http.createServer(function (req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.write('<pre>logging button presses:\n');
  stream.pipe(res);
}).listen(8080);
}


//CAUTION: need to release resources at end
process.on('SIGINT', function ()
{
    led.unexport();
    button.unexport();
    console.log("bye".red);
    process.exit();
});

//test1();
test2();

//eof
