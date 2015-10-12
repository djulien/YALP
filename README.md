# yalp (under construction)
YALP - Yet Another Lightshow Player
This one uses HTML/CSS/JavaScript on the front end and nodejs/npm/commonjs on the back end.

This is really just a big experiment.  If it works, this thing might (eventually) be: (tentative feature list, not a commitment)
- all the code is in JavaScript - the only tools needed to customize it are a text editor
- everything is a plug-in - there's very little code in the core; the rest is all customizable/extensible
- integrated IDE - you can use the tool to customize itself
- since there is a nodejs server and the UI is in the browser, remote admin is supported
- there is no built-in concept of sequence, model, effects, hardware, etc - they are all just javascript objects (plug-ins) that render or stream themselves as needed
- precise lighting control down to 1 msec resolution (no more sloppy PC timing)
- email notification on start-up or crash; server can be headless
- fault monitoring and auto-restart
- live-reload (not really too useful in this case)
- auto-bundle ui files for browser
- graphical flowchart-like editor
- use webcam + OpenCV to monitor or trigger
- 3D visualizer: 3D models, interactive and rendered in real time via WebGL - you can drag/zoom/whatever the preview while the show is running to get a better visualization
- hopefully will be runnable on a RPi (mp3 playback only takes ~ 5% cpu so far)
