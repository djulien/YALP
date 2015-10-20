#!/bin/sh
#remove cached data
find . -name cache.json -exec  echo rm {} \;
find . -name cache.json -exec  rm {} \;
