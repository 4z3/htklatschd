
function log(x) {
  var date = new Date();
  var H = date.getHours(), M = date.getMinutes();
  if (H < 10) H = "0" + H;
  if (M < 10) M = "0" + M;
  var log = $('#log');
  log.append(H + ':' + M + ' ' + x.toString() + '<br>');
  log.scrollTop(log[0].scrollHeight);
};

function log_err (message) {
  log('<span style="color:red">Error: ' + message + '</span>');
};

function log_stupid (message) {
  log('<span style="color:red">stupid ' + message + '</span>');
};

function log_info (message) {
  log('<span style="color:blue">' + message + '</span>');
};




$(function () {
  var socket = io.connect();
  var mynick;
  var insert_on_reject = false;
  var focus_on_reject = false;
  var select_on_reject = false;

  function handle_command(nick, content) {
    var match = /^\/([^ ]+)(?: +([^ ]+)(?: +([^ ]+.*))?)?$/.exec(content);
    if (match) switch (match[1]) {
      case 'nick':
        if (match[3]) {
          insert_on_reject = '/auth ' + match[2] + ' ';
          focus_on_reject = true;
          select_on_reject = false;
          socket.emit('nick/2', match[2], match[3]);
        } else {
          insert_on_reject = '/auth ';
          focus_on_reject = true;
          select_on_reject = false;
          socket.emit('nick/1', match[2]);
        };
        return true;
      case 'auth':
        if (nick) {
          insert_on_reject = '/auth ' + nick + ' ';
          focus_on_reject = true;
          select_on_reject = false;
          socket.emit('nick/2', nick, match[2]);
          return true;
        };
        // else fall through
      default:
        $('#message').val(content);
        $('#message').select();
        log_err('unknown command: ' + match[1]);
        return true;
    };
  };

  socket.on('kick', function (by, reason) {
    log_info('you have been kicked by ' + by + ' because ' + reason);
    // TODO $('#message').unbind('keydown');
    // TODO $('#message').bind('keydown', function (event) {
    // TODO   if (event.keyCode === 13) {
    // TODO     var nick = $('#message').val();
    // TODO     socket.emit('nick/1', nick);
    // TODO   };
    // TODO });
  });

  socket.on('onymous', function (nick) {
    mynick = nick;

    $('#message').val('').focus();
    //$('#password').remove();
    // $('#password-label').remove();

    $('#message').unbind();
    $('#message').bind('keydown', function (event) {
      if (event.keyCode === 13) {
        var message = $('#message');
        var content = message.val();
        message.val(''); // reset input field

        if (!handle_command(nick, content)) {
          insert_on_reject = content;
          focus_on_reject = true;
          select_on_reject = true;
          socket.emit('chat/1', content);
        };
      };
    });
  });

  socket.on('info', log_info);

  socket.on('say', function (nick, text) {
    if (nick === mynick) {
      log('<span style="color:green">' + nick + '</span>: ' + text);
    } else if (typeof mynick === 'string' && text.indexOf(mynick) >= 0) {
      log('<span style="color:orange">' + nick + '</span>: ' + text);
    } else {
      log(nick + ': ' + text);
    };
  });

  socket.on('reject', function (what, reason) {
    //console.error('rejected', what.toString() + ':', reason);
    if (insert_on_reject) {
      $('#message').val(insert_on_reject);
      insert_on_reject = null;
    };
    if (focus_on_reject) {
      $('#message').focus();
      focus_on_reject = null;
    };
    if (select_on_reject) {
      $('#message').select();
      select_on_reject = null;
    };
    log_err(reason);
  });

  socket.on('enter state', function (state_name) {
    switch (state_name) {
      case 'onymous':
        // TODO this is handled mainly by the 'onymous' event
        $('#prompt').html('You are known as <span id="nickname" style="color:green">' + mynick + '</span>.');
        break;
      case 'anonymous':
        $('#prompt').html('Enter a name to chat.');
        $('#message').unbind();
        $('#message').bind('keydown', function (event) {
          if (event.keyCode === 13) {
            var message = $('#message');
            var content = message.val();
            message.val(''); // reset input field
            if (!handle_command(null, content)) {
              insert_on_reject = content;
              focus_on_reject = true;
              select_on_reject = true;
              socket.emit('nick/1', content);
            };
          };
        });
        break;
      case 'authenticated':
        $('#prompt').html('You are authenticated as <span id="nickname" style="color:green">' + mynick + '</span>.');
        break;
      default:
        log_info('enter state: ' + state_name);
    };
  });

  socket.on('leave state', function (state_name) {
    switch (state_name) {
      case 'anonymous':
        log_info('you have joined as ' + mynick);
        break;
      default:
        log_info('leave state: ' + state_name);
    };
  });

  socket.on('update poll', function (poll_update) {
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
        var className = 'vote_' + alt;

        poll.find('.results').append(
          '<button class="' + className + '">???</button>'
        );

        $('#poll_'+ poll_update.id).find('.' + className).bind('click',
          function (event) {
            try {
              socket.emit('vote/2', poll_update.id, alt);
            } catch (e) {
              console.error(e);
            };
          }
        );
      });
      //poll.find('.results').append(innerHTML.join(', '));
    };
    poll.find('.topic').html(poll_update.topic);
    Object.keys(poll_update.results).forEach(function (alt) {
      poll.find('button.vote_'+alt).html(
        alt + ': ' + poll_update.results[alt]
      );
    });
  });
});

