
var port = 8529;

var http = require('http'), 
    io = require('socket.io'),
    router = require('choreographer').router(),
    uuid = require('node-uuid');

var server = http.createServer(router);

// socket.io, I choose you
io = io.listen(server);
io.set('log level', 1);
///io.configure('production', function() {
///});


server.listen(port, function () {
  console.log('running htklatchd at http://localhost:' + port);
});

function make_file_server(path, type) {
  var content = require('fs').readFileSync([__dirname, path].join('/'));
  return function (req, res) {
    res.writeHeader(200, {
      'Content-Type': type,
      'Content-Length': content.length
    });
    res.end(content);
  };
};

// static files
router.get('/', make_file_server('index.html', 'text/html'));
[
, 'jquery.min.js'
, 'client.js'
].forEach(function (name) {
  router.get('/' + name, make_file_server(name, 'application/javascript'));
});




var users = {};

io.sockets.on('connection', function (socket) {

  console.log(socket.id, 'connected');

  socket.on('join', function join (nick) {
    if (nick in users) {
      console.log(socket.id, 'nick is already in use:', nick);
      socket.emit('stupid', 'nick: ' + nick);
    } else {
      users[nick] = socket;

      socket.removeListener('join', join);

      socket.emit('you join', nick);
      socket.broadcast.emit('join', nick);

      console.log(socket.id, 'is now known as', nick);

      socket.on('query', function (to, text) {
        users[to].emit('say', nick, text);
      });

      socket.on('nick', function (newnick) {
        if (newnick in users) {
          console.log(socket.id, 'nick is already in use:', newnick);
          socket.emit('stupid', 'nick: ' + newnick);
        } else {
          var oldnick = nick;
          nick = newnick;
          delete users[oldnick];
          users[nick] = socket;
          console.log(socket.id, oldnick, 'is now known as', newnick);
          socket.emit('you nick', newnick);
          socket.broadcast.emit('nick', oldnick, newnick);
        };
      });

      socket.on('say', function (text) {
        socket.emit('you say', nick, text);
        socket.broadcast.emit('say', nick, text);
      });

      socket.on('disconnect', function () {
        delete users[nick];
        io.sockets.emit('part', nick);
      });
    };
  });

  socket.on('names', function () {
    socket.emit('names', Object.keys(users));
  });

  socket.on('disconnect', function () {
    console.log(socket.id, 'disconnected');
  });
});

