(function() {
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
})();
