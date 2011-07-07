
var port = 8529;

var http = require('http'), 
    io = require('socket.io'),
    router = require('choreographer').router(),
    uuid = require('node-uuid'),
    readFileSync = require('fs').readFileSync;

var server = http.createServer(router);

// setup socket.io
io = io.listen(server);
io.set('log level', 1);

// logged-in users
var users = {};
var polls = JSON.parse(readFileSync(__dirname + '/polls.json'));
var accounts = JSON.parse(readFileSync(__dirname + '/accounts.json'));


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



function nick_is_acceptable(nick) {
  return typeof nick === 'string'
      && nick.length >= 2
      && /^[\w]+$/.test(nick)
};


var commands = {};
var services = {};
var actions = {};


var initial_state = 'anonymous';

var states = {
  'null': {
    services: [],
    commands: [],
    transitions: {}
  },
  'anonymous': {
    onenter: 'reset-nick',
    services: [ 'push-chat', 'push-poll' ],
    commands: [ 'nick/1', 'nick/2', 'disconnect' ],
    transitions: {
      'nick/1': 'onymous',
      'nick/2': 'authenticated',
      'disconnect': 'null'
    }
  },
  'onymous': {
    services: [ 'push-chat', 'push-poll' ],
    commands: [ 'nick/1', 'nick/2', 'chat/1', 'disconnect' ],
    transitions: {
      'nick/2': 'authenticated',
      'disconnect': 'null'
    }
  },
  'authenticated': {
    onleave: 'reset-authentication',
    services: [ 'push-chat', 'push-poll' ],
    commands: [ 'nick/1', 'nick/2', 'chat/1', 'vote/2', 'disconnect' ],
    transitions: {
      'nick/1': 'onymous',
      'nick/2': 'authenticated',
      'disconnect': 'null'
    }
  }
};


var nicks = {};

function nick_is_in_use(nick) {
  return nick in nicks;
};

function get_context(nick) {
  return nicks[nick];
};

function allocate_nick(context, nick) {
  var oldnick = context.socket.nick;

  nicks[nick] = context;
  context.socket.nick = nick;

  if (oldnick) {
    context.socket.emit('onymous', nick);
    context.socket.emit('info', oldnick + ' is now known as ' + nick);
    context.socket.broadcast.emit('info', oldnick + ' is now known as ' + nick);
    console.log(context.socket.id, oldnick, 'is now known as', nick);
  } else {
    context.socket.emit('onymous', nick);
    context.socket.broadcast.emit('info', nick + ' has joined');
    console.log(context.socket.id, 'has joined');
  };
};

function authenticate(nick, pass) {
  return nick in accounts && accounts[nick].password === pass;
};

commands['nick/1'] = function (nick) {
  if (!nick_is_acceptable(nick)) return this.reject('nick not acceptable');
  if (nick_is_in_use(nick)) return this.reject('nick is already in use');

  //
  allocate_nick(this, nick);

  if (nick in accounts) {
    this.socket.emit('info',
      'type "/auth <password>" to authenticate yourself');
  };

  return this.accept();
};

commands['nick/2'] = function (nick, pass) {
  if (!nick_is_acceptable(nick)) return this.reject('nick not acceptable');
  //if (nick_is_in_use(nick)) return this.reject('nick is already in use');
  //if (nick_is_registered(nick)) return this.reject('nick is not registered');
  if (!authenticate(nick, pass)) return this.reject('forbidden');

  //
  if (('nick' in this.socket
        && nick_is_in_use(nick)
        && this.socket.nick !== nick)
      || nick_is_in_use(nick)) {
    // kick
    var by = 'Bob Ross';
    var reason = 'you are made of stupid!';
    var spoofing_context = get_context(nick);
    spoofing_context.socket.emit('kick', by, reason);
    //free_nick(get_context(nick));
    enter_state(spoofing_context.socket, 'anonymous');
    // TODO change state to anonymous
  };

  allocate_nick(this, nick);

  // TODO move this somewhere else
  this.socket.authenticated = true;
  //this.socket.emit('info', nick + ' is now authenticated');
  this.socket.broadcast.emit('info', nick + ' is now authenticated');

  return this.accept();
};

commands['disconnect'] = function () {
  if ('nick' in this.socket) {
    this.socket.broadcast.emit('info',
        this.socket.nick + ' has quit: remote host closed the connection');
  };
  //free_nick(this);
  return this.accept();
};

commands['chat/1'] = function (text) {
  if (!this.socket.authenticated) {
    text = '<span style="color:gray">' + text + '</span>';
  };
  this.socket.emit('say', this.socket.nick, text);
  this.socket.broadcast.emit('say', this.socket.nick, text);
  return this.accept();
};


actions['reset-nick'] = function () {
  delete nicks[this.socket.nick];
  delete this.socket.nick;
};

actions['reset-authentication'] = function () {
  delete this.socket.authenticated;
};



io.sockets.on('connection', function (socket) {
  enter_state(socket, initial_state);
});

function enter_state(socket, state_name) {

  if (socket.leave_this_state) {
    socket.leave_this_state();
  };

  // TODO check if there is such a state
  var state = states[state_name];

  var base_context = {
    socket: socket
  };

  console.log(socket.id, 'enter state:', state_name);
  socket.emit('enter state', state_name);
  if (state.onenter) {
    console.log(socket.id, state_name, 'onenter');
    var action = actions[state.onenter];
    if (!action) {
      throw new Error('no such action: ' + state.onenter);
    };
    action.call(base_context);
  };

  // TODO enable services

  var enabled_commands = [];

  function enable_command(name, handler) {
    //console.log(socket.id, 'enable command:', name);
    enabled_commands.push(Array.prototype.slice.apply(arguments));
    socket.on(name, handler);
  };

  function disable_command(name, handler) {
    socket.removeListener(name, handler);
    //console.log(socket.id, 'disable command:', name);
  };

  socket.leave_this_state = function () {
    while (enabled_commands.length > 0) {
      disable_command.apply(base_context, enabled_commands.pop());
    };
    if (state.onleave) {
      console.log(socket.id, state_name, 'onleave');
      var action = actions[state.onleave];
      if (!action) {
        throw new Error('no such action: ' + state.onenter);
      };
      action.call(base_context);
    };
    console.log(socket.id, 'leave state:', state_name);
    socket.emit('leave state', state_name);
  };

  state.commands.forEach(function (command_name) {
    var command = commands[command_name];

    function command_handler () {
      console.log(socket.id, 'call', command_name);
      var command_context = Object.create(base_context);



      command_context.accept = function () {
        if (command_name in state.transitions) {
          // TODO multiple states
          var next_state_name = state.transitions[command_name];
          return enter_state(socket, next_state_name);
        };
      };
      command_context.reject = function (reason) {
        console.error(socket.id, command_name, 'rejected:', reason);
        socket.emit('reject', command_name, reason);
      };

      return command.apply(command_context, arguments);
    };

    enable_command(command_name, command_handler);
  });
};
