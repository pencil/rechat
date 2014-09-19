var pageMod = require('sdk/page-mod'),
    data = require('sdk/self').data,
    localFiles = {
      'res/sad.png': data.url('sad.png'),
      'res/spinner.gif': data.url('spinner.gif'),
      'js/injected.js': data.url('injected.js')
    };

pageMod.PageMod({
  include: ['http://www.twitch.tv/*'],
  contentScriptOptions: localFiles,
  contentScriptFile: [
    data.url('jquery.min.js'),
    data.url('please.min.js'),
    data.url('rechat.js')
  ]
});
