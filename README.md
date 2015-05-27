# [ReChat](https://www.rechat.org/)

Adds chat messages from the past to your favorite Twitch VODs.

## Development

**Note**: The following steps are only necessary if you are interested in developing new features or bugfixes for ReChat. If you simply want to install and use the extension, checkout our [official website](https://www.rechat.org/).

To prevent code duplication, ReChat uses shared resources from the `common` directory for all browsers. Execute `setup.sh` do (hard) link the shared resources accordingly.

### Chrome / Opera

[Follow these steps](https://developer.chrome.com/extensions/getstarted#unpacked) to load the unpacked ReChat extension. Select the `Chrome` directory as extension directory.

### Firefox

[Install Mozilla's Add-on SDK](https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Installation) and use `cfx run` from the `Firefox` directory to test the extension.

### Safari

[Follow these steps](https://developer.apple.com/library/safari/documentation/Tools/Conceptual/SafariExtensionGuide/UsingExtensionBuilder/UsingExtensionBuilder.html) and choose `Safari` as extension folder in the "Add Extension" dialog.
