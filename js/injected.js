(function() {
  var player = Twitch && Twitch.player ? Twitch.player.getPlayer() : false;
  if (player) {
    setInterval(function() {
      // Check if function is defined
      if(typeof(player.getVideoTime) == "function") {
        $('body').attr('rechat-video-time', player.getVideoTime());
      }
    }, 200);
  }
})();
