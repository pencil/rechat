var ReChat = {
  // Settings:
  searchBaseUrl: 'http://search.rechat.org/channels/',
  cacheExhaustionLimit: 100,
  chatDisplayLimit: 1000,

  loadMessages: function(recievedAfter, callback) {
    // Check if valid ISOString, else return
    if(typeof(recievedAfter.toISOString) != "function") {
      console.info('Invalid ISO String re-trying in 5 seconds...');
      setTimeout(function() {
        ReChat.loadMessages(ReChat.currentAbsoluteVideoTime(), callback);
      }, 5000);
      return;
    }
    // Ping server for request
    $.get(ReChat.searchBaseUrl + ReChat.channelName, { "after": recievedAfter.toISOString(), "until": ReChat.endsAt.toISOString() }, callback).fail(function() {
      // request failed, let's try again in 5 seconds
      setTimeout(function() {
        ReChat.loadMessages(recievedAfter, callback);
      }, 5000);
    });
  },

  currentVideoTime: function() {
    return parseInt($('body').attr('rechat-video-time')) || 0;
  },

  currentAbsoluteVideoTime: function() {
    return new Date(+ReChat.recordedAt + ReChat.currentVideoTime() * 1000);
  },

  autoPopulateCache: function(dropExistingCache) {
    var newestMessageDate = ReChat._newestMessageDate || ReChat.currentAbsoluteVideoTime(),
        populationId = new Date();
    if (ReChat._messageStreamEndAt && newestMessageDate >= ReChat._messageStreamEndAt) {
      console.info('No more messages available, aborting...');
      return;
    }
    ReChat._cachePopulationId = populationId;
    ReChat.loadMessages(newestMessageDate, function(result) {
      if (populationId != ReChat._cachePopulationId) {
        console.info('Population ID changed, lock expired, aborting...');
        return;
      }
      if (!result.hits.total) {
        ReChat._messageStreamEndAt = newestMessageDate;
      } else {
        var hits = result.hits.hits,
            newestMessage = hits[hits.length - 1];
        ReChat._newestMessageDate = Date.parse(newestMessage._source.recieved_at);
        if (result.hits.total == hits.length) {
          ReChat._messageStreamEndAt = ReChat._newestMessageDate;
        }
        if (dropExistingCache) {
          ReChat._cachedMessages = hits;
        } else {
          Array.prototype.push.apply(ReChat._cachedMessages, hits);
        }
      }
    });
  },

  showStatusMessage: function(message, statusImage) {
    if (!statusImage) {
      statusImage = 'spinner.gif';
    }
    ReChat._statusMessageContainer.css('background-image', 'url(' + chrome.extension.getURL('images/' + statusImage) + ')');
    ReChat._chatMessageContainer.empty();
    ReChat._statusMessageContainer.text(message);
    ReChat._statusMessageContainer.show();
  },

  hideStatusMessage: function() {
    ReChat._statusMessageContainer.hide();
  },


  scrolledToBottom: function() {
    return Math.abs(ReChat._chatMessageContainer[0].scrollHeight - ReChat._chatMessageContainer.scrollTop() - ReChat._chatMessageContainer.outerHeight()) <= 30;
  },

  scrollToBottom: function() {
    ReChat._chatMessageContainer.scrollTop(ReChat._chatMessageContainer[0].scrollHeight);
  },

  replay: function() {
    var currentVideoTime = ReChat.currentVideoTime(),
        currentAbsoluteVideoTime = ReChat.currentAbsoluteVideoTime(),
        previousVideoTime = ReChat._previousVideoTime;
    if (typeof previousVideoTime == 'undefined') {
      // first invocation => populate cache
      ReChat.showStatusMessage('Loading messages...');
      console.info('First invocation, populating cache for the first time');
      ReChat.autoPopulateCache(true);
    } else if (previousVideoTime > currentVideoTime || currentVideoTime - previousVideoTime > 30) {
      console.info('Time jumped, discarding cache and starting over');
      ReChat.showStatusMessage('Loading messages...');
      ReChat._newestMessageDate = null;
      ReChat._cachedMessages = [];
      ReChat.autoPopulateCache(true);
    } else if (currentAbsoluteVideoTime >= ReChat._messageStreamEndAt) {
      if (ReChat._chatMessageContainer.is(':empty')) {
        ReChat.showStatusMessage('Sorry, no chat messages for this VOD available', 'sad.png');
      }
    } else if (!ReChat._cachedMessages.length) {
      console.info('Cache is empty, waiting for population...');
    } else {
      if (ReChat._cachedMessages.length >= ReChat.cacheExhaustionLimit) {
        ReChat._cacheExchaustionHandled = false;
      }
      ReChat.hideStatusMessage();
      while (ReChat._cachedMessages.length) {
        var message = ReChat._cachedMessages[0],
            messageData = message._source,
            messageDate = new Date(Date.parse(messageData.recieved_at));
        if (messageDate <= currentAbsoluteVideoTime) {
          ReChat._cachedMessages.shift();
          var atBottom = ReChat.scrolledToBottom();
          ReChat._chatMessageContainer.append(ReChat.formatChatMessage(messageData));
          if (atBottom) {
            ReChat.scrollToBottom();
          }
        } else {
          if (ReChat._chatMessageContainer.is(':empty')) {
            var secondsToFirstMessage = Math.floor(messageDate.getTime() / 1000 - currentAbsoluteVideoTime.getTime() / 1000);
            if (secondsToFirstMessage > 0) {
              var minutesToFirstMessage = Math.floor(secondsToFirstMessage / 60);
              secondsToFirstMessage -= minutesToFirstMessage * 60;
              secondsToFirstMessage = secondsToFirstMessage < 10 ? '0' + secondsToFirstMessage : secondsToFirstMessage;
              ReChat.showStatusMessage('First recorded message will show up in ' + minutesToFirstMessage + ':' + secondsToFirstMessage);
            }
          }
          break;
        }
      }

      var numberOfChatMessagesDisplayed = ReChat._chatMessageContainer.find('.chat-line').length;
      if (numberOfChatMessagesDisplayed >= ReChat.chatDisplayLimit) {
        ReChat._chatMessageContainer.find('.chat-line:lt(' + Math.max(numberOfChatMessagesDisplayed - ReChat.chatDisplayLimit, 10) + ')').remove();
      }

      if (!ReChat._cacheExchaustionHandled && ReChat._cachedMessages.length < ReChat.cacheExhaustionLimit) {
        ReChat._cacheExchaustionHandled = true;
        ReChat.autoPopulateCache();
      }
    }
    ReChat._previousVideoTime = currentVideoTime;
    setTimeout(ReChat.replay, 200);
  },

  colorForNickname: function(nickname) {
    var hash = 0, i, chr, len;
    if (nickname.length == 0) return hash;
    for (i = 0, len = nickname.length; i < len; i++) {
      chr   = nickname.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    hash = Math.abs(hash);
    return ReChat._nicknameColors[hash % (ReChat._nicknameColors.length - 1)];
  },

  replaceEmoticons: function(text) {
    $.each(ReChat._emoticons, function(i, emoticon) {
      text = text.replace(emoticon.regex, emoticon.code);
    });
    return text;
  },

  formatChatMessage: function(messageData) {
    var line = $('<div>').addClass('chat-line'),
        indicator = $('<div>').addClass('indicator'),
        badges = $('<span>').addClass('badges'),
        from = $('<span>').addClass('from').css('color', ReChat.colorForNickname(messageData.from)),
        colon = $('<span>').addClass('colon'),
        message = $('<span>').addClass('message');
    from.text(messageData.from);
    colon.text(':');
    message.text(messageData.message);
    message.html(ReChat.replaceEmoticons(message.html()));
    line.append(indicator).append(' ').append(badges).append(from).append(colon).append(' ').append(message);
    return line;
  },

  prepareInterface: function() {
    var rightColumnContent = $('div#right_col > div.content'),
        top = rightColumnContent.find('div.top'),
        archives = rightColumnContent.find('#archives');
    if (!rightColumnContent.length || !top.length || !archives.length) {
      throw "ReChat is not compatible with this Twitch layout";
    }
    var ul = $('<ul>').addClass('tabs').attr('id', 'right_nav'),
        divChat = $('<div>').addClass('stretch').attr('id', 'chat').css({ 'top': 0, 'bottom': 0 }),
        divEmberChat = $('<div>').addClass('ember-chat'),
        divChatRoom = $('<div>').addClass('chat-room'),
        divChatMessages = $('<div>').addClass('scroll chat-messages').css({ 'padding': '0 5px 0 20px','bottom': 0, 'overflow-y': 'scroll', 'overflow-x': 'hidden' }),
        divStatusMessage = $('<div>').css({ 'position': 'relative', 'top': '50px', 'text-align': 'center', 'background-repeat': 'no-repeat', 'background-position': 'center top', 'background-size': '40px 40px', 'padding': '60px 20px' });
        liChat = $('<li>'),
        liArchives = $('<li>').addClass('selected'),
        aChat = $('<a>Chat</a>'),
        aArchives = $('<a>Archive</a>');
    function switchTab(li, content) {
      ul.find('li.selected').removeClass('selected');
      divChat.hide();
      archives.hide();
      li.addClass('selected');
      content.show();
    }
    aChat.on('click', function() {
      switchTab(liChat, divChat);
    });
    aArchives.on('click', function() {
      switchTab(liArchives, archives);
    });
    liChat.append(aChat);
    liArchives.append(aArchives);
    ul.append(liChat).append(liArchives);
    top.append(ul);
    top.css('z-index', 100);
    divChatRoom.append(divChatMessages);
    divChatRoom.append(divStatusMessage);
    divEmberChat.append(divChatRoom);
    divChat.append(divEmberChat);
    rightColumnContent.append(divChat);
    archives.css('top', '51px');
    aChat.click();
    ReChat._chatMessageContainer = divChatMessages;
    ReChat._statusMessageContainer = divStatusMessage;
  },

  prepareRandomColors: function() {
    ReChat._nicknameColors = Please.make_color({ colors_returned: 50, saturation: 0.7 });
  },

  loadEmoticons: function() {
    ReChat._emoticons = [];
    $.get('https://api.twitch.tv/kraken/chat/emoticons', function(result) {
      $.each(result.emoticons, function(i, emoticon) {
        var image = emoticon.images[0];
        ReChat._emoticons.push({
          regex: new RegExp(emoticon.regex, 'g'),
          code: $('<span>').addClass('emoticon').css({ 'background-image': 'url(' + image.url + ')', 'height': image.height, 'width': image.width, 'margin-top': '-6px' }).prop('outerHTML')
        });
      });
    });
  },

  start: function() {
    ReChat._cachedMessages = [];
    ReChat.prepareInterface();
    ReChat.prepareRandomColors();
    ReChat.loadEmoticons();
    ReChat.replay();
  }
}
$(document).ready(function() {
  if (window.top !== window) {
    return;
  }
  var ogVideoTag = $('meta[property="og:video"]');
  if (ogVideoTag.length) {
    var videoUrl = ogVideoTag.attr('content'),
        videoIdRegex = /videoId=([a-z0-9]+)/,
        match = videoIdRegex.exec(videoUrl);
    if (match != null) {
      var videoId = match[1];
      $.get('https://api.twitch.tv/kraken/videos/' + videoId, function(result) {
        var recordedAt = new Date(Date.parse(result.recorded_at)),
            recordingDuration = result.length,
            endsAt = new Date(+recordedAt + recordingDuration * 1000),
            channelName = result.channel.name;
        ReChat.recordedAt = recordedAt;
        ReChat.endsAt = endsAt;
        ReChat.channelName = channelName;
        ReChat.start();
      });

      // Inject script to extract video time
      var script = document.createElement('script');
      script.src = chrome.extension.getURL('js/injected.js');
      document.documentElement.appendChild(script);
    }
  }
});
