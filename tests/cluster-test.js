//examples:
//http://blog.carbonfive.com/2014/02/28/taking-advantage-of-multi-processor-environments-in-node-js/
//https://www.quora.com/Is-it-pointless-to-run-node-js-on-a-multi-core-cpu-because-node-js-is-single-threaded

'use strict';

const cluster = require('cluster');
const OS = require('os');
const childproc = require('child_process');
const numCPUs = OS.cpus().length;

console.log('Before the fork', cpuid());

if (cluster.isMaster)
{
	console.log('I am the master, launching workers!', cpuid());
	for (var i = 0; i < numCPUs; ++i) cluster.fork();
	cluster.on('exit', function(worker, code, signal) { console.log("worker exit", cpuid()); });
}
else
{
	console.log('I am a worker!', cpuid());
	console.log("fib(40):", fibonacci(40), cpuid());
}

console.log('After the fork', cpuid());


//get processor of a process:
//from http://stackoverflow.com/questions/30496989/determine-which-core-is-running-node-js-process-at-runtime
function cpuid()
{
//	console.log("i'm on cpu %d/%d".blue, getPSR(process.pid), OS.cpus().length);
	return getPSR(process.pid) + '/' + OS.cpus().length;
function getPSR(pid) //, callback)
{
    var exec = childproc.execSync;
    var command = 'ps -A -o pid,psr -p ' + pid + ' | grep ' + pid + ' | grep -v grep |head -n 1 | awk \'{print $2}\'';
    var result = exec(command);
    return result.toString("utf-8").trim();
}
}


function fibonacci(n)
{
	return (n > 1) ? fibonacci(n - 1) + fibonacci(n - 2): 1;
}


//eof
