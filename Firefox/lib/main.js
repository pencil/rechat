var pageMod = require('sdk/page-mod'),
    self = require('sdk/self'),
    data = self.data,
    version = self.version,
    localFiles = {
      'res/sad.png': data.url('sad.png'),
      'res/spinner.gif': data.url('spinner.gif'),
      'js/injected.js': data.url('injected.js')
    };

pageMod.PageMod({
  include: ['http://www.twitch.tv/*', 'https://www.twitch.tv/*'],
  contentScriptOptions: {
    paths: localFiles,
    version: version
  },
  contentScriptFile: [
    data.url('jquery.min.js'),
    data.url('please.js'),
    data.url('autolinker.js'),
    data.url('staydown.js'),
    data.url('rechat.firefox.js'),
    data.url('rechat.js')
  ]
});
