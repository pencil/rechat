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

var keys = {};
// Track what keys are being pressed
$(document).keydown(function (e) {
  keys[e.which] = true;
  handleKeyPresses();
});
// Delete keys once they are not being pressed
$(document).keyup(function (e) {
  delete keys[e.which];
  handleKeyPresses();
});

// Do our application specific key handles
function handleKeyPresses() {
  // Check that we have the twitch ember app
  // Check that we are on the vod page route
  if(!window.Ember || !window.App || App.__container__.lookup("controller:application").get("currentRouteName") !== "vod") {
    return;
  }
  // esc to exit theatre mode
  // Note twitch handles the player exit
  if (keys[27]) {
    $('#player').addClass('dynamic-player');
  }
  // alt+t to toggle theatre mode
  // Note that twitch already handles the player toggle call
  if (keys[18] && keys[84]) {
    $('#player').toggleClass('dynamic-player');
  }
}

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