
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
  window.io = io.connect('http://localhost:8529');

  io.on('stupid', log_stupid);

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
    // replace the input method
    $('#form').attr('onsubmit',
      $('#form').attr('onsubmit').replace('sendLogin','sendMessage')
    );
    log_info('You have joined as ' + nick);
    $('#prompt').html('You are known as <span style="color:green">' + nick + '</span>.');
  });
};


function sendLogin() {
  var message = $('#message');
  io.emit('join', message.val());
  message.val('');
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

