'use strict';

// Ad-hoc signing for macOS.
//
// A Mac with Apple Silicon refuses programs that carry no signature at all -
// even if you grant permission in System Settings. A real signature costs an
// Apple account at $99 a year, but there is a free middle ground: ad-hoc
// signing (`codesign -s -`). With that the app starts, and you only have to
// allow it once, through System Settings, the first time.
//
// electron-builder calls this file after it has assembled the .app, right
// before the dmg is made.

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function naVerpakken(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const naam = context.packager.appInfo.productFilename;
  const app = path.join(context.appOutDir, naam + '.app');

  try {
    execFileSync(
      'codesign',
      ['--force', '--deep', '--sign', '-', '--timestamp=none', app],
      { stdio: 'inherit' }
    );
    console.log('  • ad-hoc ondertekend    ' + app);

    // Check that it really worked; a silent failure produces an app that only
    // refuses to start once it reaches the user.
    execFileSync('codesign', ['--verify', '--verbose=1', app], { stdio: 'inherit' });
  } catch (err) {
    console.error('  • ad-hoc ondertekenen mislukt: ' + err.message);
    throw err;
  }
};
