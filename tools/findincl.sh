#!/bin/bash
#find C++ include file

#use bright versions ("9" instead of "3"):
BLUE="\x1b[94m"
RED="\x1b[91m"
GREEN="\x1b[92m"
CYAN="\x1b[96m"
RESET="\x1b[0m"

FILE=$1
if [ "x$FILE" != "x" ]; then
    PREFIX="finding '$FILE' in ";
fi
echo -e "${CYAN}${PREFIX}C++ search path ...${RESET}"

#CMD="g++ -E -v -xc++ - < /dev/null"
CMD="g++ -E -v -xc++ - < /dev/null 2>&1"
#PATHS=$( $CMD 2>&1 )
#echo $PATHS
ask_gcc()
{
    g++ -E -v -xc++ - < /dev/null 2>&1
}

#for i in $($CMD); do
#  echo $i
#done
#capture=0
shopt -s nocasematch
#echo | g++ -E -v -xc++ - 2>&1 | while read -r line; do
ask_gcc | while read -r line; do #read entire lines; don't break them up
#    echo "$line"
#    echo "$capture ${line:1:40}"
    case "$line" in
        *" starts "*)
            capture=1
            ;;
        "End of "*)
            capture=0
            ;;
        *)
            if [ "x$capture" != "x1" ]; then
#                echo "${line:1:40}"
#                echo "line $capture"
                x=1 #kludge: bash needs a stmt here
            elif [ "x$FILE" == "x" ]; then
                echo "${BLUE}$line${RESET}" #just show paths
            elif [ -f "$line/$FILE" ]; then
                echo -e "${GREEN}found: $line/$FILE${RESET}";
            else
                echo -e "${RED}nope: $line/$FILE${RESET}";
            fi
            ;;
    esac
done

#error=$( { ./useless.sh | sed 's/Output/Useless/' 2>&4 1>&3; } 2>&1 )
#echo "The message is \"${error}.\""
#https://stackoverflow.com/questions/962255/how-to-store-standard-error-in-a-variable
#eof
