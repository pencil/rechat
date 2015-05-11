this.ReChat = $.extend(this.ReChat || {}, {
  getExtensionVersion: function() {
    return self.options.version;
  },

  getExtensionResourcePath: function (path) {
    return self.options.paths[path];
  }
});
