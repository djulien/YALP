#!/bin/bash
#finish YALP setup
#cd into yalp folder before running this script

#get all dependencies:
npm install --production --log-level warn

#sym link my-plugins so they can be "require"d:
cd my-plugins
npm link
cd ../node_modules
npm link my-plugins
cd ..

#sym link my-projects so they can be "require"d:
cd my-projects
npm link
cd ../node_modules
npm link my-projects
cd ..

echo "done!"
