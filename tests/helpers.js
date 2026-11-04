import { EXAMPLES } from '../src/project/examples.js';
import { STARTER_SOURCE } from '../src/project/starter.js';
import { compile } from '../src/language/compiler/compile.js';

export const IMAGE_ASSETS = {
  'assets/icon.png': {
    id: 'assets/icon.png',
    path: 'assets/icon.png',
    name: 'icon.png',
    type: 'image/png',
    size: 128,
    width: 64,
    height: 64,
    dataUrl: 'data:image/png;base64,AAAA',
    source: 'sample',
    hasAlpha: true,
  },
};

export const VIDEO_ASSETS = {
  'assets/clip.mp4': {
    id: 'assets/clip.mp4',
    path: 'assets/clip.mp4',
    name: 'clip.mp4',
    type: 'video/mp4',
    size: 2048,
    width: 320,
    height: 240,
    dataUrl: 'data:video/mp4;base64,AAAA',
    source: 'sample',
  },
};

export function syntheticAssets(paths = []) {
  return Object.fromEntries(
    paths.map((path) => {
      const video = /\.(mp4|webm)$/i.test(path);
      return [
        path,
        {
          id: path,
          path,
          name: path.split('/').pop(),
          type: video ? 'video/mp4' : 'image/png',
          size: 32,
          width: 64,
          height: 64,
          dataUrl: video ? 'data:video/mp4;base64,AAAA' : 'data:image/png;base64,AAAA',
          source: 'sample',
          hasAlpha: !video,
        },
      ];
    }),
  );
}

export function compileExample(example) {
  return compile(example.source, { assets: syntheticAssets(example.assetPaths) });
}

export function compileStarter() {
  return compile(STARTER_SOURCE, {
    assets: syntheticAssets(['assets/room-icon.png']),
  });
}

export function compileAllExamples() {
  return [
    { id: 'starter', source: STARTER_SOURCE, assetPaths: ['assets/room-icon.png'] },
    ...EXAMPLES,
  ].map((entry) => ({
    entry,
    result: compile(entry.source, { assets: syntheticAssets(entry.assetPaths) }),
  }));
}

export const VALID_SOURCE = `<app name="Test App" width="320" height="240" background="#101820">
    <vars>
        <fam name="room">
            <var name="temperature" type="number" value="21.5" />
            <var name="enabled" type="boolean" value="true" />
            <var name="label" type="string" value="Lab" />
            <var name="accent" type="color" value="#00FF88" />
            <var name="icon" type="image" value="assets/icon.png" />
        </fam>
    </vars>
    <page id="home" title="Home" initial="true">
        <shape id="panel" type="roundRect" x="10" y="10" width="300" height="180" fill="#17283C" radius="12" />
        <text id="text-label" x="20" y="20" width="200" height="40" color="\${room.accent}">\${room.label}</text>
        <text id="degrees" x="20" y="70" width="200" height="50">\${room.temperature}C</text>
        <img id="icon" x="250" y="20" width="48" height="48" src="\${room.icon}" fit="contain" />
        <button id="toggle" x="20" y="150" width="280" height="50" disabled="\${!room.enabled}" onPress="toggle(room.enabled); set(room.temperature, room.temperature + 1)">
            <text id="toggle-label" x="0" y="0" width="100%" height="100%">Toggle</text>
        </button>
    </page>
    <page id="settings" title="Settings">
        <text id="settings-value" x="20" y="20" width="280" height="40">Current: \${room.temperature}</text>
        <button id="back" x="20" y="100" width="120" height="40" onPress="back()">
            <text id="back-label" x="0" y="0" width="100%" height="100%">Back</text>
        </button>
    </page>
</app>`;

export function compileValid() {
  return compile(VALID_SOURCE, { assets: IMAGE_ASSETS });
}

export function codesOf(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}
