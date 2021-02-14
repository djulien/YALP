YALP MVP:
multi-core render
fx + model notebooks/interactive preview
install proc
pi-fm
git, merge with past hist vs. FWP + GpuPort?
sms, log
AP/fixed IP, easy display
FPS/univlen calculator
Vixen2, xLights real-time adapter
eSOL MVP:
audience interactivity (kids games)
arch diagram

# shm
//ipcs
//ipcs -i ### -m
//ipcrm -M 0x59414c4f


# Intro
What, another Lightshow player?
Well, yeah. :P  This one has very specific use cases (described down below).  (although it can may be useful in other scenarios as well).

demos/videos:

# getting started
installation:
setup:
customization:
startup:
documentation:

# github info
## installation
Raspbian lite, Ubuntu MATE, etc
node + nvm
mkdir folder; cd folder
npm init  #your project settings
npm install --save yalp
or git clone
npm run setup  #install dpi24 overlay; set static IP; enable AP
(custom show settings)
pm2 start yalp

## architecture/What is it?
YALP is a software-only Lightshow player.
The RPi itself provides all of the hardware necessary to run a production show up to ~27K WS281X nodes (@30 FPS) or 40K nodes (@20 FPS).  With the help of the dpi24 device tree overlay, the RPi GPU provides a high-speed 24-bit parallel port that generates a constantly refreshed data stream for the WS281X LEDs.

arch-diagram.png
ctlr-photo.jpg

The primary use case for YALP was:
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
Treats the RPi controller as commodity/disposable.  If it breaks, just replace it.  (have spares on hand, like any other parts)

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
