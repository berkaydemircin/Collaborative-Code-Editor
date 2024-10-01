const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: newID } = require('uuid');

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Generates and redirects to a new URL
app.get('/', (req, res) => {
  res.redirect(`/${newID()}`);
});

app.get('/:room', (req, res) => {
  res.render('room', { roomId: req.params.room });
});

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);

    // Broadcast code updates
    socket.on('code-update', (code) => {
      socket.to(roomId).emit('code-update', code, socket.id);
    });

    // Broadcast language changes (coding)
    socket.on('language-change', (language) => {
      socket.to(roomId).emit('language-change', language);
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
