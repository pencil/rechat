(function() {
  var player = Twitch && Twitch.player ? Twitch.player.getPlayer() : false;
  if (player) {
    setInterval(function() {
      $('body').attr('rechat-video-time', player.getVideoTime());
    }, 200);
  }
})();
