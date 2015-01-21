var ReChat = {
  // Settings:
  searchBaseUrl: 'http://search.rechat.org/videos/',
  cacheExhaustionLimit: 100,
  chatDisplayLimit: 1000,
  loadingDelay: 5000,
  nicknameColors: Please.make_color({ colors_returned: 50, saturation: 0.7 }),
  defaultStreamDelay: 17,

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
                if(!event.message || event.message.error) {
                  failure && failure(event.message);
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

};

ReChat.Playback = function(videoId, recordedAt) {
  this.videoId = videoId;
  this.recordedAt = recordedAt;
  this.streamDelay = ReChat.defaultStreamDelay;
};

ReChat.Playback.prototype._prepareInterface = function() {
  var container = $('<div>').css({
    'position': 'absolute',
    'right': 0,
    'top': 0,
    'bottom': 0,
    'width': '339px',
    'z-index': 4,
    'background-color': '#f2f2f2'
  }).addClass('rightcol-content');

  var statusMessage = $('<div>').css({
    'position': 'relative',
    'top': '50px',
    'text-align': 'center',
    'background-repeat': 'no-repeat',
    'background-position': 'center top',
    'background-size': '40px 40px',
    'padding': '60px 20px'
  });
  container.append(statusMessage);
  this._statusMessageContainer = statusMessage;

  var chatMessages = $('<div>').css({
    'position': 'absolute',
    'right': 0,
    'top': 0,
    'bottom': 0,
    'left': 0,
    'width': 'auto',
    'height': 'auto',
    'overflow-x': 'hidden',
    'overflow-y': 'auto'
  });
  container.append(chatMessages);
  this._chatMessageContainer = chatMessages;

  this._container = container;
  $('body').append(container);

  var rightCol = $('#right_col'),
      resizeCallback = function(mutations) {
        var styleChanged = false;
        if (mutations) {
          mutations.forEach(function(mutation) {
            styleChanged = styleChanged ||
              (mutation.attributeName == 'style' && mutation.oldValue != rightCol.attr('style')) ||
              (mutation.attributeName == 'class' && mutation.oldValue != rightCol.attr('class'));
          });
        } else {
          styleChanged = true;
        }
        if (styleChanged) {
          if (rightCol.is(':visible')) {
            container.show();
            container.width(rightCol.width() - 1);
          } else {
            container.hide();
          }
        }
      };
  resizeCallback();
  this._observer = new MutationObserver(resizeCallback);
  this._observer.observe(rightCol[0], { subtree: false, attributes: true, attributeOldValue: true });
};

ReChat.Playback.prototype._loadEmoticons = function() {
  var that = this;
  this._emoticons = [];
  ReChat.get('https://api.twitch.tv/kraken/chat/emoticons', {}, function(result) {
    if (typeof(result) === 'string' && typeof(JSON) !== 'undefined') {
      try {
        result = JSON.parse(result);
      } catch(e) {}
    }
    $.each(result.emoticons, function(i, emoticon) {
      var image = emoticon.images[0];
      if (image.emoticon_set === null) {
        that._emoticons.push({
          regex: new RegExp(emoticon.regex, 'g'),
          code: $('<span>').addClass('emoticon').css({ 'background-image': 'url(' + image.url + ')', 'height': image.height, 'width': image.width }).prop('outerHTML').replace(/&quot;/g, "'")
        });
      }
    });
  });
};

ReChat.Playback.prototype._loadMessages = function(recievedAfter, callback) {
  var that = this;
  ReChat.get(ReChat.searchBaseUrl + this.videoId,
             { 'after': recievedAfter.toISOString() },
             callback,
             function(response) {
               if (response && response.status == 404) {
                 // invalid VOD
                 that._messageStreamEndAt = recievedAfter;
               } else {
                 // server error, let's try again in 10 seconds
                 setTimeout(function() {
                   if (!that._stopped) {
                     that._loadMessages(recievedAfter, callback);
                   }
                 }, 10000);
               }
             });
};

ReChat.Playback.prototype._currentVideoTime = function() {
  return (parseInt($('body').attr('rechat-video-time')) || 0) + this.streamDelay;
};

ReChat.Playback.prototype._currentAbsoluteVideoTime = function() {
  return new Date(+this.recordedAt + this._currentVideoTime() * 1000);
};

ReChat.Playback.prototype._autoPopulateCache = function(dropExistingCache) {
  var newestMessageDate = this._newestMessageDate || this._currentAbsoluteVideoTime(),
      populationId = new Date(),
      that = this;
  if (this._messageStreamEndAt && newestMessageDate >= this._messageStreamEndAt) {
    console.info('No more messages available, aborting...');
    return;
  }
  this._cachePopulationId = populationId;
  var loadingFunction = function() {
    console.info('Loading messages from the server that got recordet after ' + newestMessageDate);
    that._loadMessages(newestMessageDate, function(result) {
      if (populationId != that._cachePopulationId) {
        console.info('Population ID changed, lock expired, aborting...');
        return;
      }
      if (!result.hits.total) {
        that._messageStreamEndAt = newestMessageDate;
      } else {
        var hits = result.hits.hits,
        newestMessage = hits[hits.length - 1];
        that._newestMessageDate = new Date(newestMessage._source.recieved_at);
        if (result.hits.total == hits.length) {
          that._messageStreamEndAt = that._newestMessageDate;
        }
        if (dropExistingCache) {
          that._cachedMessages = hits;
        } else {
          Array.prototype.push.apply(that._cachedMessages, hits);
        }
      }
    });
  };

  if (dropExistingCache) {
    if (this._loadingTimeout) {
      clearTimeout(this._loadingTimeout);
    }
    this._loadingTimeout = setTimeout(loadingFunction, ReChat.loadingDelay);
  } else {
    loadingFunction();
  }
};

ReChat.Playback.prototype._showStatusMessage = function(message, statusImage) {
  if (!statusImage) {
    statusImage = 'spinner.gif';
  }
  if (this._lastStatusImage != statusImage) {
    this._statusMessageContainer.css('background-image', 'url(' + ReChat.getExtensionResourcePath('res/' + statusImage) + ')');
    this._lastStatusImage = statusImage;
  }
  this._chatMessageContainer.empty();
  this._statusMessageContainer.text(message);
  this._statusMessageContainer.show();
};

ReChat.Playback.prototype._hideStatusMessage = function() {
  this._statusMessageContainer.hide();
};

ReChat.Playback.prototype._scrolledToBottom = function() {
  return Math.abs(this._chatMessageContainer[0].scrollHeight - this._chatMessageContainer.scrollTop() - this._chatMessageContainer.outerHeight()) <= 30;
};

ReChat.Playback.prototype._scrollToBottom = function() {
  this._chatMessageContainer.scrollTop(this._chatMessageContainer[0].scrollHeight);
};

ReChat.Playback.prototype._replay = function() {
  var currentVideoTime = this._currentVideoTime(),
      currentAbsoluteVideoTime = this._currentAbsoluteVideoTime(),
      previousVideoTime = this._previousVideoTime,
      that = this;
  if (typeof previousVideoTime == 'undefined') {
    // first invocation => populate cache
    this._showStatusMessage('Loading messages...');
    console.info('First invocation, populating cache for the first time');
    this._autoPopulateCache(true);
  } else if (previousVideoTime > currentVideoTime || currentVideoTime - previousVideoTime > 60) {
    console.info('Time jumped, discarding cache and starting over');
    this._showStatusMessage('Loading messages...');
    this._newestMessageDate = null;
    this._cachedMessages = [];
    this._autoPopulateCache(true);
  } else if (currentAbsoluteVideoTime >= this._messageStreamEndAt) {
    if (this._chatMessageContainer.is(':empty')) {
      this._showStatusMessage('Sorry, no chat messages for this VOD available', 'sad.png');
    }
  } else if (!this._cachedMessages || !this._cachedMessages.length) {
    console.info('Cache is empty, waiting for population...');
  } else {
    if (this._cachedMessages.length >= ReChat.cacheExhaustionLimit) {
      this._cacheExhaustionHandled = false;
    }
    this._hideStatusMessage();
    var atBottom = this._scrolledToBottom();
    while (this._cachedMessages.length) {
      var message = this._cachedMessages[0],
          messageData = message._source,
          messageDate = new Date(Date.parse(messageData.recieved_at));
      if (messageDate <= currentAbsoluteVideoTime) {
        this._cachedMessages.shift();
        this._chatMessageContainer.append(this._formatChatMessage(messageData));
        if (atBottom) {
          this._scrollToBottom();
        }
      } else {
        if (this._chatMessageContainer.is(':empty')) {
          var secondsToFirstMessage = Math.floor(messageDate.getTime() / 1000 - currentAbsoluteVideoTime.getTime() / 1000);
          if (secondsToFirstMessage > 0) {
            var minutesToFirstMessage = Math.floor(secondsToFirstMessage / 60);
            secondsToFirstMessage -= minutesToFirstMessage * 60;
            secondsToFirstMessage = secondsToFirstMessage < 10 ? '0' + secondsToFirstMessage : secondsToFirstMessage;
            this._showStatusMessage('First recorded message will show up in ' + minutesToFirstMessage + ':' + secondsToFirstMessage);
          }
        }
        break;
      }
    }

    if (atBottom) {
      var numberOfChatMessagesDisplayed = this._chatMessageContainer.find('.rechat-chat-line').length;
      if (numberOfChatMessagesDisplayed >= ReChat.chatDisplayLimit) {
        this._chatMessageContainer.find('.rechat-chat-line:lt(' + Math.max(numberOfChatMessagesDisplayed - ReChat.chatDisplayLimit, 10) + ')').remove();
      }
    }

    if (!this._cacheExhaustionHandled && this._cachedMessages.length < ReChat.cacheExhaustionLimit) {
      this._cacheExhaustionHandled = true;
      this._autoPopulateCache();
    }
  }
  this._previousVideoTime = currentVideoTime;
  if (!this._stopped) {
    setTimeout(function() {
      that._replay();
    }, 200);
  }
};

ReChat.Playback.prototype._colorForNickname = function(nickname) {
  var hash = 0, i, chr, len;
  if (nickname.length == 0) return hash;
  for (i = 0, len = nickname.length; i < len; i++) {
    chr   = nickname.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  hash = Math.abs(hash);
  return ReChat.nicknameColors[hash % (ReChat.nicknameColors.length - 1)];
};

ReChat.Playback.prototype._replaceEmoticons = function(text) {
  $.each(this._emoticons, function(i, emoticon) {
    text = text.replace(emoticon.regex, emoticon.code);
  });
  return text;
};

ReChat.Playback.prototype._formatChatMessage = function(messageData) {
  var line = $('<div>').css('padding', '4px').addClass('rechat-chat-line'),
      from = $('<span>').addClass('from').css({
        'color': this._colorForNickname(messageData.from),
        'font-weight': 'bold'
      }),
      colon = $('<span>').addClass('colon'),
      message = $('<span>').addClass('message');
  from.text(messageData.from);
  colon.text(':');
  message.text(messageData.message);
  message.html(this._replaceEmoticons(message.html()));
  line.append(from).append(colon).append(' ').append(message);
  return line;
};

ReChat.Playback.prototype.start = function() {
  console.info('ReChat: start');
  this._prepareInterface();
  this._loadEmoticons();
  this._replay();
};

ReChat.Playback.prototype.stop = function() {
  this._stopped = true;
  if (this._loadingTimeout) {
    clearTimeout(this._loadingTimeout);
  }
  if (this._container) {
    this._container.empty();
    this._container.remove();
  }
  this._emoticons = [];
  this._cachedMessages = [];

  if (this._observer) {
    this._observer.disconnect();
  }
};

$(document).ready(function() {
  if (window.top !== window) {
    return;
  }
  var lastUrl = false,
      currentPlayback = false;
  // TODO: find a better solution for this...
  setInterval(function() {
    var currentUrl = document.location.href;
    if (lastUrl === false) {
      var ogVideoTag = $('meta[property="og:video"]');
      if (ogVideoTag.length && $('div.archive_info_title').length && $('div#player object').length) {
        var videoUrl = ogVideoTag.attr('content'),
            videoIdRegex = /videoId=([a-z0-9]+)/,
            match = videoIdRegex.exec(videoUrl);
        if (match != null) {
          var videoId = match[1];
          console.info('VOD ' + videoId + ' detected');
          ReChat.get('https://api.twitch.tv/kraken/videos/' + videoId, {}, function(result) {
            if (currentUrl != document.location.href) {
              return;
            }
            var recordedAt = new Date(Date.parse(result.recorded_at));
            currentPlayback = new ReChat.Playback(videoId, recordedAt);
            currentPlayback.start();
          });

          // Inject script to extract video time
          var script = document.createElement('script');
          script.src = ReChat.getExtensionResourcePath('js/injected.js');
          document.documentElement.appendChild(script);
        }
      }
      lastUrl = currentUrl;
    } else if(lastUrl != currentUrl) {
      if (currentPlayback) {
        currentPlayback.stop();
        currentPlayback = false;
      }
      lastUrl = false;
    }
  }, 1000);
});
