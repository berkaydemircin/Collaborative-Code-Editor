const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const peer = new Peer(undefined, {
  host: '/',
  port: '3001' // => ! Port of the peerjs server !
});
const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {};
let editor;
let isSettingValue = false;  // Flag to prevent the loop

navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  addVideoStream(myVideo, stream);

  // Answer incoming calls
  peer.on('call', call => {
    call.answer(stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream);
    });
  });

  // When a new user connects
  socket.on('user-connected', userId => {
    setTimeout(() => {
      connectToNewUser(userId, stream);
    }, 500);
  });

  initializeCodeEditor();

  // Receive code updates from other users
  socket.on('code-update', (code, senderId) => {
    if (socket.id === senderId) return; // Ignore if the update came from this client (this was causing loops)

    isSettingValue = true;
    editor.setValue(code); // Update the editor with the new code
    isSettingValue = false;
  });
});

socket.on('user-disconnected', userId => {
  if (peers[userId]) {
    peers[userId].close();
    const videoElements = document.getElementsByTagName('video');
    for (let i = 0; i < videoElements.length; i++) {
      if (videoElements[i].getAttribute('data-peer-id') === userId) {
        videoElements[i].remove();
      }
    }
    delete peers[userId];
  }
});

peer.on('open', id => {
  socket.emit('join-room', ROOM_ID, id);
});

function connectToNewUser(userId, stream) {
  const call = peer.call(userId, stream);
  const video = document.createElement('video');

  call.on('stream', userVideoStream => {
    addVideoStream(video, userVideoStream);
  });

  call.on('close', () => {
    video.remove();
  });

  peers[userId] = call;
}

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener('loadedmetadata', () => {
    video.play();
  });
  videoGrid.append(video);
}

// Initialize CodeMirror and sync editor changes
function initializeCodeEditor() {
  const editorElement = document.getElementById('editor');
  const languageSelector = document.getElementById('language-selector');

  editor = CodeMirror(editorElement, {
    lineNumbers: true,
    lineWrapping: true,
    mode: 'python',  // Default
    autoCloseBrackets: true,
    theme: 'ayu-dark'
  });

  // Send code changes to server
  editor.on('change', () => {
    if (isSettingValue) return;  // This is to prevent loops
    const code = editor.getValue();
    const language = languageSelector.value;
    socket.emit('code-update', code, language);  // Emitting the code change
  });

  // Emit language change when dropdown is changed
  languageSelector.addEventListener('change', () => {
    const selectedLanguage = languageSelector.value;
    //Updating language
    editor.setOption('mode', selectedLanguage);  
    socket.emit('language-change', selectedLanguage); 
  });

  // Listen for language changes from other users
  socket.on('language-change', (language) => {
    isSettingValue = true;  // This is to prevent loops
    editor.setOption('mode', language); 
    languageSelector.value = language;  // Updating the dropdown menu
    isSettingValue = false;
  });
}
