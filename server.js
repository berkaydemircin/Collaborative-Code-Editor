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

app.get('/', (req, res) => {
  res.redirect(`/${newID()}`);
});

app.get('/:room', (req, res) => {
  res.render('room', { roomId: req.params.room });
});

io.on('connection', socket => {
  let currentRoom = null;
  let currentUserId = null;

  socket.on('join-room', (roomId, userId) => {
    currentRoom = roomId;
    currentUserId = userId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(userId);

    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);

    const roomUsers = Array.from(rooms.get(roomId));
    socket.emit('room-users', roomUsers);

    socket.on('code-update', (code) => {
      socket.to(roomId).emit('code-update', code, socket.id);
    });

    socket.on('language-change', (language) => {
      socket.to(roomId).emit('language-change', language);
    });
  });

  socket.on('disconnect', () => {
    if (currentRoom && currentUserId) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.delete(currentUserId);
        if (room.size === 0) {
          rooms.delete(currentRoom);
        }
      }
      socket.to(currentRoom).emit('user-disconnected', currentUserId);
    }
  });

  socket.on('leave-room', () => {
    if (currentRoom && currentUserId) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.delete(currentUserId);
        if (room.size === 0) {
          rooms.delete(currentRoom);
        }
      }
      socket.to(currentRoom).emit('user-disconnected', currentUserId);
      socket.leave(currentRoom);
    }
  });
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