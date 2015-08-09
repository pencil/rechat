(function(w, d) {
  var player = $('div#player object');
  if (player.length) {
    var closer = $('#right_close');
    if (closer.hasClass('closed')) {
      closer.click();
    }
    setInterval(function() {
      if(player[0].getVideoTime) {
        $('body').attr('rechat-video-time', player[0].getVideoTime());
      }
    }, 200);
  }

  if (!w.ReChat) {
    w.ReChat = {};
  }

  w.ReChat.keyListenerRegistered || $(d).keydown(function (e) {
    // Get the current key pressed
    var key = String.fromCharCode(e.which).toLowerCase();
    // alt+t to toggle theatre mode
    // Note that twitch already handles the player toggle call
    if (e.altKey && key == 't') {
      $('#player').toggleClass('dynamic-player');
    }
    // esc to exit theatre mode
    // Note twitch handles the player exit
    if(e.keyCode == 27) {
      $('#player').addClass('dynamic-player');
    }
  });
  w.ReChat.keyListenerRegistered = true;

  // This function handles the theatre mode button click
  w.ReChat.handleTheatreMode = function() {
    if(!w.Ember || !w.App || App.__container__.lookup('controller:application').get('currentRouteName') !== 'vod') {
      return;
    }
    App.__container__.lookup('controller:channel').send('toggleTheatre');
    $('#player').toggleClass('dynamic-player');
  }
})(window, document);

