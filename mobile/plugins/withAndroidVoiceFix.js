const {
  withAppBuildGradle,
  withAndroidManifest,
  withGradleProperties,
} = require('@expo/config-plugins');

/** Resolve androidx vs com.android.support clash from @react-native-voice/voice */
function withAndroidVoiceFix(config) {
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const jetifier = props.find(
      (p) => p.type === 'property' && p.key === 'android.enableJetifier',
    );
    if (jetifier) {
      jetifier.value = 'false';
    }
    const jvmargs = props.find(
      (p) => p.type === 'property' && p.key === 'org.gradle.jvmargs',
    );
    if (jvmargs && !jvmargs.value.includes('-Xmx4096m')) {
      jvmargs.value = '-Xmx4096m -XX:MaxMetaspaceSize=512m';
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("exclude group: 'com.android.support'")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        'dependencies {',
        `configurations.all {\n    exclude group: 'com.android.support'\n}\n\ndependencies {`,
      );
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const application = manifest.application?.[0];
    if (application) {
      application.$ = application.$ ?? {};
      application.$['tools:replace'] = 'android:appComponentFactory';
      application.$['android:appComponentFactory'] =
        'androidx.core.app.CoreComponentFactory';
    }
    return cfg;
  });

  return config;
}

module.exports = withAndroidVoiceFix;
