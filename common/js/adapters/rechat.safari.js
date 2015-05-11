this.ReChat = $.extend(this.ReChat || {}, {
  getExtensionVersion: function() {
    // safari.extension is a SafariContentExtension which doesn't allow us to read displayVersion...
    return '';
  },

  getExtensionResourcePath: function (path) {
    return safari.extension.baseURI + path;
  },

  get: function(path, params, success, failure) {
    var uuid = new Date().getTime() + '',
        handler = function(event) {
          if (event.name == uuid) {
            safari.self.removeEventListener('message', handler);
            if (!event.message || event.message.error) {
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
    return null;
  }
});
