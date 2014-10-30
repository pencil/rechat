(function() {
  var player = $('div#player object');
  if (player.length) {
    setInterval(function() {
      if(player[0].getVideoTime) {
        $('body').attr('rechat-video-time', player[0].getVideoTime());
      }
    }, 200);
  }
})();
