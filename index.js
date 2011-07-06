
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



var accounts = {
  'tv': {
    password: 'foobar'
  },
  'swerler': {
    password: '123'
  },
  'dlaubach': {
    password: '123'
  },
  'mhanowski': {
    password: '123'
  },
};

var users = {};
var polls = {};

polls[123] = {
  id: 123,
  topic: "Are you sure?",
  results: {
    yes: 0,
    no: 0
  }
};


function nick_is_acceptable(nick) {
  return typeof nick === 'string'
      && nick.length >= 2
      && /^[\w]+$/.test(nick)
};


io.sockets.on('connection', function (socket) {

  console.log(socket.id, 'connected');


  function anonymous_vote () {
    socket.emit('stupid', 'vote: you have to login first!');
  };

  socket.on('vote', anonymous_vote);

  socket.on('names', function () {
    socket.emit('names', Object.keys(users));
  });

  socket.on('disconnect', function () {
    console.log(socket.id, 'disconnected');
  });

  // push polls
  Object.keys(polls).forEach(function (poll_id) {
    var poll = polls[poll_id];
    socket.emit('poll update', poll);
  });

  socket.on('join', function join (nick, password) {
    if (!nick_is_acceptable(nick)) {
      console.log(socket.id, 'nick plain stupid:', JSON.stringify(nick));
      socket.emit('stupid', 'nick: ' + JSON.stringify(nick));
    } else if (nick in users) {
      console.log(socket.id, 'nick is already in use:', nick);
      socket.emit('stupid', 'nick: ' + nick);
    } else {
      if (nick in accounts) {
        var account = accounts[nick];
        if (password !== account.password) {
          if (!password) {
            console.log(socket.id, 'join: password required');
            socket.emit('stupid', 'join: password required');
          } else {
            console.log(socket.id, 'join: bad password');
            socket.emit('stupid', 'join: bad password');
          };
          socket.emit('password required', nick);
          return;
        };
      };
      users[nick] = socket;

      socket.removeListener('join', join);

      socket.emit('you join', nick);
      socket.broadcast.emit('join', nick);

      console.log(socket.id, 'is now known as', nick);

      socket.on('query', function (to, text) {
        users[to].emit('say', nick, text);
      });

      socket.on('nick', function (newnick) {
        if (!nick_is_acceptable(newnick)) {
          console.log(socket.id, 'nick plain stupid:', JSON.stringify(newnick));
          socket.emit('stupid', 'nick: ' + JSON.stringify(newnick));
        } else if (newnick in users) {
          console.log(socket.id, 'nick is already in use:', newnick);
          socket.emit('stupid', 'nick: ' + newnick);
        } else {
          if (newnick in accounts) {
            var account = accounts[newnick];
            if (password !== account.password) {
              if (!password) {
                console.log(socket.id, 'join: password required');
                socket.emit('stupid', 'join: password required');
              } else {
                console.log(socket.id, 'join: bad password');
                socket.emit('stupid', 'join: bad password');
              };
              socket.emit('password required', newnick);
              return;
            };
          };
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

      socket.removeListener('vote', anonymous_vote);
      socket.on('vote', function (poll_id, decision) {
        if (!(nick in accounts)) {
          socket.emit('stupid', 'vote: you\'re not elective');
        } else if (!(poll_id in polls)) {
          console.log(socket.id, 'voted ', decision, 'for non-existent poll_id:', poll_id);
          socket.emit('stupid', 'vote: inexistent poll_id ' + JSON.stringify(poll_id));
        } else {
          var poll = polls[poll_id];
          var user = users[nick];
          if (!('votes' in user)) {
            user.votes = {};
          };
          if (decision in poll.results) {
            if (poll_id in user.votes) {
              console.log(socket.id, 'remove old vote on poll ' + poll_id);
              var vote = user.votes[poll_id];
              poll.results[vote]--;
            };
            console.log(socket.id, 'vote ' + decision + 'on poll ' + poll_id);
            var vote = user.votes[poll_id] = decision;
            poll.results[vote]++;
            io.sockets.emit('poll update', poll);
          } else {
            socket.emit('stupid', 'invalid vote: ' + decision);
          };
        };
      });
    };
  });
});
