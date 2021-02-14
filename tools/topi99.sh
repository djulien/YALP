#!/bin/sh
#DEST=192.168.1.7
#FOLDER=~/ws*
DEST=192.168.1.99
#DEST=192.168.1.2
#USER=pi
FOLDER=~$USER/dpi24/yalp21
#FOLDER=~$USER
#PWD=raspberry
#echo "REMOVE PASSWORD!\nREMOVE PASSWORD!\nREMOVE PASSWORD!\n"
for file in "$@"
do
    echo "$file -> $DEST:$FOLDER"
    sshpass -p $PWD scp "$file" $USER@$DEST:$FOLDER
done
#eof
