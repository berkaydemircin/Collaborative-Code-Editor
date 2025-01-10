const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const peer = new Peer(undefined, {
  host: '/',
  port: '3001',
  debug: 3 
});

const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {};
let editor;
let isSettingValue = false;
let myStream = null;

peer.on('error', (err) => {
  console.error('Peer connection error:', err);
  setTimeout(() => {
    if (peer.disconnected) {
      peer.reconnect();
    }
  }, 5000);
});

async function setupMediaStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    myStream = stream;
    addVideoStream(myVideo, stream, 'my-video');

    peer.on('call', call => {
      console.log('Receiving call from:', call.peer);
      call.answer(stream);
      const video = document.createElement('video');
      
      call.on('stream', userVideoStream => {
        console.log('Received stream from:', call.peer);
        const existingVideo = document.querySelector(`video[data-peer-id="${call.peer}"]`);
        if (!existingVideo) {
          addVideoStream(video, userVideoStream, call.peer);
        }
      });

      call.on('error', error => {
        console.error('Call error:', error);
        cleanupVideoElement(call.peer);
      });

      peers[call.peer] = {
        call,
        video
      };
    });

    // Handle new user connections with retry mechanism
    socket.on('user-connected', userId => {
      console.log('User connected, attempting to connect to:', userId);
      
      // Add a small delay before connecting to ensure peer is ready
      setTimeout(() => {
        const retryConnect = (attempts = 0) => {
          if (attempts < 3) {
            try {
              connectToNewUser(userId, stream);
            } catch (err) {
              console.error(`Connection attempt ${attempts + 1} failed:`, err);
              setTimeout(() => retryConnect(attempts + 1), 1000);
            }
          } else {
            console.error('Could not connect, refresh the page');
          }
        };
        retryConnect();
      }, 1000);
    });

    socket.on('code-update', (code, senderId) => {
      if (socket.id === senderId) return;
      
      isSettingValue = true;
      editor.setValue(code);
      isSettingValue = false;
    });

    initializeCodeEditor();
  } catch (err) {
    console.error('Failed to get media stream:', err);
    alert('Failed to access camera/microphone. Please check permissions.');
  }
}

function cleanupVideoElement(peerId) {
  const videoElements = document.querySelectorAll(`video[data-peer-id="${peerId}"]`);
  videoElements.forEach(video => {
    if (video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      video.srcObject = null;
    }
    video.remove();
  });
}

socket.on('user-disconnected', userId => {
  console.log('User disconnected:', userId);
  if (peers[userId]) {
    if (peers[userId].call) {
      peers[userId].call.close();
    }
    cleanupVideoElement(userId);
    delete peers[userId];
  }
});

function connectToNewUser(userId, stream) {
  try {
    console.log('Initiating call to:', userId);
    
    // preventing rare duplicate connection bug
    if (peers[userId]) {
      console.log('Already connected to:', userId);
      return;
    }

    const call = peer.call(userId, stream);
    const video = document.createElement('video');

    call.on('stream', userVideoStream => {
      console.log('Received stream in connectToNewUser from:', userId);
      const existingVideo = document.querySelector(`video[data-peer-id="${userId}"]`);
      if (!existingVideo) {
        addVideoStream(video, userVideoStream, userId);
      }
    });

    call.on('close', () => {
      console.log('Call closed with:', userId);
      cleanupVideoElement(userId);
    });

    call.on('error', error => {
      console.error('Call error with:', userId, error);
      cleanupVideoElement(userId);
      delete peers[userId];
    });

    peers[userId] = {
      call,
      video
    };
    
    // this hould fix the disconnect issue
    setTimeout(() => {
      if (!video.srcObject) {
        console.log('No stream received, cleaning up:', userId);
        cleanupVideoElement(userId);
        delete peers[userId];
        connectToNewUser(userId, stream);
      }
    }, 5000);
  } catch (err) {
    console.error('Error connecting to new user:', err);
    cleanupVideoElement(userId);
    delete peers[userId];
  }
}

function addVideoStream(video, stream, peerId) {
  try {
    video.srcObject = stream;
    video.setAttribute('data-peer-id', peerId);
    
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(err => console.error('Error playing video:', err));
    });
    
    video.addEventListener('error', (e) => {
      console.error('Video error:', e);
      cleanupVideoElement(peerId);
    });
    
    videoGrid.append(video);
  } catch (err) {
    console.error('Error adding video stream:', err);
  }
}

peer.on('open', id => {
  console.log('My peer ID:', id);
  socket.emit('join-room', ROOM_ID, id);
});

function initializeCodeEditor() {
  const editorElement = document.getElementById('editor');
  const languageSelector = document.getElementById('language-selector');
  const themeSelector = document.getElementById('theme-selector');

  // Initializing editor
  editor = CodeMirror(editorElement, {
    lineNumbers: true,
    lineWrapping: true,
    mode: 'python',
    autoCloseBrackets: true,
    theme: 'ayu-dark'
  });

  document.body.className = 'theme-dark';

  const savedTheme = localStorage.getItem('editorTheme');
  if (savedTheme) {
    editor.setOption('theme', savedTheme);
    themeSelector.value = savedTheme;
    updateBodyTheme(savedTheme);
  }

  editor.on('change', () => {
    if (isSettingValue) return;
    const code = editor.getValue();
    const language = languageSelector.value;
    socket.emit('code-update', code, language);
  });

  // Language change handler
  languageSelector.addEventListener('change', () => {
    const selectedLanguage = languageSelector.value;
    editor.setOption('mode', selectedLanguage);
    socket.emit('language-change', selectedLanguage);
  });

  // Theme change handler
  themeSelector.addEventListener('change', () => {
    const selectedTheme = themeSelector.value;
    editor.setOption('theme', selectedTheme);
    updateBodyTheme(selectedTheme);
    localStorage.setItem('editorTheme', selectedTheme);
  });

  function updateBodyTheme(theme) {
    const themeMap = {
      'eclipse': 'theme-light',
      'material': 'theme-gray',
      'ayu-dark': 'theme-dark'
    };
    document.body.className = themeMap[theme] || 'theme-dark';
  }

  socket.on('language-change', (language) => {
    isSettingValue = true;
    editor.setOption('mode', language);
    languageSelector.value = language;
    isSettingValue = false;
  });
}

setupMediaStream().catch(err => {
  console.error('Setup failed:', err);
});