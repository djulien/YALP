# YALP MVP:
* model/fx latency stats
* multi-core render
* FPS/univlen calculator / wr config.txt / 22.5 fps
* pi-fm?
- fx + model notebooks/interactive preview
- install proc
- sms, log
- AP/fixed IP, easy display
- Vixen2, xLights real-time adapter
- audience interactivity (kids games, maze? dwg?)
- arch diagram

# shm
//ipcs

//ipcs -i ### -m

//ipcrm -M 0x59414c4f


# Intro
What, another Lightshow player?

Well, yeah. :P  This one has very specific use cases (described down below).  (although it can may be useful in other scenarios as well).

demos/videos:

# getting started
## installation:
1. Raspbian lite, Ubuntu MATE, etc (your choice)
2. node + nvm (recent version)
3. mkdir folder; cd folder
4. npm init  #your project settings
5. npm install --save yalp
  or git clone https://github.com/djulien/YALP.git + cd + npm install (~8 minutes)
5b. npm run fake-install to create symlink to self
6. npm run setup  #install dpi24 overlay; set static IP; enable AP
7. (customize show settings)
8. pm2 start yalp
9. connect some WS281X strings/strips and experiment with models, fx, etc.

## setup:
## customization:
## startup:
## documentation:


## architecture/What is it?
YALP is a software-only Lightshow player.

The RPi itself provides all of the hardware necessary to run a production show up to ~27K WS281X nodes (@30 FPS) or 40K nodes (@20 FPS).  With the help of the dpi24 device tree overlay, the RPi GPU provides a high-speed 24-bit parallel port that generates a constantly refreshed data stream for the WS281X LEDs.

arch-diagram.png
ctlr-photo.jpg

The primary use case for YALP is:
- *highly* custom props/models
- *highly* custom effects
- *highly* custom scheduling and/or audience interaction
- very extensible, simple, open architecture
- *does not* crash; it just runs
- simple experimentation/easy tinkering; can be customized/extended entirely in Javascript, no build process
- text editing vs mouse + gui
- software-only*, commodity hardware*

## * minimum configuration:
In the lab, all you need is a (headless) RPi, WS281X LEDs, speaker (if syncing to audio), power supply, and maybe a Pi breakout board.  The RPi *is* the controller.

For a real show, you *might* need a Pi Hat with voltage level shifters or differential (RS485) transceivers, depending on how far the LEDs are from the RPi, and of cource an FM transmitter or other audio system if syncing to music.

## * commodity hardware:
Treat the RPi controller as commodity/disposable.  If it breaks, just replace it.  (have spares on hand, like any other parts)

## What it *is not*
YALP is not intended to compete with other existing Lightshow hardware or software.  It was designed to address a very specific usage scenario (as described earlier), although there is likely some cross-over into other hardware/software.

## documentation
jsnotebooks for models, fx, scheduling, audience/interactivity; incl (3D) photos of props with fx experiments

# folder sttr
Yalp folder
 ├── (build)
 ├── config
 ├── fx
 ├── graphics
 ├── incl
 ├── layouts
 ├── models
 ├── (node_modules)
 ├── seq
 │    ├── songs
 │    └── tests
 └─── src
