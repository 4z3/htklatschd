
function log(x) {
  var date = new Date();
  var H = date.getHours(), M = date.getMinutes();
  if (H < 10) H = "0" + H;
  if (M < 10) M = "0" + M;
  var log = $('#log');
  log.append(H + ':' + M + ' ' + x.toString() + '<br>');
  log.scrollTop(log[0].scrollHeight);
};

function log_stupid (message) {
  log('<span style="color:red">stupid ' + message + '</span>');
};

function log_info (message) {
  log('<span style="color:blue">' + message + '</span>');
};



window.onload = function () {
  window.io = io.connect();
  window.poll = 123;

  $('#message').bind('keydown', make_onReturn(sendLogin));

  io.on('stupid', log_stupid);

  io.on('password required', function (nick) {

    // clear input fields
    if ($('#password').length > 0) {
      $('#password').remove();
      $('#password-label').remove();

      //$('#message').val('').focus();
      //$('#message').unbind();
      //$('#message').bind('keydown', make_onReturn(sendMessage));
    };


    var form = $('#form');
    form.append('<input name="password" type="password" id="password" autofocus="true">');
    form.append('<label id="password-label" for="password">Enter password to login!</label>');

    $('#password').bind('keydown', make_onReturn(sendLogin));
  });

  io.on('say', function (nick, message) {
    log(nick + ': ' + message);
  });
  io.on('you say', function (nick, message) {
    log('<span style="color:green">' + nick + '</span>: ' + message);
  });

  io.on('nick', function (oldnick, newnick) {
    log_info(oldnick + ' is now known as ' + newnick);
  });
  io.on('you nick', function (nick) {
    log_info('You are now known as ' + nick);
    $('#prompt').html('You are known as <span style="color:green">' + nick + '</span>.');
  });

  io.on('join', function (newnick) {
    log_info(newnick + ' has joined');
  });

  io.on('part', function (oldnick) {
    log_info(oldnick + ' has left');
  });

  io.on('names', function (names) {
    log_info('Users: ' + names.join(', '));
  });

  io.on('you join', function (nick) {

    $('#message').val('').focus();
    $('#password').remove();
    $('#password-label').remove();

    $('#message').unbind();
    $('#message').bind('keydown', make_onReturn(sendMessage));

    log_info('You have joined as ' + nick);
    $('#prompt').html('You are known as <span style="color:green">' + nick + '</span>.');
  });

  io.on('poll update', function (poll_update) {
    var polls = $('#polls');
    var poll = polls.find('#poll_' + poll_update.id);
    if (poll.length === 0) {
      polls.append(
        '<div id="poll_' + poll_update.id + '">'
        + '<span class="topic"></span>'
        + '<span class="results"></span>'
        + '</div>');
      poll = polls.find('#poll_' + poll_update.id);
      var innerHTML = [];
      Object.keys(poll_update.results).forEach(function (alt) {
        innerHTML.push(
          '<button onclick="try{sendVote(\''+alt+'\')}catch(e){console.error(e)}">'+alt+'</button>: '
          + '<span class="vote_' + alt +'"></span>'
          + '</span>'
        );
      });
      poll.find('.results').append(innerHTML.join(', '));
    };
    poll.find('.topic').html(poll_update.topic);
    Object.keys(poll_update.results).forEach(function (alt) {
      poll.find('.vote_'+alt).html(poll_update.results[alt]);
    });
  });
};


function make_onReturn(callback) {
  return function (event) {
    try {
      if (event.keyCode === 13) {
        var args = Array.prototype.slice.call(arguments, 1);
        callback.apply(this, args);
      };
    } catch(e) {
      console.error(e)
    };
  };
};

function sendLogin() {
  var username_element = $('#message');
  var password_element = $('#password');

  var username = username_element.val();
  if (password_element.length > 0) {
    var password = password_element.val();
  };

  io.emit('join', username, password);
};

function sendMessage() {
  var message = $('#message');
  var content = message.val();
  message.val(''); // reset input field
  var match = /^\/([^ ]+)(?: +(.*))?$/.exec(content);

  if (match) {
    if (match[1] === 'query') {
      var match = /^\/(?:[^ ]+)(?: +([^ ]+))(?: +(.*))$/.exec(content);
      var to = match[1];
      var text = match[2];
      io.emit('query', to, text);
      return;
    };

    io.emit(match[1], match[2]);
  } else {
    io.emit('say', content);
  };
};

function sendVote(decision) {
  io.emit('vote', poll, decision);
};

