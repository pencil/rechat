this.ReChat = $.extend({
  // Settings:
  searchBaseUrl: 'http://search.rechat.org/videos/',
  cacheExhaustionLimit: 100,
  chatDisplayLimit: 1000,
  loadingDelay: 5000,
  nicknameColors: Please.make_color({ colors_returned: 50, saturation: 0.7 }),
  defaultStreamDelay: 17,

  autolinker: new Autolinker({
    urls: true,
    email: true,
    twitter: false,
    phone: false,
    stripPrefix: false
  }),

  get: function(path, params, success, failure) {
    var jqxhr = $.get(path, params, success);
    if (failure) {
      jqxhr.fail(failure);
    }
    return null;
  }
}, this.ReChat || {});

ReChat.Playback = function(videoId, recordedAt) {
  this.videoId = videoId;
  this.recordedAt = recordedAt;
  this.streamDelay = ReChat.defaultStreamDelay;
};

ReChat.Playback.prototype._prepareInterface = function() {
  var that = this;
  var container = $('<div>').css({
    'position': 'absolute',
    'right': 0,
    'top': 0,
    'bottom': 0,
    'width': '339px',
    'z-index': 4,
    'background-color': '#f2f2f2'
  }).addClass('rightcol-content');

  var header = $('<div>').css({
    'display': 'block',
    'position': 'relative',
    'top': '0px',
    'height': '20px',
    'padding': '10px 0',
    'line-height': '20px',
    'text-align': 'center',
    'font-size': '14px',
    'z-index': '5',
    'width': '100%',
    'box-shadow': 'inset 0 -1px 0 0 rgba(0,0,0,0.2)'
  });
  header.text('ReChat for Twitch™ ' + ReChat.getExtensionVersion());
  container.append(header);

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
    'top': '40px',
    'bottom': 0,
    'left': 0,
    'width': 'auto',
    'height': 'auto',
    'overflow-x': 'hidden',
    'overflow-y': 'auto'
  });
  container.append(chatMessages);
  this._chatMessageContainer = chatMessages;
  chatMessages.on('scroll', function() {
    that._userScrolling = !that._scrolledToBottom();
  });

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
  this._emoticons = {};
  ReChat.get('https://api.twitch.tv/kraken/chat/emoticon_images', {}, function(result) {
    if (typeof(result) === 'string' && typeof(JSON) !== 'undefined') {
      try {
        result = JSON.parse(result);
      } catch(e) {}
    }
    $.each(result.emoticons, function(i, emoticon) {
      if (!that._emoticons[emoticon.emoticon_set]) {
        that._emoticons[emoticon.emoticon_set] = [];
      }
      image_set_url = '//static-cdn.jtvnw.net/emoticons/v1/' + emoticon.id;
      that._emoticons[emoticon.emoticon_set].push({
        regex: new RegExp('\\b' + emoticon.code + '\\b', 'g'),
        code: "<img class='emoticon' src='" + image_set_url + "/1.0' srcset='" + image_set_url + "/2.0 2x' />"
      });
    });
  });
};

