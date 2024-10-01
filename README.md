# Collaborative-Code-Editor
This app is a collaborative code editor, allowing users to establish a connection, share webcam video and audio, and utilizes sockets to maintain a code editor for the users to write code together with syntax highlighting and support for multiple languages. 

## Technologies Used
* Node.js
* WebRTC
* PeerJS
* Express.js
* Socket.io (Higher level implementation of WebSocket)
* CodeMirror
* EJS

## To install dependencies
In the root directory, run:
```
npm install
```
This will install the core dependencies, afterwards run:
```
npm install -g peer
```
This will install the peerjs server used for WebRTC signaling. Now you're done with the installs!

## To run the code
Run:
```
node server.js
```
and
```
peerjs --port 3001
```
Please note that 3001 is currently hard-coded so if you need to run the app on a different port, please check script.js under the public directory. Now the localhost is ready! Go to localhost:3000 to test the app! (Note the 3000 port is located at the bottom of server.js if it needs to be changed)

## Troubleshooting
You must give the browser permission to use the webcam and microphone for the program to work. If you did and there is still no webcam video, please check your OS' privacy settings. If you encounter any errors, please feel free to contact me.
