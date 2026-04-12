const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
  pingTimeout: 60000,
  pingInterval: 25000
});
const { v4: newID } = require('uuid');

const rooms = new Map();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/create-room', (req, res) => {
  const roomId = newID();
  const enableSyntax = req.body.syntax === 'on';
  rooms.set(roomId, {
    host: null,
    users: new Set(),
    config: {
      syntaxHighlighting: enableSyntax
    }
  });

  const avQuery = `?video=${req.body.video === 'on'}&audio=${req.body.audio === 'on'}`;
  res.redirect(`/${roomId}${avQuery}`);
});

app.get('/join-room', (req, res) => {
  const roomId = req.query.roomId;
  if (!roomId) return res.redirect('/');
  const avQuery = `?video=${req.query.video === 'on'}&audio=${req.query.audio === 'on'}`;
  res.redirect(`/${roomId}${avQuery}`);
});

app.get('/:room', (req, res) => {
  if (req.params.room === 'favicon.ico') return res.status(204).end();

  const videoOn = req.query.video !== 'false';
  const audioOn = req.query.audio !== 'false';
  res.render('room', {
    roomId: req.params.room,
    videoOn,
    audioOn
  });
});

io.on('connection', socket => {
  let currentRoom = null;
  let currentUserId = null;
  let currentRoomObj = null;

  socket.on('join-room', (roomId, userId) => {
    currentRoom = roomId;
    currentUserId = userId;

    let roomObj = rooms.get(roomId);

    if (!roomObj) {
      roomObj = {
        host: null,
        users: new Set(),
        config: { syntaxHighlighting: true }
      };
      rooms.set(roomId, roomObj);
    }

    currentRoomObj = roomObj;

    let isHost = false;
    if (roomObj.users.size === 0 || roomObj.host === null) {
      roomObj.host = userId;
      isHost = true;
    }

    roomObj.users.add(userId);
    socket.join(roomId);

    socket.emit('room-config', {
      isHost,
      hostId: roomObj.host,
      syntaxHighlighting: roomObj.config.syntaxHighlighting
    });

    socket.to(roomId).emit('user-connected', userId);
  });

  socket.on('code-update', (code) => {
    if (currentRoom) socket.to(currentRoom).emit('code-update', code, socket.id);
  });

  socket.on('language-change', (language) => {
    if (currentRoomObj && currentRoomObj.host === currentUserId) {
      socket.to(currentRoom).emit('language-change', language);
    }
  });

  socket.on('cam-state', (enabled) => {
    if (currentRoom) socket.to(currentRoom).emit('peer-cam-state', currentUserId, enabled);
  });

  socket.on('mic-state', (enabled) => {
    if (currentRoom) socket.to(currentRoom).emit('peer-mic-state', currentUserId, enabled);
  });

  socket.on('leave-room', () => {
    handleDisconnect();
    if (currentRoom) socket.leave(currentRoom);
    currentRoom = null;
    currentUserId = null;
    currentRoomObj = null;
  });

  socket.on('disconnect', () => {
    handleDisconnect();
  });

  function handleDisconnect() {
    if (!currentRoom || !currentUserId || !currentRoomObj) return;

    const room = currentRoomObj;
    room.users.delete(currentUserId);

    if (room.host === currentUserId) {
      io.to(currentRoom).emit('room-closed');
      rooms.delete(currentRoom);
    } else {
      io.to(currentRoom).emit('user-disconnected', currentUserId);
      if (room.users.size === 0) rooms.delete(currentRoom);
    }

    currentRoom = null;
    currentUserId = null;
    currentRoomObj = null;
  }
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});