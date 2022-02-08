#!/bin/bash
# https://github.com/nvm-sh/nvm
uname -m  #armv7l
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
#  [exit]; command -v nvm
#nvm ls-remote
nvm install --lts
nvm which node
command -v nvm
node -v  #v16.13.2
npm -v  #8.1.2
#??make available to all users!  (needed for sudo)
#https://stackoverflow.com/questions/21215059/cant-use-nvm-from-root-or-sudo
#sudo ln -s "$NVM_DIR/versions/node/$(nvm version)/bin/node" "/usr/local/bin/node"  #DON'T USE /local?
#sudo ln -s "$NVM_DIR/versions/node/$(nvm version)/bin/npm" "/usr/local/bin/npm"
#eof
