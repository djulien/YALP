#!/bin/bash
#disable swap file
# https://www.raspberrypi.org/forums/viewtopic.php?t=238461
sudo dphys-swapfile swapoff
sudo dphys-swapfile uninstall
sudo systemctl disable dphys-swapfile
#eof
