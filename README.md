duckcast
========

Node application to stream websites to multiple browsers and mobile devices

Requires Node ~0.10.x and NPM (Node Package Manager)

##Installation:
    npm install
    
##Run the script
    node duckcast 
  
##Use Forever
    sudo npm install forever -g
    forever start -w duckcast.js

###To reload stylesheets call
    http://duckcastdomain.local/watcher

###Todo:
- Listener to reload javascript on change
- Better documentation 
