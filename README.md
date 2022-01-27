# YALP MVP:
* done- model/fx latency stats
* done- multi-core render
* done- FPS/univlen calculator / wr config.txt / 22.5 fps
* pi-fm?
- fx + model notebooks/interactive preview
- partial- install proc
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

Well, yeah. :P  This one has very specific use cases (described down below), although it might be useful in other scenarios as well.

demos/videos:

# getting started
## installation:
1. Raspbian lite, Ubuntu MATE, etc (your choice) <sup>*</sup>
2. node + nvm (recent version) <sup>*</sup>
3. yalp21js
  "git clone https://github.com/djulien/YALP.git" + cd into
  "npm run sdl2-inst"
  "npm install" (~8 minutes)
OR:
  "mkdir folder"; "cd folder"
  "npm init"  #your project settings
  "npm install --save yalp"
==================>
4. copy dpi24-nosync.dtbo to /boot/overlays, set dt ovl + screen res in config.txt
  gpio readall #to check gpio config; 24 GPIO pins should show "ALT2" mode, the remaining 4 (SDA.0/1, SCL.0/1) will be "IN"
  tvservice -s #check video settings
see other settings in example /boot/config.txt
#debug:
  ??cmdline.txt += fbcon=map:10 #maps tty1/3/5/... to fb0, tty2/4/6/... to fb1
#  config.txt +=  dtdebug=1
#  sudo vcdbg log msg
#  dtc -I fs /proc/device-tree
#  dtc -I fs -O dtb -o base.dtb /proc/device-tree
vcgencmd get_config str  #to see dpi timing
vcgencmd measure_clock pixel  #to see pixel clock freq (accurate)
#vcgencmd measure_clock dpi  #to see pixel clock freq (accurate)


5b. npm run fake-install to create symlink to self
6. npm run setup  #install dpi24 overlay; set static IP; enable AP
7. (customize show settings)
8. pm2 start yalp
9. connect some WS281X strings/strips and experiment with models, fx, etc.

### * Example installation steps for headless Raspberry Pi OS Lite
- On a working computer
These steps are for Ubuntu MATE 20.04.  Change as appropriate for other env.
1. install RPi Imager or equiv tool for writing SD cards
2. use Accessories -> RPi-Imager (or equiv) to write Raspberry Pi OS (aka Raspbian) Lite 32-bit to SD card
3. mount "boot" filesystem from SD card  #the following files go into BOOT, not ROOT
4. "touch /media/your-userid/boot/ssh" to enable ssh for headless install; NOTE: repeat this after using raspi-config
5. to enable wifi create /media/your-userid/boot/wpa_supplicant.conf containing the following: <<<
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US
#can have multiple network{} sections
network={
    scan_ssid=1  #needed only for hidden networks
    priority=1
    ssid="your_wifi_ssid"
    #psk="your_wifi_password" #CAUTION: if special char, xlate for UK keyboard first
    key_mgmt=WPA-PSK  #or NONE for no password
}
<<<
5b. to encrypt wifi password, use "wpa_passphrase [ssid-name] [password-name]" and paste output into wpa_supplicant.conf
6. optional: set RPi host name by editing "/media/your-userid/root/etc/hosts" and "/media/your-userid/root/etc/hostname" 
7. recommended: add "net.ifnames=0" to /media/your-userid/boot/cmdline.txt to enable predictable network interface names
8. sync + unmount SD card
- on RPi
1. insert SD card + power on, wait a few minutes for filesys to expand
2. from client computer ssh into RPi using "ssh pi@pi-hostname.local" or "ssh pi@pi-ip-addr"; default RPi pwd is "raspberry"
  if can't find RPi, can for it using "sudo nmap -p 22 -sV 192.168.1.0/24"  #substitute appropriate subnet
  on client use "sudo nmcli networking off/on" if needed
