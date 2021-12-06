#!/bin/bash
#find C++ include file

#use bright versions ("9" instead of "3"):
BLUE="\x1b[94m"
RED="\x1b[91m"
GREEN="\x1b[92m"
CYAN="\x1b[96m"
RESET="\x1b[0m"

EDIT=xdg-open
#FOUND=( )
#FOUND=

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

#from https://stackoverflow.com/questions/2172352/in-bash-how-can-i-check-if-a-string-begins-with-some-value
startswith()
{
    case $2 in
        "$1"*) true;;
        *) false;;
    esac;
}

#set -x
#for i in $($CMD); do
#  echo $i
#done
#capture=0
#https://stackoverflow.com/questions/36340599/how-does-shopt-s-lastpipe-affect-bash-script-behavior
set +m #disable job control
shopt -s lastpipe
shopt -s nocasematch
#echo | g++ -E -v -xc++ - 2>&1 | while read -r line; do
ask_gcc | while read -r line; do #read entire lines; don't break them up
#    echo "$line"
#    echo "$capture ${line:1:40} $FOUND"
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
#                if [ "x${FOUND[@]}" == "x" ]; then
                if [ "x$FOUND" == "x" ]; then
#                    FOUND=( "$EDIT" "$line/$FILE" )
                    FOUND="$EDIT $line/$FILE"
                elif startswith "$FOUND" "$EDIT "; then
#                    FOUND[0]="#${FOUND[0]}"
                    FOUND="#$FOUND"
                fi
            else
                echo -e "${RED}nope: $line/$FILE${RESET}";
            fi
            ;;
    esac
done
#echo "$FOUND"
#"${FOUND[@]}" #open file if 1 match found
echo -e "${CYAN}opening $FOUND ...${RESET}"
$FOUND

#error=$( { ./useless.sh | sed 's/Output/Useless/' 2>&4 1>&3; } 2>&1 )
#echo "The message is \"${error}.\""
#https://stackoverflow.com/questions/962255/how-to-store-standard-error-in-a-variable
#eof
