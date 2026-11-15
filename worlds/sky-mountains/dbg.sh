#!/bin/sh
# usage: dbg.sh "<params>" name   -> shots/sky-mountains/_<name>.png
cd /home/aladix/Desktop/Projects/OtherWorlds && node tools/debug.mjs sky-mountains "shot=1&$1" --wait ${3:-6} --png shots/sky-mountains/_$2.png 2>&1 | grep -v '^{"world"' | head -40
