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

  subscriberUrl: null,

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
    'background-color': '#f2f2f2',
    'margin': 0
  }).addClass('rightcol-content').addClass('ember-chat');

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
  header.addClass('chat-header');
  header.text('ReChat for Twitch™ ' + ReChat.getExtensionVersion());
  container.append(header);

  var statusMessage = $('<div>').css({
    'position': 'relative',
    'top': '50px',
    'text-align': 'center',
    'background-repeat': 'no-repeat',
    'background-position': 'center top',
    'background-size': '40px 40px',
    'padding': '60px 20px',
    'z-index': 100
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
  this._staydown = new StayDown({
    target: chatMessages.get(0),
    interval: 100,
    callback: function(event) {
      switch (event) {
        case 'release':
          that._userScrolling = true;
          break;
        case 'lock':
          that._userScrolling = false;
          break;
      }
    }
  });
  chatMessages.addClass('chat-messages');
  container.append(chatMessages);
  this._chatMessageContainer = chatMessages;

  this._container = container;
  $('body').append(container);

  // Channel share button
  var theatreButton = $('<span>').
    addClass('theatre-button glyph-only button action tooltip').
    attr('onclick', 'ReChat.handleTheatreMode()').
    attr('title', 'Theater Mode (Alt+T)');
  theatreButton.append('<svg class="svg-theatre" height="16px" version="1.1" viewbox="0 0 16 16" width="16px" x="0px" y="0px"><path clip-rule="evenodd" d="M1,13h9V3H1V13z M11,3v10h4V3H11z" fill-rule="evenodd"></path></svg>');
  var shareChannel = $('.channel-actions').find('> span:last-child').prev();
  shareChannel.append(theatreButton);

  var exitTheatreButton = $('<div>').
    addClass('exit-theatre').
    attr('onclick', 'ReChat.handleTheatreMode()');
  var exitTheatreButtonLink = $('<a>').text('Exit Theater Mode');
  exitTheatreButton.append(exitTheatreButtonLink);
  $('#player').append(exitTheatreButton);

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
  return (parseFloat($('body').attr('rechat-video-time')) || 0) + this.streamDelay;
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
    while (this._cachedMessages.length) {
      var message = this._cachedMessages[0],
          messageData = message._source,
          messageDate = new Date(Date.parse(messageData.recieved_at));
      if (messageDate <= currentAbsoluteVideoTime) {
        this._cachedMessages.shift();
        delete this._timeouts[messageData.from];
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

    if (!this._userScrolling) {
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

ReChat.Playback.prototype._replaceEmoticonsByRanges = function(text, emotes) {
  var escapeHelper = $('<div>'),
      escapeAndLink = function(text) {
        return ReChat.autolinker.link(escapeHelper.text(text).html());
      };
  if (!emotes) {
    return escapeAndLink(text);
  }
  var emotesToReplace = [],
      emotes = emotes.split('/');
  $.each(emotes, function(i, emoteDataRaw) {
    var emoteData = emoteDataRaw.split(':'),
        emoteId = emoteData[0],
        emoteRanges = emoteData[1].split(',');
    $.each(emoteRanges, function(j, emoteRange) {
      var emoteRangeParts = emoteRange.split('-'),
          emoteRangeBegin = parseInt(emoteRangeParts[0]),
          emoteRangeEnd = parseInt(emoteRangeParts[1]);
      emotesToReplace.push({ id: emoteId, begin: emoteRangeBegin, end: emoteRangeEnd });
    });
  });
  emotesToReplace.sort(function(x, y) {
    return x.begin - y.begin;
  });
  var offset = 0,
      messageHtml = '';
  $.each(emotesToReplace, function(i, emote) {
    var emoteText = text.substring(emote.begin, emote.end + 1),
        imageBaseUrl = '//static-cdn.jtvnw.net/emoticons/v1/' + emote.id,
        image = $('<img>').attr({
          src: imageBaseUrl + '/1.0',
          srcset: imageBaseUrl + '/2.0 2x',
          alt: emoteText,
          title: emoteText
        }),
        imageHtml = image[0].outerHTML;
    messageHtml += escapeAndLink(text.substring(offset, emote.begin));
    messageHtml += imageHtml;
    offset = emote.end + 1;
  });
  messageHtml += escapeAndLink(text.substring(offset));
  return messageHtml;
};

ReChat.Playback.prototype._formatChatMessage = function(messageData) {
  var userColor = this._colorForNickname(messageData.from, messageData.usercolor),
      line = $('<div>').css('padding', '4px').addClass('rechat-chat-line').addClass('rechat-user-' + messageData.from),
      badges = $('<span>').addClass('badges'),
      from = $('<span>').addClass('from').css({
        'color': userColor,
        'font-weight': 'bold'
      }),
      colon = $('<span>').addClass('colon'),
      message = $('<span>').addClass('message').css({ 'word-wrap': 'break-word' }),
      messageText = messageData.message;
  if (messageText.substring(0, 8) == "\x01ACTION ") {
    message.css({ 'color': userColor });
    messageText = messageText.substring(8);
  } else {
    colon.text(':');
  }
  // Check if turbo user
  if(messageData.turbo) {
    var badge_content = $('<div>').addClass('badge').addClass('turbo');
    badge_content.prop('title', 'Twitch Turbo');
    badges.append(badge_content).append(' ');
  }
  // Check if channel subscriber
  if(messageData.subscriber && ReChat.subscriberUrl != null) {
    var badge_content = $('<div>').addClass('badge').addClass('subscriber')
    badge_content.prop('original-title', 'Channel Subscriber');
    badge_content.css('background-image', 'url('+ReChat.subscriberUrl+')');
    badges.append(badge_content).append(' ');
  }
  from.text(messageData.from.replace('\\s', ' '));
  var messageHtml = this._replaceEmoticonsByRanges(messageText, messageData.emotes);
  message.html(messageHtml);
  line.append(badges).append(from).append(colon).append(' ').append(message);
  return line;
};

ReChat.Playback.prototype._formatSystemMessage = function(messageData, classification) {
  var line = $('<div>').css('padding', '4px').addClass('rechat-chat-line'),
      message = $('<span>').css('color', '#666').addClass('message');
  if (classification) {
    line.addClass(classification);
  }
  message.text(messageData.message);
  line.append(message);
  return line;
};

ReChat.Playback.prototype._formatJtvMessage = function(messageData) {
  var message = messageData.message,
      classification = null;
  if (message.substring(0, 9) == 'CLEARCHAT') {
    var user = message.substring(10);
    classification = 'rechat-timeout-' + user;
    message = user + ' has been timed out.';
    if (this._timeouts[user]) {
      var existing = $('div.rechat-chat-line.' + classification).last();
      if (existing.length) {
        var counter = existing.data('rechat-timeout-counter') || 1;
        counter += 1;
        message += ' (' + counter + ' times)';
        existing.find('.message').text(message);
        existing.data('rechat-timeout-counter', counter);
        return null;
      }
    }
    $('div.rechat-chat-line.rechat-user-' + user + ' .message').css({ 'color': '#999' });
    this._timeouts[user] = true;
  } else if (message.substring(0, 9) != 'This room') {
    return null;
  }
  return this._formatSystemMessage($.extend(messageData, { message: message }), classification);
};

ReChat.Playback.prototype._getSubscriberUrl  = function() {
  // Ajax to twitch api
  $.ajax({
    url: 'https://api.twitch.tv/kraken/chat/'+($(location).prop('pathname').split('/')[1])+'/badges',
    success: function(data){
      try {
        ReChat.subscriberUrl = data['subscriber']['image'];
      } catch(err) {
        ReChat.subscriberUrl = null;
        console.info('ReChat: No subscriber badge found');
      }
    }
  });
};

ReChat.Playback.prototype.start = function() {
  console.info('ReChat ' + ReChat.getExtensionVersion() + ': start');
  this._timeouts = {};
  this._getSubscriberUrl();
  this._prepareInterface();
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
  this._cachedMessages = [];

  if (this._observer) {
    this._observer.disconnect();
  }

  if (this._staydown) {
    this._staydown.interval = 10000000; // only what to "stop" it
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
      var flashVars = $('param[name="flashvars"]'),
          html5Player = $('div.player.player-isvod'),
          videoId = false;
      if (html5Player.length) {
        videoId = html5Player.attr('data-video');
      } else if (flashVars.length && $('div.archive_info_title').length && $('div#player object').length) {
        var match = /videoId=([a-z0-9]+)/.exec(flashVars.attr('value'));
        if (match != null) {
          videoId = match[1];
        }
      }
      if (videoId) {
        lastUrl = currentUrl;
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
        var script = document.createElement((function(a, b, c, d) { return d + a + b + c; })('c', 'rip', 't', 's'));
        script.src = ReChat.getExtensionResourcePath('js/injected.js');
        document.documentElement.appendChild(script);
      }
    } else if(lastUrl != currentUrl) {
      if (currentPlayback) {
        currentPlayback.stop();
        currentPlayback = false;
      }
      lastUrl = false;
    }
  }, 1000);
});
