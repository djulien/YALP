//multi-core test
//idea:
// reserve one core for lighting I/O (to maximize L1 cache hits), then spawn child process on another core for cpu-intensive rendering; child process can shift between cores, non critical
//setup:
//in /boot/cmdline.txt add "isolcpus=0" to reserve first core for I/O handling
//run this js file on first core using "taskset -c 0 node thisfile.js"
//use "top" then "1" to show utilization of each core

'use strict';

var x = 0;
for (;;)
{
	if (!(++x % 10000000)) console.log("x = " + x);
}
