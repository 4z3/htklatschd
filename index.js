
var port = 8529;

var http = require('http'), 
    io = require('socket.io'),
    router = require('choreographer').router(),
    uuid = require('node-uuid'),
    fs = require('fs');

var server = http.createServer(router);

// Inform client about events without corresponding command to handle it.
(function () {
  var onClientMessage = io.Manager.prototype.onClientMessage;
  io.Manager.prototype.onClientMessage = function (id, packet) {
    // TODO bail out if users[id] does not exist
    var user = users[id];
    if (packet.type === 'event' && !(packet.name in user.capabilities)) {
      console.log(id, '[35;1munhandled', packet, '[m');
      user.socket.emit('unhandled', packet);
    } else {
      return onClientMessage.apply(this, arguments);
    };
  };
})();

// setup socket.io
io = io.listen(server);
io.set('log level', 1);

// logged-in users
var users = {};
var polls = JSON.parse(fs.readFileSync(__dirname + '/polls.json'));
var accounts = JSON.parse(fs.readFileSync(__dirname + '/accounts.json'));


server.listen(port, function () {
  console.log('running htklatchd at http://localhost:' + port);
});

function make_file_server(path, type) {
  var content;
  var mtime = new Date(0);
  function serve_content (res) {
    res.writeHeader(200, {
      'Content-Type': type,
      'Content-Length': content.length
    });
    res.end(content);
  };
  function internal_server_error (res, err) {
    console.error(
        'file_server(' + JSON.stringify(path) + '):', err.stack);
    var type = 'text/plain';
    var content = 'Internal Server Error while serving: ' + path;
    res.writeHeader(500, {
      'Content-Type': type,
      'Content-Length': content.length
    });
    res.end(content);
  };
  return function (req, res) {
    var filename = [__dirname, path].join('/');
    fs.stat(filename, function (err, stats) {
      if (err) {
        internal_server_error(res, err);
      } else if (stats.mtime > mtime) {
        console.log('reload file:', filename);
        fs.readFile(filename, function (err, data) {
          if (err) {
            internal_server_error(res, err);
          } else {
            content = data;
            mtime = stats.mtime;
            serve_content(res);
          };
        });
      } else {
        serve_content(res);
      };
    });
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
    services: [ 'push-chat/2', 'push-poll/1' ],
    commands: [ 'nick/1', 'nick/2', 'disconnect' ],
    transitions: {
      'nick/1': 'onymous',
      'nick/2': 'authenticated',
      'disconnect': 'null'
    }
  },
  'onymous': {
    services: [ 'push-chat/2', 'push-poll/1' ],
    commands: [ 'nick/1', 'nick/2', 'chat/1', 'disconnect' ],
    transitions: {
      'nick/2': 'authenticated',
      'disconnect': 'null'
    }
  },
  'authenticated': {
    onleave: 'reset-authentication',
    services: [ 'push-chat/2', 'push-poll/1' ],
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
  this.socket.account = accounts[nick];
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
  if (!this.socket.account) {
    text = '<span style="color:gray">' + text + '</span>';
  };

  call_service('push-chat/2', this.socket.nick, text);

  return this.accept();
};

commands['vote/2'] = function (poll_id, decision) {
  if (!(poll_id in polls)) {
    console.log(this.socket.id, 'voted ', decision, 'for non-existent poll_id:', poll_id);
    this.socket.emit('stupid', 'vote: inexistent poll_id ' + JSON.stringify(poll_id));
  } else {
    var poll = polls[poll_id];
    var account = this.socket.account;
    if (!('votes' in account)) {
      account.votes = {};
    };
    var votes = account.votes;
    if (decision in poll.results) {
      if (poll_id in votes) {
        console.log(this.socket.id, 'remove old vote on poll ' + poll_id);
        var vote = votes[poll_id];
        poll.results[vote]--;
      };
      console.log(this.socket.id, 'vote ' + decision + ' on poll ' + poll_id);
      var vote = votes[poll_id] = decision;
      poll.results[vote]++;

      // persist polls and accounts
      [
      , { filename: __dirname + '/polls.json', data: polls },
      , { filename: __dirname + '/accounts.json', data: accounts }
      ].forEach(function (x) {
        var filename = x.filename;
        var content = JSON.stringify(x.data, null, 2);
        fs.writeFile(filename, content, function (err) {
          if (err) {
            console.error(err.stack); // what now?
          } else {
            console.log('wrote', filename);
          };
        });
      });

      call_service('push-poll/1', poll);
    } else {
      this.socket.emit('stupid', 'invalid vote: ' + decision);
    };
  };
};


actions['reset-nick'] = function () {
  delete nicks[this.socket.nick];
  delete this.socket.nick;
};

actions['reset-authentication'] = function () {
  delete this.socket.account;
};

services['push-chat/2'] = function (nick, text) {
  this.socket.emit('say', nick, text);
};

services['push-poll/1'] = function (poll) {
  this.socket.emit('update poll', poll);
};


function subscribe_to(service_name, context) {
  var service = services[service_name];
  // TODO die if service does not exist
  if (!service.subscribers) {
    service.subscribers = {};
  };
  // TODO die if already subscribed
  console.log(context.socket.id, 'subscribe to', service_name);
  service.subscribers[context.socket.id] = context;

  if (!context.subscribed_services) {
    context.subscribed_services = {};
  };
  context.subscribed_services[service_name] = service;
};

function unsubscribe_from(service_name, context) {
  var service = services[service_name];
  // TODO die if service does not exist
  if (!service.subscribers) {
    service.subscribers = {};
  };
  // TODO die if not subscribed
  console.log(context.socket.id, 'unsubscribe from', service_name);
  delete service.subscribers[context.socket.id];

  if (!context.subscribed_services) {
    context.subscribed_services = {};
  };
  delete context.subscribed_services[service_name];
};
function unsubscribe_from_all(context) {
  if (context.subscribed_services) {
    Object.keys(context.subscribed_services).forEach(function (service_name) {
      unsubscribe_from(service_name, context);
    });
  };
};

function call_service(service_name) {
  var args = Array.prototype.slice.call(arguments, 1);
  var service = services[service_name];
  // TODO die if service does not exist
  Object.keys(service.subscribers).forEach(function (id) {
    var context = service.subscribers[id];
    return service.apply(context, args);
  });
};

io.sockets.on('connection', function (socket) {

  // TODO bail out, if it already exists
  users[socket.id] = {
    socket: socket,
    capabilities: []
  };

  socket.on('disconnect', function () {
    delete users[socket.id];
  });

  // TODO initialize base_context here...

  enter_state(socket, initial_state);

  // TODO this has do be done nicer...
  var temp_context = {
    socket: socket
  };
  Object.keys(polls).forEach(function (id) {
    var poll = polls[id];
    services['push-poll/1'].call(temp_context, poll);
  });
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

  var user = users[socket.id];

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

  var enabled_commands = [];
  function enable_command(name, handler) {
    console.log(socket.id, 'enable command:', name);
    enabled_commands.push(Array.prototype.slice.apply(arguments));
    socket.on(name, handler);
    user.capabilities[name] = true;
  };
  function disable_all_commands() {
    while (enabled_commands.length > 0) {
      var enabled_command = enabled_commands.pop();
      var command_name = enabled_command[0];
      var command_handler = enabled_command[1];
      socket.removeListener(command_name, command_handler);
      console.log(socket.id, 'disable command:', command_name);
      delete user.capabilities[command_name];
    };
  };

  socket.leave_this_state = function () {
    disable_all_commands();
    unsubscribe_from_all(base_context);
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

  state.services.forEach(function (service_name) {
    subscribe_to(service_name, base_context);
  });

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
