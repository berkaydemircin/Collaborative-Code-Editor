const socket = io('/');
const videoGrid = document.getElementById('video-grid');

const peer = new Peer();

const myVideo = document.createElement('video');
myVideo.muted = true; // muting local to avoid echo

const peers = {};
let editor;
let isSettingValue = false;
let myStream = null;
let isHost = false;
let roomConfig = null;


socket.on('room-config', (config) => {
  isHost = config.isHost;
  roomConfig = config;

  const langSelector = document.getElementById('language-selector');
  if (langSelector) {
    // only the host should pick the language
    langSelector.disabled = !config.isHost || !config.syntaxHighlighting;
  }

  if (editor && !config.syntaxHighlighting) {
    editor.setOption('mode', 'text/plain');
  }
});

socket.on('room-closed', () => {
  alert('The host has disconnected. The room is now closed.');
  window.location.href = '/';
});

socket.on('user-connected', (userId) => {
  console.log('User connected:', userId);
  setTimeout(() => connectToNewUser(userId), 1000);
});

socket.on('user-disconnected', (userId) => {
  console.log('User disconnected:', userId);
  if (peers[userId]) {
    peers[userId].call.close();
    cleanupVideoElement(userId);
    delete peers[userId];
  }
});

socket.on('code-update', (code, senderId) => {
  if (socket.id === senderId) return;
  isSettingValue = true;
  if (editor) editor.setValue(code);
  isSettingValue = false;
});

socket.on('language-change', (language) => {
  if (!editor) return;
  isSettingValue = true;
  editor.setOption('mode', language);
  document.getElementById('language-selector').value = language;
  isSettingValue = false;
});

socket.on('peer-cam-state', (userId, enabled) => {
  const container = document.querySelector(`.video-container[data-container-id="${userId}"]`);
  if (!container) return;
  let overlay = container.querySelector('.cam-off-overlay');
  if (!enabled) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'cam-off-overlay';
      overlay.textContent = 'Camera off';
      container.appendChild(overlay);
    }
  } else {
    if (overlay) overlay.remove();
    const vid = container.querySelector('video');
    if (vid && vid.srcObject) vid.play().catch(() => { });
  }
});

socket.on('peer-mic-state', (userId, enabled) => {
  console.log(`Peer ${userId} mic: ${enabled ? 'on' : 'off'}`);
});

peer.on('open', (id) => {
  console.log('My peer ID:', id);
  socket.emit('join-room', ROOM_ID, id);
});

peer.on('error', (err) => {
  console.error('Peer error:', err);
});

peer.on('call', (call) => {
  console.log('Incoming call from:', call.peer);
  call.answer(myStream || undefined);

  const videoEl = document.createElement('video');

  call.on('stream', (remoteStream) => {
    if (!document.querySelector(`video[data-peer-id="${call.peer}"]`)) {
      addVideoStream(videoEl, remoteStream, call.peer, false);
    }
  });

  call.on('close', () => cleanupVideoElement(call.peer));
  call.on('error', () => cleanupVideoElement(call.peer));

  peers[call.peer] = { call, videoEl };
});


async function setupMediaStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    stream.getVideoTracks().forEach(t => t.enabled = INITIAL_VIDEO);
    stream.getAudioTracks().forEach(t => t.enabled = INITIAL_AUDIO);

    myStream = stream;
    addVideoStream(myVideo, stream, 'my-video', true);
  } catch (err) {
    console.warn('Media stream unavailable:', err.message);
  }
}

function connectToNewUser(userId) {
  if (peers[userId]) {
    console.log('Already connected to:', userId);
    return;
  }

  if (!myStream) {
    console.warn('No local stream — skipping call to', userId);
    return;
  }

  console.log('Calling:', userId);
  const call = peer.call(userId, myStream);
  const videoEl = document.createElement('video');

  call.on('stream', (remoteStream) => {
    if (!document.querySelector(`video[data-peer-id="${userId}"]`)) {
      addVideoStream(videoEl, remoteStream, userId, false);
    }
  });

  call.on('close', () => cleanupVideoElement(userId));
  call.on('error', () => {
    cleanupVideoElement(userId);
    delete peers[userId];
  });

  peers[userId] = { call, videoEl };
}


