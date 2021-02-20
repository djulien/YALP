# TODO

- split screen: info + viewer
- interactive/live edit fx
- split pane, RHS = fxfiddle = selectable model + seq ~ jsfiddle

# Fade

Fade gradually changes the nodes in a model from one set of values to another set of values.  It is typically used as a *transition* from one color or image to another.

## Parameters

- start = fx start time with the sequence (msec)
- duration = how long to run the fade (msec); controls how quickly the fade occurs
- fps = #steps/sec; controls how smoothly the fade occurs
- from = starting color; use a scalar RGB value (all nodes same color) or RGB array (pattern or image)
- to = ending color; use a scalar RGB value (all nodes same color) or RGB array (pattern or image)

In _from_ and _to_, use _XPARENT_ to refer to the current color of the model.

## Try it out

Working

## Code
```
const {RGBblend} = require("yalp21/incl/colors");

//my_exports({fx_fade});
async function fx_fade(opts)
{
    const {model, start, duration, fps, await_frame} = opts;
//    const steplen = 1e3 / fps; //msec
    const from = Array.isArray(opts.from)? opts.from.slice(): //from image: clone the array
                new Uint32Array(model.nodes1D.length).fill(opts.from >>> 0); //from color
    const to = Array.isArray(opts.to)? opts.to.slice(): //to image: clone the array
                new Uint32Array(model.nodes1D.length).fill(opts.to >>> 0); //to color
//    for (let fxtime = start; fxtime < start + duration; fxtime = (Math.trunc(fxtime / steplen) + 1) * steplen)
    for (let fxtime = start; fxtime < start + duration; fxtime += 1e3 / fps)
    {
        const frbuf = await await_frame(fxtime);
        if (!frbuf || frbuf.timestamp > start + duration) break; //seq completed/cancelled or end of fx
        fxtime = frbuf.timestamp; //adaptive; comment out for fixed frame rate
        for (let n = 0; n < model.nodes1D.length; ++n)
            model.nodes1D[n] = RGBblend((fxtime - start) / duration, from[n], to[n]);
        model.out(frbuf);
    }
}
```
## etc
A [jsNotebook](https://github.com/djulien/jsNotebook) is an interactive web page using JavaScript - like a [Jupyter Notebook](https://jupyter.org), except that it runs Javascript instead of Python ('cause I'm a Javascript 

trying other types of footnotes ...
foo bar[^1] is a very[^n] foo bar[^n] [^1]: This is my first footnote [^n]: Visit http://ghost.org [^n]: A final footnote

## References
[^showdown]: source: https://github.com/showdownjs/showdown
   wiki: https://github.com/showdownjs/showdown/wiki/Showdown's-Markdown-syntax

#### (0-install boilerplate)
<!-- jsNotebook 0.20.7.D: append lines below for 0-install -->
<noscript>ERROR: This jsNotebook can't be displayed unless JavaScript is enabled.</noscript>
<script broken-src="https://raw.githubusercontent.com/djulien/jsNotebook/master/dist/jsNotebook.js" src="./jsNotebook.js" cdn-src="https://unpkg.com/jsNotebook@0.20.7/dist/jsNotebook.min.js" localhost-src="http://localhost:3000/js/jsNotebook.js" type="text/javascript" xtype="module" defer></script>
<style type="text/css">
/* inline styles in case Javascript is disabled */
html, div { background-color: #333; }
noscript {
  position: absolute; top: 10%; left: 10%; right: 10%;
  font-size: 1.5em; font-weight: bold;
  padding: 6px 12px;
  background-color: #300;
  border: 2px solid #f00;
  color: #f00;
}
</style>
#### (eof)
