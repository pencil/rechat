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

$(document).keydown(function (e) {
  // Get the current key pressed
  var key = String.fromCharCode(event.which).toLowerCase();
  // alt+t to toggle theatre mode
  // Note that twitch already handles the player toggle call
  if ((e.altKey || e.metaKey) && key == 't') {
    $('#player').toggleClass('dynamic-player');
  }
  // esc to exit theatre mode
  // Note twitch handles the player exit
  if(e.keyCode == 27) {
    $('#player').addClass('dynamic-player');
  }
});

// This function handles the theatre mode button click
function handleTheatreMode() {
  // Check that we have the twitch ember app
  // Check that we are on the vod page route
  if(!window.Ember || !window.App || App.__container__.lookup("controller:application").get("currentRouteName") !== "vod") {
    return;
  }
  // Toggle our elements
  App.__container__.lookup('controller:channel').send('toggleTheatre');
  $('#player').toggleClass('dynamic-player');
}