function addVideoStream(video, stream, peerId, isLocal = false) {
  const container = document.createElement('div');
  container.className = 'video-container' + (isLocal ? ' self' : '');
  container.setAttribute('data-container-id', peerId);

  video.srcObject = stream;
  video.setAttribute('data-peer-id', peerId);
  video.autoplay = true;
  video.playsInline = true;
  video.addEventListener('loadedmetadata', () => {
    video.play().catch(e => console.error('Play error:', e));
  });
  video.addEventListener('pause', () => {
    video.play().catch(() => { });
  });

  container.appendChild(video);

  if (isLocal) {
    const controls = createLocalControls();
    container.appendChild(controls);
  }

  videoGrid.appendChild(container);
}

function createLocalControls() {
  const controls = document.createElement('div');
  controls.className = 'video-controls';

  // mic button
  const audioBtn = document.createElement('button');
  audioBtn.className = 'control-button' + (!INITIAL_AUDIO ? ' muted' : '');
  audioBtn.title = 'Toggle microphone';
  audioBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;
  audioBtn.onclick = () => {
    if (!myStream) return;
    const track = myStream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      audioBtn.classList.toggle('muted', !track.enabled);
      socket.emit('mic-state', track.enabled);
    }
  };

  // Camera button
  const videoBtn = document.createElement('button');
  videoBtn.className = 'control-button' + (!INITIAL_VIDEO ? ' muted' : '');
  videoBtn.title = 'Toggle camera';
  videoBtn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>`;
  videoBtn.onclick = () => {
    if (!myStream) return;
    const track = myStream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      videoBtn.classList.toggle('muted', !track.enabled);
      socket.emit('cam-state', track.enabled);
    }
  };

  controls.appendChild(audioBtn);
  controls.appendChild(videoBtn);
  return controls;
}

function cleanupVideoElement(peerId) {
  const container = document.querySelector(`.video-container[data-container-id="${peerId}"]`);
  if (container) {
    const video = container.querySelector('video');
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    container.remove();
  }
}

function initializeCodeEditor() {
  const editorElement = document.getElementById('editor');
  const languageSelector = document.getElementById('language-selector');
  const themeSelector = document.getElementById('theme-selector');

  editor = CodeMirror(editorElement, {
    lineNumbers: true,
    lineWrapping: true,
    mode: 'python',
    autoCloseBrackets: true,
    theme: 'ayu-dark'
  });

  if (roomConfig && !roomConfig.syntaxHighlighting) {
    editor.setOption('mode', 'text/plain');
    languageSelector.disabled = true;
  }

  document.body.className = 'theme-dark';

  const savedTheme = localStorage.getItem('editorTheme');
  if (savedTheme) {
    editor.setOption('theme', savedTheme);
    themeSelector.value = savedTheme;
    updateBodyTheme(savedTheme);
  }

  editor.on('change', () => {
    if (isSettingValue) return;
    socket.emit('code-update', editor.getValue());
  });

  languageSelector.addEventListener('change', () => {
    const lang = languageSelector.value;
    editor.setOption('mode', lang);
    if (isHost) socket.emit('language-change', lang);
  });

  themeSelector.addEventListener('change', () => {
    const theme = themeSelector.value;
    editor.setOption('theme', theme);
    updateBodyTheme(theme);
    localStorage.setItem('editorTheme', theme);
  });

  function updateBodyTheme(theme) {
    const map = { 'eclipse': 'theme-light', 'material': 'theme-gray', 'ayu-dark': 'theme-dark' };
    document.body.className = map[theme] || 'theme-dark';
  }
}
initializeCodeEditor();
setupMediaStream();

// copy room id button
document.getElementById('copy-room-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(ROOM_ID).then(() => {
    const btn = document.getElementById('copy-room-btn');
    btn.textContent = '\u2713 Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '\u29c9 Copy Room ID';
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = ROOM_ID;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  });
});