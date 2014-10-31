var ReChat = {
  // Settings:
  searchBaseUrl: 'http://search.rechat.org/videos/',
  cacheExhaustionLimit: 100,
  chatDisplayLimit: 1000,
  loadingDelay: 5000,

  Browser: {
    Safari: 0,
    Chrome: 1,
    Firefox: 2
  },

  currentBrowser: function() {
    if(typeof(safari) !== 'undefined') {
      return ReChat.Browser.Safari;
    } else if(typeof(chrome) !== 'undefined') {
      return ReChat.Browser.Chrome;
    } else if(typeof(self.on) === 'function') {
      return ReChat.Browser.Firefox;
    } else {
      throw 'ReChat is not compatible with this browser';
    }
  },

  getExtensionResourcePath: function (path) {
    switch(ReChat.currentBrowser()) {
      case ReChat.Browser.Safari:
        return safari.extension.baseURI + path;
      case ReChat.Browser.Chrome:
        return chrome.extension.getURL(path);
      case ReChat.Browser.Firefox:
        return self.options[path];
    }
    return null;
  },

  randomUUID: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0,
          v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  get: function(path, params, success, failure) {
    switch(ReChat.currentBrowser()) {
      case ReChat.Browser.Safari:
        var uuid = ReChat.randomUUID(),
            handler = function(event) {
              if(event.name == uuid) {
                safari.self.removeEventListener('message', handler);
                if(event.message == 'error') {
                  failure && failure();
                } else {
                  success(event.message);
                }
              }
            };
        safari.self.addEventListener('message', handler);
        safari.self.tab.dispatchMessage(uuid, {
          type: 'GETRequest',
          url: path,
          params: params
        });
        break;
      case ReChat.Browser.Chrome:
      case ReChat.Browser.Firefox:
        var jqxhr = $.get(path, params, success);
        if(failure) {
          jqxhr.fail(failure);
        }
        break;
    }
    return null;
  },

  loadMessages: function(recievedAfter, callback) {
    ReChat.get(ReChat.searchBaseUrl + ReChat.videoId,
               { 'after': recievedAfter.toISOString() },
               callback,
               function() {
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
    var loadingFunction = function() {
      console.info('Loading messages from the server');
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
          ReChat._newestMessageDate = new Date(newestMessage._source.recieved_at);
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
    };

    if (dropExistingCache) {
      if (ReChat._loadingTimeout) {
        clearTimeout(ReChat._loadingTimeout);
      }
      ReChat._loadingTimeout = setTimeout(loadingFunction, ReChat.loadingDelay);
    } else {
      loadingFunction();
    }
  },

  showStatusMessage: function(message, statusImage) {
    if (!statusImage) {
      statusImage = 'spinner.gif';
    }
    ReChat._statusMessageContainer.css('background-image', 'url(' + ReChat.getExtensionResourcePath('res/' + statusImage) + ')');
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
    } else if (previousVideoTime > currentVideoTime || currentVideoTime - previousVideoTime > 60) {
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
        ReChat._cacheExhaustionHandled = false;
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

      var numberOfChatMessagesDisplayed = ReChat._chatMessageContainer.find('.rechat-chat-line').length;
      if (numberOfChatMessagesDisplayed >= ReChat.chatDisplayLimit) {
        ReChat._chatMessageContainer.find('.rechat-chat-line:lt(' + Math.max(numberOfChatMessagesDisplayed - ReChat.chatDisplayLimit, 10) + ')').remove();
      }

      if (!ReChat._cacheExhaustionHandled && ReChat._cachedMessages.length < ReChat.cacheExhaustionLimit) {
        ReChat._cacheExhaustionHandled = true;
        ReChat.autoPopulateCache();
      }
    }
    ReChat._previousVideoTime = currentVideoTime;
    if (!ReChat._stopped) {
      setTimeout(ReChat.replay, 200);
    }
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
    var line = $('<div>').css('padding', '4px').addClass('rechat-chat-line'),
        from = $('<span>').addClass('from').css({
          color: ReChat.colorForNickname(messageData.from),
          'font-weight': 'bold'
        }),
        colon = $('<span>').addClass('colon'),
        message = $('<span>').addClass('message');
    from.text(messageData.from);
    colon.text(':');
    message.text(messageData.message);
    message.html(ReChat.replaceEmoticons(message.html()));
    line.append(from).append(colon).append(' ').append(message);
    return line;
  },

  prepareInterface: function() {
    var container = $('<div>');
    container.css({
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '339px',
      'z-index': 4,
      background: '#f2f2f2'
    });
    container.addClass('rightcol-content');
    var statusMessage = $('<div>').css({ 'position': 'relative', 'top': '50px', 'text-align': 'center', 'background-repeat': 'no-repeat', 'background-position': 'center top', 'background-size': '40px 40px', 'padding': '60px 20px' });
    ReChat._statusMessageContainer = statusMessage;
    container.append(statusMessage);

    var chatMessages = $('<div>');
    chatMessages.css({
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      left: 0,
      width: 'auto',
      height: 'auto',
      'overflow-x': 'hidden',
      'overflow-y': 'auto'
    });
    container.append(chatMessages);
    ReChat._chatMessageContainer = chatMessages;

    ReChat._container = container;
    $('body').append(container);

    $('#right_close').click(function() {
      if (!$(this).hasClass('closed')) {
        container.hide();
      } else {
        container.show();
      }
    });
  },

  prepareRandomColors: function() {
    ReChat._nicknameColors = Please.make_color({ colors_returned: 50, saturation: 0.7 });
  },

  loadEmoticons: function() {
    ReChat._emoticons = [];
    ReChat.get('https://api.twitch.tv/kraken/chat/emoticons', {}, function(result) {
      $.each(result.emoticons, function(i, emoticon) {
        var image = emoticon.images[0];
        if (image.emoticon_set === null) {
          ReChat._emoticons.push({
            regex: new RegExp(emoticon.regex, 'g'),
            code: $('<span>').addClass('emoticon').css({ 'background-image': 'url(' + image.url + ')', 'height': image.height, 'width': image.width }).prop('outerHTML').replace(/&quot;/g, "'")
          });
        }
      });
    });
  },

  start: function() {
    ReChat._stopped = false;
    ReChat._cachedMessages = [];
    ReChat.prepareInterface();
    ReChat.prepareRandomColors();
    ReChat.loadEmoticons();
    ReChat.replay();
  },

  stop: function() {
    ReChat._stopped = true;
    if (ReChat._loadingTimeout) {
      clearTimeout(ReChat._loadingTimeout);
    }
    if (ReChat._container) {
      ReChat._container.empty();
      ReChat._container.remove();
    }
    ReChat._previousVideoTime = undefined;
    ReChat._cachePopulationId = undefined;
    ReChat._newestMessageDate = undefined;
    ReChat._messageStreamEndAt = undefined;
  }
}

$(document).ready(function() {
  if (window.top !== window) {
    return;
  }
  var lastUrl = false;
  // TODO: find a better solution for this...
  setInterval(function() {
    var currentUrl = document.location.href;
    if (lastUrl === false) {
      var ogVideoTag = $('meta[property="og:video"]');
      if (ogVideoTag.length && $('div.archives-contain').length && $('div#player object').length) {
        var videoUrl = ogVideoTag.attr('content'),
            videoIdRegex = /videoId=([a-z0-9]+)/,
            match = videoIdRegex.exec(videoUrl);
        if (match != null) {
          var videoId = match[1];
          ReChat.get('https://api.twitch.tv/kraken/videos/' + videoId, {}, function(result) {
            if (currentUrl != document.location.href) {
              return;
            }
            var recordedAt = new Date(Date.parse(result.recorded_at));
            ReChat.videoId = videoId;
            ReChat.recordedAt = recordedAt;
            console.info('ReChat: start');
            ReChat.start();
          });

          // Inject script to extract video time
          var script = document.createElement('script');
          script.src = ReChat.getExtensionResourcePath('js/injected.js');
          document.documentElement.appendChild(script);
        }
      }
      lastUrl = currentUrl;
    } else if(lastUrl != currentUrl) {
      console.info('ReChat: stop');
      ReChat.stop();
      lastUrl = false;
    }
  }, 1000);
});
