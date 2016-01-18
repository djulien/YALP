//YALP ui loader (loads ui plug-ins after initial setup)

'use strict';
var Elapsed = require('my-plugins/utils/elapsed');
var elapsed = new Elapsed(); //NOTE: browserify wants this separated from above

//if (document.location.href.match(/file:\/\//i)) //need to load from web server to avoid cors errors
//{
//    var redir = document.location.href;
//    redir = "http://localhost:2016" + redir.replace(/^.*\//, "/"); //CAUTION: assumes server root is YALP folder
//    console.log("redir to " + redir + " for cors");
//    document.location.replace(redir); //http://stackoverflow.com/questions/503093/how-can-i-make-a-redirect-page-using-jquery
//}

for (;;) //try to make good server connection; CAUTION: no other modules are loaded at this point
{
    var host;
    if (document.location.href.match(/^file:\/\//i)) //need to load from web server to avoid cors errors; CAUTION: can't use any external modules here
    {
        host = window.prompt("YALP.html must be loaded from a web server using http.  Which web server to use?", "localhost:2015");
        if (!host) continue; //return localpath; //let it fail elsewhere
    }
    else if (typeof require == 'undefined') //no amd or commonjs (node.js) loader
    {
        host = window.prompt("AMD loader not found (bad YALP server).  Which web server to use?", "localhost:2016");
        if (!host) continue; //return localpath; //let it fail elsewhere
    }
    else break;
    var redir = document.location.href;
    redir = "http://" + host + redir.replace(/^.*\//, "/"); //CAUTION: assumes server root is YALP folder
    alert("redir to " + redir);
    console.log("redir to " + redir + " for cors");
    document.location.replace(redir); //http://stackoverflow.com/questions/503093/how-can-i-make-a-redirect-page-using-jquery
}


//use sockjs api, but replace client reload logic with custom logic to reload selected parts:
//require('../../node_modules/reload/lib/sockjs-0.3-min.js');
//require('http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js');
function reconnect(want_page)
{
    if (want_page === true) elapsed.started = elapsed.now; //reset delay timer
    var delay = (elapsed.now < 6000)? 1000: (elapsed.now < 60000)? 10000: 60000;
    var retry = (want_page !== false)? setTimeout(function openwait() { reconnect(); }, delay): null;
    console.log("trying to open socket '%s'; will retry again in %s sec? %s", window.location.origin + '/reload', delay / 1000, !!retry);
    var sock = new SockJS(/*window.location.origin +*/ '/reload'); //'http://mydomain.com/my_prefix');
    sock.onopen = function onopen()
    {
        if (retry) clearTimeout(retry); retry = null; //don't need to retry again
        console.log('opened: protocol', sock.protocol);
        if (want_page !== false) window.location.reload(); //reload entire page after server restarts
    }
    sock.onmessage = function onmsg(msg)
    {
        console.log('message', msg.data || msg);
        if (msg.reload) loadjs(msg.script); //reload single file
    }
    sock.onclose = function onclose() //server shut down or restarted
    {
        sock = null;
        console.log('close');
        setTimeout(function reopen() { reconnect(true); }, 250);
    };
}
$(document).ready(function()
{
    reconnect(false); //CAUTION: don't try to connect before dom ready (in case iframe fallback is used?)
});
//sock.send('test');
//sock.close();


//from http://stackoverflow.com/questions/5285006/is-there-a-way-to-refresh-just-the-javascript-include-while-doing-development
function loadjs(src)
{
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = src + '?' + (new Date).getTime(); //force it to be unique to defeat caching
    document.getElementsByTagName('head')[0].appendChild(script);
}


//console.log("incl ui plug-ins ...");
//require('/my-plugins/ui/*.js', {mode: 'expand'});
//console.log("... ui plug-ins");

////const glob = require('glob');
//const path = require('path');
//console.log("cwd", path.join(__dirname, '..', '..'));
////var list = require(/*'my-plugins/ui/*.js'*/ 'repl.js', {cwd: path.join(__dirname, '..', '..'), xmode: 'list', limit: 2, sort: function(LHS, RHS) { var rhs = LHS.toLocaleUpperCase(), lhs = RHS.toLocaleUpperCase(); return (lhs < rhs)? -1: (lhs > rhs)? 1: 0; }});
//var list = 0;
//console.log(list);
////const plugin = require('my-plugins/ui/*.js', {mode: 'expand'}); //expand to one require for each matched file
//require('my-plugins/ui/test.js');

//eof
