
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

  $('#message').bind('keydown', function (event) {
    if (event.keyCode === 13) {
      var nick = $('#message').val();
      socket.emit('nick/1', nick);
    };
  });

  socket.on('onymous', function (nick) {
    mynick = nick;

    $('#message').val('').focus();
    //$('#password').remove();
    // $('#password-label').remove();

    $('#prompt').html('You are known as <span id="nickname" style="color:green">' + nick + '</span>.');

    $('#message').unbind();
    $('#message').bind('keydown', function (event) {
      if (event.keyCode === 13) {
        var message = $('#message');
        var content = message.val();
        message.val(''); // reset input field

        // parse commands
        var match = /^\/([^ ]+)(?: +(.*))?$/.exec(content);

        if (match) switch (match[1]) {
          case 'nick':
            socket.emit('nick/1', match[2]);
            break;
          case 'auth':
            socket.emit('nick/2', nick, match[2]);
            break;
          default:
            message.val(content);
            $('#message').select();
            log_err('unknown command: ' + match[1]);
            break;
        } else {
          socket.emit('chat/1', content);
        };
      };
    });

    log_info('you have joined as ' + nick);
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
    switch (what) {
      case 'nick/1':
        $('#message').select();
        break;
      case 'nick/2':
        $('#message').val('/auth ');
        $('#message').focus();
        break;
    };
    log_err(reason);
  });
});
