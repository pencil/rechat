this.ReChat = $.extend(this.ReChat || {}, {
  getExtensionVersion: function() {
    return chrome.runtime.getManifest().version;
  },

  getExtensionResourcePath: function (path) {
    return chrome.extension.getURL(path);
  }
});
