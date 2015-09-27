'use strict';

require('colors');

//see https://www.npmjs.com/package/onoff

//pinout: see http://www.element14.com/community/docs/DOC-73950/l/raspberry-pi-2-model-b-gpio-40-pin-block-pinout
//https://github.com/fivdi/epoll
//with RPi 2 @ 900Mhz, epoll gets > 10K int/sec (< 100 usec, which is okay)

var Gpio = require('onoff').Gpio; //uses /sys/class/gpio internally
var led = new Gpio(15, 'out');
var button = new Gpio(14, 'in', 'both');


//green LED Vf ~= 2.1V, limit to 4 mA from 3.3V using 300 ohm series res (725 ohm for 5V)

/*
button.watch(function(err, value) {
  led.writeSync(value);
});

button.watch(function (err, value) {
  if (err) {
    throw err;
  }

  led.writeSync(value);
});
*/

setInterval(tick, 1000).unref(); //don't let timer keep program alive; https://nodejs.org/api/timers.html#timers_setinterval_callback_delay_arg

function tick()
{
    led.syncWrite(1); //on
    setTimeout(function() { led.syncWrite(0); }, 200); //off 1/5 sec later
}

//CAUTION: need to release resources at end
process.on('SIGINT', function ()
{
    led.unexport();
    button.unexport();
    console.log("bye".red);
    process.exit();
});

//eof
