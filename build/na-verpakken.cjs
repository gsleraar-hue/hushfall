'use strict';

// Ad-hoc ondertekenen voor macOS.
//
// Een Mac met Apple Silicon weigert programma's die helemaal geen handtekening
// hebben - ook als jij in de instellingen toestemming geeft. Een echte
// handtekening kost een Apple-account van $99 per jaar, maar er is een gratis
// tussenvorm: ad-hoc ondertekenen (`codesign -s -`). Daarmee start de app, en
// hoef je alleen de eerste keer via Systeeminstellingen toestemming te geven.
//
// electron-builder roept dit bestand aan nadat hij de .app in elkaar heeft
// gezet, vlak voordat de dmg gemaakt wordt.

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

    // Nakijken of het ook echt gelukt is; een stille mislukking levert een app
    // op die pas bij de gebruiker weigert te starten.
    execFileSync('codesign', ['--verify', '--verbose=1', app], { stdio: 'inherit' });
  } catch (err) {
    console.error('  • ad-hoc ondertekenen mislukt: ' + err.message);
    throw err;
  }
};