3. "sudo apt update"; "sudo apt upgrade"
4. "sudo raspi-config" settings:
- System -> Audio: headphones (!HDMI)
- System -> Password   #esol21!
- System -> Hostname   #esolpi
- Interface  (SSH, !SPI, !I2C, !serial) #optional, default already?
- Localisation -> Locale  en_GB -> en_US, en_US, 
- Localization -> Timezone  US, Pacific (!new)
- Localization -> Keyboard  #generic 101, English US, default
- ??Performance -> GPU  #128
- ??OpenGL full?  !on Stretch Lite?? OpenGL: !need to install anything, just enable
- ??Performance -> Overlay
5. "sync" + "sudo reboot"
6. recommended? disable swap file (seems like a good idea for flash storage)
https://raspberrypi.stackexchange.com/questions/84390/how-to-permanently-disable-swap-on-raspbian-stretch-lite
   sudo dphys-swapfile swapoff
   sudo dphys-swapfile uninstall
https://www.raspberrypi.org/forums/viewtopic.php?t=238461
   sudo systemctl disable dphys-swapfile
7. "sudo apt install git"
8. if !already, "sudo apt-get install build-essential"
9. install node.js
https://github.com/nvm-sh/nvm
  uname -m  #armv7l
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
  [exit]; command -v nvm
  #nvm ls-remote
  nvm install --lts
  nvm which node  #v16.13.0 as of 10/31/21
  command -v nvm
  node -v  #v16.13.0  #v14.17.6
  npm -v  #8.1.0  #6.14.15
  npm install -g node-gyp
make available to all users!  (needed for sudo)
https://stackoverflow.com/questions/21215059/cant-use-nvm-from-root-or-sudo
  #sudo ln -s "$NVM_DIR/versions/node/$(nvm version)/bin/node" "/usr/local/bin/node"  #DON'T USE /local?
  #sudo ln -s "$NVM_DIR/versions/node/$(nvm version)/bin/npm" "/usr/local/bin/npm"
  sudo ln -s `[nvm] which node` /usr/local/bin/node
  ??sudo ln -s `which npm` /usr/local/bin/npm
  (or set secure path via "sudo visudo")
10. TODO: cre user rather than using pi admin user
11. "sudo apt install wiringpi"  #http://wiringpi.com/download-and-install/
 "sudo apt install pigpio" for testing/checking config; piscope is useful; https://abyz.me.uk/rpi/pigpio/piscope.html

## other commands:
uptime #check when booted


## audio setup:
#? sudo apt install alsa-utils
#? sudo modprobe snd_bcm2835
alsamixer to set volume!   ~33
aplay /usr/share/sounds/alsa/Front_Center.wav  #does support mp3

sudo install mpg123
mpg123 -o alsa:hw:1,0  test.mp3


## setup:
## customization:
## startup:
## documentation:


## architecture/What is it?
YALP is a software-only Lightshow player.

The RPi itself provides all of the hardware necessary to run a production show up to ~27K WS281X nodes (@30 FPS) or 40K nodes (@20 FPS).  With the help of the dpi24 device tree overlay, the RPi GPU provides a high-speed 24-bit parallel output port that generates a constantly refreshed data stream for the WS281X LEDs.

arch-diagram.png
ctlr-photo.jpg

The primary use case for YALP is:
- *highly* custom props/models
- *highly* custom effects
- *highly* custom scheduling and/or audience interaction
- very extensible, simple, open architecture
- *does not* crash; it just runs
- simple experimentation/easy "tinkering"; can be customized/extended entirely in Javascript, no build process
- text editing vs mouse + gui
- software-only*, commodity hardware*

## * minimum configuration:
In the lab, all you need is a (headless) RPi, WS281X LEDs, speaker (if syncing to audio), power supply, and maybe a Pi breakout board.  The RPi *is* the controller.

For a real show, you *might* need a Pi Hat with voltage level shifters or differential (RS485) transceivers, depending on how far the LEDs are from the RPi, and of course an FM transmitter or other audio system if syncing to music.

## * commodity hardware:
Treat the RPi controller as commodity/disposable.  If it breaks, just replace it.  (have spares on hand, like any other parts)

## What it *isn't*
YALP is not intended to compete with or replace other existing Lightshow hardware or software.  It was designed to address very specific usage scenarios (as described earlier), although there is some functional overlap with other hardware/software so it likely could be used in place of that.

## documentation
jsnotebooks for models, fx, scheduling, audience/interactivity; incl (3D) photos of props with fx experiments

# suggested workflow

No hard requirements, but suggested workflow is:
1. choose music, edit
2. choose (create or reuse/map existing) models/props
3. consider mood, tempo, features of song
4. choose overall colors, fx
5. identify evts/cues
6. match fx to evts/cues

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