ReChat.Playback.prototype._loadMessages = function(recievedAfter, callback, connectionErrors) {
  var that = this;
  if (!connectionErrors) {
    connectionErrors = 0;
  }
  ReChat.get(ReChat.searchBaseUrl + this.videoId,
             {
               'include_jtv': 'true',
               'after': recievedAfter.toISOString()
             },
             callback,
             function(response) {
               if (response && response.status == 404) {
                 // invalid VOD
                 that._messageStreamEndAt = recievedAfter;
               } else {
                 // server error, let's try again in 10 seconds
                 setTimeout(function() {
                   if (!that._stopped) {
                     that._loadMessages(recievedAfter, callback, connectionErrors + 1);
                   }
                 }, 1000 * Math.pow(2, connectionErrors));
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
    console.info('ReChat: No more messages available, aborting...');
    return;
  }
  this._cachePopulationId = populationId;
  var loadingFunction = function() {
    console.info('ReChat: Loading messages from the server that got recordet after ' + newestMessageDate);
    that._loadMessages(newestMessageDate, function(result) {
      if (populationId != that._cachePopulationId) {
        console.info('ReChat: Population ID changed, lock expired, aborting...');
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
      this._showStatusMessage('Sorry, no chat messages for this VOD available. The VOD is either too old or the channel didn\'t get enough viewers when it was live.', 'sad.png');
    }
  } else if (!this._cachedMessages || !this._cachedMessages.length) {
    console.info('ReChat: Cache is empty, waiting...');
  } else {
    if (this._cachedMessages.length >= ReChat.cacheExhaustionLimit) {
      this._cacheExhaustionHandled = false;
    }
    this._hideStatusMessage();
    var atBottom = !this._userScrolling;
    while (this._cachedMessages.length) {
      var message = this._cachedMessages[0],
          messageData = message._source,
          messageDate = new Date(Date.parse(messageData.recieved_at));
      if (messageDate <= currentAbsoluteVideoTime) {
        this._cachedMessages.shift();
        if (messageData.from == 'twitchnotify') {
          var formattedMessage = this._formatSystemMessage(messageData);
        } else if (messageData.from == 'jtv') {
          var formattedMessage = this._formatJtvMessage(messageData);
        } else {
          var formattedMessage = this._formatChatMessage(messageData);
        }
        if (formattedMessage != null) {
          this._chatMessageContainer.append(formattedMessage);
        }
        if (atBottom) {
          this._scrollToBottom();
        }
      } else {
        if (this._chatMessageContainer.is(':empty')) {
          var secondsToFirstMessage = Math.ceil(messageDate.getTime() / 1000 - currentAbsoluteVideoTime.getTime() / 1000);
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

ReChat.Playback.prototype._colorForNickname = function(nickname, usercolor) {
  if (usercolor) {
    return '#' + ('000000' + usercolor.toString(16)).slice(-6);
  } else {
    return this._generateColorForNickname(nickname);
  }
};

ReChat.Playback.prototype._generateColorForNickname = function(nickname) {
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

ReChat.Playback.prototype._replaceEmoticons = function(text, emoticon_set) {
  var that = this;
  if (!emoticon_set) {
    emoticon_set = [];
  }
  $.each(emoticon_set.concat([null]), function(i, emoticon_set_id) {
    if (that._emoticons[emoticon_set_id]) {
      $.each(that._emoticons[emoticon_set_id], function(j, emoticon) {
        text = text.replace(emoticon.regex, emoticon.code);
      });
    }
  });
  return text;
};

ReChat.Playback.prototype._formatChatMessage = function(messageData) {
  var line = $('<div>').css('padding', '4px').addClass('rechat-chat-line'),
      from = $('<span>').addClass('from').css({
        'color': this._colorForNickname(messageData.from, messageData.usercolor),
        'font-weight': 'bold'
      }),
      colon = $('<span>').addClass('colon'),
      message = $('<span>').addClass('message');
  from.text(messageData.from);
  colon.text(':');
  message.text(messageData.message);
  message.html(this._replaceEmoticons(ReChat.autolinker.link(message.html()), messageData.emoteset));
  line.append(from).append(colon).append(' ').append(message);
  return line;
};

ReChat.Playback.prototype._formatSystemMessage = function(messageData) {
  var line = $('<div>').css('padding', '4px').addClass('rechat-chat-line'),
      message = $('<span>').css('color', '#666').addClass('message');
  message.text(messageData.message);
  line.append(message);
  return line;
};

ReChat.Playback.prototype._formatJtvMessage = function(messageData) {
  var message = messageData.message,
      parts = message.split(' ', 2);
  if (parts[0] == 'CLEARCHAT') {
    message = message.substring(10) + ' has been timed out.';
  } else if (parts[0] != 'This') {
    return null;
  }
  console.info(message);
  return this._formatSystemMessage($.extend(messageData, { message: message }));
};

ReChat.Playback.prototype.start = function() {
  console.info('ReChat ' + ReChat.getExtensionVersion() + ': start');
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
  this._emoticons = {};
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
          console.info('ReChat: VOD ' + videoId + ' detected');
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
