#!/bin/sh
#SRC=192.168.1.7
#FOLDER=~/ws*
SRC=192.168.1.99
#USER=pi
FOLDER=~$USER/dpi24/yalp21
#FOLDER=~$USER
#PWD=raspberry
#echo "REMOVE PASSWORD!\nREMOVE PASSWORD!\nREMOVE PASSWORD!\n"
for file in "$@"
do
    case "$file" in
    /*)
        path=$file
        ;;
    *)
        path=$FOLDER/$file
        ;;
    esac
    echo "getting $path"
    sshpass -p $PWD scp $USER@$SRC:$path .
done
#eof
