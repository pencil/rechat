(function(w, d) {
  var playerContainer = $('div#player');
  if (playerContainer.length) {
    var closer = $('#right_close');
    if (closer.hasClass('closed')) {
      closer.click();
    }

    var player = playerContainer.find('object');
    if (player.length) {
      player = player.get(0);
      setInterval(function() {
        if(player.getVideoTime) {
          $('body').attr('rechat-video-time', player.getVideoTime());
        }
      }, 200);
    } else {
      player = playerContainer.find('video');
      if (player.length) {
        player = player.get(0);
        setInterval(function() {
          if(player.currentTime) {
            $('body').attr('rechat-video-time', player.currentTime);
          }
        }, 200);
      }
    }
  }
})(window, document);

