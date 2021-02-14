# YALP (2017 redo) - Yet Another Lightshow Player
This one uses HTML/CSS/JavaScript on the front end and Node.js/npm on the back end.

## Project goals
This is really just a big experiment.

**_(under construction)_**  
**_(under construction)_**  
**_(under construction)_**  

Don't believe what you read below - too preliminary!  

Tentative features (not a commitment):
* all the code is in JavaScript - the only tools needed to customize it are a text editor
* everything is a plug-in - there's very little code in the core; the rest is all customizable/extensible
* integrated IDE - you can use the tool to customize itself
* since there is a nodejs server and the UI is in the browser, remote admin is supported
* no built-in concept of sequence, model, effects, hardware, etc - they are all just javascript objects (plug-ins) that render or stream themselves as needed
* precise lighting control down to 1 msec resolution (no more sloppy PC USB timing)
* email notification on start-up or crash; server can be headless
* fault monitoring and auto-restart
* live-reload (only useful in Authoring mode)
* auto-bundle ui files for browser
* graphical flowchart-like editor
* use webcam + OpenCV to monitor or trigger
* 3D visualizer: 3D models, interactive and rendered in real time via WebGL - you can drag/zoom/whatever the preview while the show is running to get a better visualization
* hopefully will be runnable on a RPi (mp3 playback only takes ~ 5% cpu so far)

### TODO
* link crontab-ui mailconfig.js with mine
* merge crontab-ui's, my email cfg
* merge Making Friends with the GPU

## YALP Architecture
![alt text](https://github.com/djulien/yalp-redo/raw/master/docs/doc-pieces/yalp-architecture.png "YALP architecture")

There are 2 parts to set up:
1. Editor runs on a Dev machine
2. Playback runs on RPi (Prod machine)
* Editor and Playback can be on the same machine, but it's safer to use separate machines.

## YALP Folder structure
```
.
├── config
│   ├── backups (various files, grouped by purpose)
│   └── (various settings files)
├── docs
│   └── (various docs)
├── editor
│   ├── assets (various asset files)
│   ├── css (various style sheets)
│   ├── js (various js files)
│   └── libs (various third party libraries)
├── js-shared
│   └── (various js files, grouped by purpose)
├── LICENSE
├── logs
│   └── (logs can go here)
├── node_modules
│   ├── (various dependency modules)
│   └── yalp -> ..
├── package.json
├── playback
│   └── (various playback components, grouped by purpose)
├── README.md
└── scripts
    └── (various scripts, grouped by purpose)

.  
&#x22; &#xd06; &#xcab; huh  
&#xe294; &#x949c; &#x9ce2; &#x9480; x  
&#x00e2949c; &#x00e29480; &#x00e29480; config  
&#xe2949c;&#xe29480;&#xe29480; docs  
```

## To set up Editor (Dev) environment
1. Install Node.js from https://nodejs.org/en/download/current/ :
* using ???npm install??? or:
    1. `wget  https://nodejs.org/dist/v7.7.2/node-v7.7.2-linux-armv7l.tar.xz`
    2. `tar  xz  node-v7.7.2-linux-armv7l.tar.xz`
    3. `sudo  mv  node-v7.7.2-linux-armv7l /opt/node`
* `ln  -s  [Node.js path]  /usr/local/bin/node` (needed for running .js files from shell)
2. Install Git:
* Initialize your Git installation (once only):
    *    `git  config  --global  --list`
    *    `git  config  --global  user.name  "my_name"`
    *    `git  config  --global  user.email  "my_email"`
3. ???Install nginx???
4. Obtain the YALP source code:
    1. Fork the YALP repository on Github (optional)
    2. Clone the Git repository:  
    `git  clone  https://github.com/djulien/yalp-redo.git` (or your forked repo name)
    3. Rename local repository (if desired)
5. Prepare local repo for usage:
    1. `cd  yalp-redo` (or whatever you named it)
    2. `npm  install`  #to install dependencies + devDependencies
    ~~ 3. `source ./scripts/setenv.sh`  #no need to restart shell if you use the "source" command ~~
6. Configure email, connection info:
    * edit `./config/private.sh` for connections to RPi
    * edit `./config/settings.js` as desired
    * edit `./config/my_settings.cfg` as desired
7. Set up scheduled tasks:
    * log on with the userid that will run YALP
    ~~* edit `./config/Link to crontab-ui mailconfig.js` to set default email settings~~
    ~~* further edit `./config/mailcfg.js` as desired~~
    * `./scripts/crontabui-run.sh` to run crontab-ui
    * `./scripts/crontabui-backup.sh` to save/export data
    ~~ * need to set env vars first? else had to manually edit env.db when > 1 ENV var ~~
8. Test email connections:
    * send or text an email to address in `./config/private.sh`
    * you should get back a reply

## To set up Playback (Prod) environment (RPi)
* If Playback machine is same as Editor machine, skip to step 6
* NOTE: X-Windows is not needed on Playback machine; can be disabled to conserve resources
0. Set up O/S as described in *Making Friends with the GPU*
1. Install Node.js as described above
2. Install Git, but no need to initialize global vars
3. ???Install nginx???
4. ~~Obtain YALP source code, as described above~~
5. ~~Prep the local repo, as described above~~
6. ~~Deploy scheduled tasks:~~
    * Use `crontab  <  ./config/crontab.txt`  
    **_OR_**
    * Use crontab-ui as described above (export and import commands)
3. `mkdir` or `cd` into the folder where you want YALP run-time files
4. `npm  install  yalp-redo  --save`  
    **_OR_**
    git clone and then `npm  install  --production`
5. (some more steps)

# etc.

blah, blah, blah

# License
CC-BY-NC-SA-4.0
