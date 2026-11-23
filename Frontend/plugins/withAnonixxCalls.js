const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/** Lets calls go picture-in-picture: the main activity must support it and survive resizing. */
module.exports = function withAnonixxCalls(config) {
  return withAndroidManifest(config, (cfg) => {
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    main.$['android:supportsPictureInPicture'] = 'true';
    main.$['android:resizeableActivity'] = 'true';
    const changes = new Set((main.$['android:configChanges'] || '').split('|').filter(Boolean));
    ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation'].forEach((c) => changes.add(c));
    main.$['android:configChanges'] = [...changes].join('|');
    return cfg;
  });
};
