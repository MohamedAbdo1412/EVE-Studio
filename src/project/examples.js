import { STARTER_SOURCE } from './starter.js';

const HELLO_WORLD = `<app name="Hello EVE" width="800" height="480" scale="fit" background="#0B1220">
    <page id="main" title="Hello World" initial="true" background="#0B1220">
        <shape id="halo" type="circle" x="270" y="92" width="260" height="260" fill="#12263F" stroke="#2455AA" strokeWidth="2" />
        <text id="hello" x="150" y="176" width="500" height="80" fontSize="56" weight="bold" color="#FFFFFF" align="center" verticalAlign="middle">
            Hello, EVE.
        </text>
        <text id="subtitle" x="200" y="256" width="400" height="48" fontSize="18" color="#00D084" align="center">
            A declarative UI for embedded graphics.
        </text>
        <shape id="accent" type="line" x="320" y="326" width="160" height="2" stroke="#2455AA" strokeWidth="2" />
    </page>
</app>
`;

const MULTI_PAGE = `<app name="Navigation Atlas" width="800" height="480" scale="fit" background="#0C1420">
    <vars>
        <fam name="nav">
            <var name="visits" type="number" value="0" />
            <var name="lastPage" type="string" value="None" />
        </fam>
    </vars>

    <page id="home" title="Home" initial="true" background="#0C1420">
        <text id="home-title" x="40" y="40" width="520" height="60" fontSize="38" weight="bold" color="#FFFFFF">Navigation Atlas</text>
        <text id="home-copy" x="40" y="112" width="480" height="64" fontSize="17" color="#8DA4BD" wrap="true">
            A three-page navigation graph. The runtime keeps a real history stack and variables survive every transition.
        </text>
        <shape id="home-card" type="roundRect" x="40" y="200" width="330" height="120" fill="#162436" stroke="#263E57" strokeWidth="1" radius="12" />
        <text id="home-visits" x="64" y="226" width="290" height="42" fontSize="24" color="#00D084">Navigation events: \${nav.visits}</text>
        <text id="home-last" x="64" y="270" width="290" height="32" fontSize="15" color="#8DA4BD">Last page: \${nav.lastPage}</text>
        <button id="go-gallery" x="430" y="200" width="300" height="58" background="#2455AA" radius="9" onPress="set(nav.visits, nav.visits + 1); set(nav.lastPage, 'Gallery'); navigate('gallery')">
            <text id="go-gallery-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Open Gallery</text>
        </button>
        <button id="go-detail" x="430" y="276" width="300" height="58" background="#2C3C50" radius="9" onPress="set(nav.visits, nav.visits + 1); set(nav.lastPage, 'Detail'); navigate('detail')">
            <text id="go-detail-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Open Detail</text>
        </button>
    </page>

    <page id="gallery" title="Gallery" background="#0F1A27">
        <text id="gallery-title" x="40" y="34" width="560" height="48" fontSize="30" weight="bold" color="#FFFFFF">Gallery Page</text>
        <shape id="gallery-panel" type="roundRect" x="40" y="110" width="720" height="220" fill="#142438" radius="14" />
        <text id="gallery-copy" x="70" y="146" width="660" height="42" fontSize="20" color="#B8C9DB">This page was reached with navigate('gallery').</text>
        <text id="gallery-visits" x="70" y="204" width="660" height="40" fontSize="18" color="#00D084">Visits: \${nav.visits}</text>
        <button id="gallery-back" x="40" y="370" width="200" height="56" background="#2455AA" radius="9" onPress="back()">
            <text id="gallery-back-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Back</text>
        </button>
        <button id="gallery-detail" x="260" y="370" width="220" height="56" background="#246B52" radius="9" onPress="set(nav.visits, nav.visits + 1); set(nav.lastPage, 'Detail'); navigate('detail')">
            <text id="gallery-detail-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Go to Detail</text>
        </button>
    </page>

    <page id="detail" title="Detail" background="#121C2A">
        <text id="detail-title" x="40" y="34" width="560" height="48" fontSize="30" weight="bold" color="#FFFFFF">Detail Page</text>
        <text id="detail-copy" x="40" y="110" width="700" height="60" fontSize="18" color="#B8C9DB" wrap="true">
            back() restores the previous page from the history stack. Use the buttons below to test both paths.
        </text>
        <shape id="detail-block" type="roundRect" x="40" y="196" width="700" height="100" fill="#17283C" radius="12" />
        <text id="detail-visits" x="64" y="228" width="640" height="40" fontSize="20" color="#FFB454">Total navigation events: \${nav.visits}</text>
        <button id="detail-back" x="40" y="340" width="200" height="56" background="#2455AA" radius="9" onPress="back()">
            <text id="detail-back-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Back</text>
        </button>
        <button id="detail-home" x="260" y="340" width="220" height="56" background="#2C3C50" radius="9" onPress="navigate('home')">
            <text id="detail-home-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Navigate Home</text>
        </button>
    </page>
</app>
`;

const CONTROL_PANEL = `<app name="Control Panel" width="800" height="480" scale="fit" background="#0B1118">
    <vars>
        <fam name="panel">
            <var name="power" type="boolean" value="true" />
            <var name="level" type="number" value="42" />
            <var name="locked" type="boolean" value="false" />
            <var name="status" type="string" value="Nominal" />
        </fam>
    </vars>

    <page id="control" title="Control Panel" initial="true" background="#0B1118">
        <shape id="control-header" type="rect" x="0" y="0" width="800" height="82" fill="#131E2C" />
        <text id="control-title" x="32" y="22" width="500" height="42" fontSize="28" weight="bold" color="#FFFFFF">System Control</text>
        <shape id="power-dot" type="circle" x="734" y="35" width="14" height="14" fill="\${panel.power ? '#00FF88' : '#FF5C5C'}" />
        <text id="power-label" x="650" y="31" width="76" height="26" fontSize="13" color="#8DA4BD" align="right">\${panel.power ? 'ONLINE' : 'OFFLINE'}</text>

        <shape id="level-card" type="roundRect" x="30" y="112" width="350" height="230" fill="#162333" stroke="#263D55" strokeWidth="1" radius="14" />
        <text id="level-label" x="54" y="136" width="300" height="32" fontSize="15" color="#8DA4BD">OUTPUT LEVEL</text>
        <text id="level-value" x="54" y="180" width="300" height="80" fontSize="58" weight="bold" color="\${panel.level > 80 ? '#FFB454' : '#00FF88'}">\${panel.level}%</text>
        <shape id="level-track" type="roundRect" x="54" y="292" width="300" height="10" fill="#24364A" radius="5" />
        <shape id="level-fill" type="roundRect" x="54" y="292" width="\${panel.level}%" height="10" fill="\${panel.level > 80 ? '#FFB454' : '#00D084'}" radius="5" />
        <text id="level-status" x="54" y="312" width="300" height="24" fontSize="14" color="#8DA4BD">\${panel.status}</text>

        <button id="level-up" x="430" y="120" width="320" height="54" background="#246B52" radius="8" disabled="\${panel.locked}" onPress="set(panel.level, panel.level + 10)">
            <text id="level-up-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Increase +10</text>
        </button>
        <button id="level-down" x="430" y="188" width="320" height="54" background="#884444" radius="8" disabled="\${panel.locked}" onPress="set(panel.level, panel.level - 10)">
            <text id="level-down-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Decrease −10</text>
        </button>
        <button id="toggle-power" x="430" y="256" width="320" height="54" background="#2455AA" radius="8" onPress="toggle(panel.power); set(panel.status, panel.power ? 'Power off' : 'Power on')">
            <text id="toggle-power-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Toggle Power</text>
        </button>
        <button id="toggle-lock" x="430" y="324" width="320" height="54" background="#35475C" radius="8" onPress="toggle(panel.locked)">
            <text id="toggle-lock-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">\${panel.locked ? 'Unlock Controls' : 'Lock Controls'}</text>
        </button>
        <text id="lock-note" x="430" y="392" width="320" height="40" fontSize="14" color="\${panel.locked ? '#FFB454' : '#71879D'}">\${panel.locked ? 'Level buttons are disabled.' : 'Level buttons are interactive.'}</text>
    </page>
</app>
`;

const DYNAMIC_COLORS = `<app name="Color Dashboard" width="800" height="480" scale="fit" background="#0A0F18">
    <vars>
        <fam name="palette">
            <var name="accent" type="color" value="#00D084" />
            <var name="surface" type="color" value="#17283C" />
            <var name="label" type="string" value="Aurora" />
        </fam>
    </vars>

    <page id="dashboard" title="Color Dashboard" initial="true" background="#0A0F18">
        <text id="palette-title" x="34" y="30" width="500" height="50" fontSize="30" weight="bold" color="#FFFFFF">Dynamic Color Dashboard</text>
        <shape id="hero-card" type="roundRect" x="34" y="110" width="470" height="250" fill="\${palette.surface}" stroke="\${palette.accent}" strokeWidth="2" radius="18" />
        <shape id="hero-orb" type="circle" x="68" y="150" width="96" height="96" fill="\${palette.accent}" />
        <text id="palette-label" x="186" y="158" width="280" height="50" fontSize="32" weight="bold" color="#FFFFFF">\${palette.label}</text>
        <text id="accent-value" x="186" y="208" width="280" height="36" fontSize="18" color="\${palette.accent}">Accent: \${palette.accent}</text>
        <text id="color-copy" x="68" y="278" width="400" height="56" fontSize="15" color="#9CB0C4" wrap="true">Color variables can bind text, shapes, borders and visibility without recompiling.</text>
        <button id="color-green" x="540" y="126" width="220" height="52" background="#00A870" radius="8" onPress="set(palette.accent, '#00FF88'); set(palette.label, 'Aurora')">
            <text id="color-green-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Aurora Green</text>
        </button>
        <button id="color-blue" x="540" y="194" width="220" height="52" background="#2455AA" radius="8" onPress="set(palette.accent, '#3D8BFF'); set(palette.label, 'Signal')">
            <text id="color-blue-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Signal Blue</text>
        </button>
        <button id="color-amber" x="540" y="262" width="220" height="52" background="#9A5B13" radius="8" onPress="set(palette.accent, '#FFB454'); set(palette.label, 'Ember')">
            <text id="color-amber-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Ember Amber</text>
        </button>
        <button id="color-reset" x="540" y="330" width="220" height="52" background="#35475C" radius="8" onPress="reset(palette.accent); reset(palette.label)">
            <text id="color-reset-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Reset Palette</text>
        </button>
        <text id="palette-note" x="34" y="392" width="700" height="36" fontSize="14" color="#71879D">Edit palette.accent or palette.surface in the Runtime Variables inspector.</text>
    </page>
</app>
`;

const IMAGE_GALLERY = `<app name="Image Gallery" width="800" height="480" scale="fit" background="#0B121B">
    <vars>
        <fam name="gallery">
            <var name="selected" type="image" value="assets/gallery-sunset.png" />
            <var name="caption" type="string" value="Sunset Ridge" />
        </fam>
    </vars>

    <page id="gallery" title="Image Gallery" initial="true" background="#0B121B">
        <text id="gallery-title" x="30" y="24" width="500" height="48" fontSize="30" weight="bold" color="#FFFFFF">Image Gallery</text>
        <text id="gallery-caption" x="30" y="74" width="500" height="30" fontSize="15" color="\${'#8DA4BD'}">\${gallery.caption}</text>

        <shape id="preview-frame" type="roundRect" x="30" y="112" width="740" height="250" fill="#152334" stroke="#2A4057" strokeWidth="1" radius="14" />
        <img id="preview-image" x="42" y="124" width="716" height="226" src="\${gallery.selected}" fit="cover" radius="10" />

        <button id="choose-sunset" x="30" y="386" width="226" height="64" background="#1A2A3D" radius="10" onPress="set(gallery.selected, 'assets/gallery-sunset.png'); set(gallery.caption, 'Sunset Ridge')">
            <img id="thumb-sunset" x="8" y="8" width="48" height="48" src="assets/gallery-sunset.png" fit="cover" radius="7" />
            <text id="thumb-sunset-label" x="66" y="0" width="150" height="100%" fontSize="15" color="#FFFFFF" verticalAlign="middle">Sunset Ridge</text>
        </button>
        <button id="choose-mountains" x="286" y="386" width="226" height="64" background="#1A2A3D" radius="10" onPress="set(gallery.selected, 'assets/gallery-mountains.png'); set(gallery.caption, 'Blue Range')">
            <img id="thumb-mountains" x="8" y="8" width="48" height="48" src="assets/gallery-mountains.png" fit="cover" radius="7" />
            <text id="thumb-mountains-label" x="66" y="0" width="150" height="100%" fontSize="15" color="#FFFFFF" verticalAlign="middle">Blue Range</text>
        </button>
        <button id="choose-city" x="542" y="386" width="226" height="64" background="#1A2A3D" radius="10" onPress="set(gallery.selected, 'assets/gallery-city.png'); set(gallery.caption, 'Night Grid')">
            <img id="thumb-city" x="8" y="8" width="48" height="48" src="assets/gallery-city.png" fit="cover" radius="7" />
            <text id="thumb-city-label" x="66" y="0" width="150" height="100%" fontSize="15" color="#FFFFFF" verticalAlign="middle">Night Grid</text>
        </button>
    </page>
</app>
`;

const BUTTON_DEMO = `<app name="Button Interaction" width="800" height="480" scale="fit" background="#0C1118">
    <vars>
        <fam name="demo">
            <var name="count" type="number" value="0" />
            <var name="locked" type="boolean" value="false" />
            <var name="message" type="string" value="Ready" />
        </fam>
    </vars>

    <page id="buttons" title="Button Interaction" initial="true" background="#0C1118">
        <text id="button-title" x="34" y="30" width="600" height="52" fontSize="30" weight="bold" color="#FFFFFF">Button Interaction Demo</text>
        <text id="button-message" x="34" y="92" width="600" height="36" fontSize="17" color="#00D084">\${demo.message}</text>

        <shape id="counter-card" type="roundRect" x="34" y="146" width="330" height="170" fill="#162435" stroke="#284058" strokeWidth="1" radius="14" />
        <text id="counter-caption" x="58" y="170" width="280" height="30" fontSize="14" color="#8DA4BD">PRESS COUNT</text>
        <text id="counter-value" x="58" y="204" width="280" height="86" fontSize="64" weight="bold" color="#3D8BFF">\${demo.count}</text>

        <button id="add-one" x="430" y="146" width="320" height="56" background="#2455AA" radius="9" disabled="\${demo.locked}" onPress="set(demo.count, demo.count + 1); set(demo.message, 'Count incremented')">
            <text id="add-one-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Add One</text>
        </button>
        <button id="add-ten" x="430" y="216" width="320" height="56" background="#246B52" radius="9" disabled="\${demo.locked}" onPress="set(demo.count, demo.count + 10); set(demo.message, 'Added ten')">
            <text id="add-ten-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Add Ten</text>
        </button>
        <button id="lock-controls" x="430" y="286" width="320" height="56" background="#9A5B13" radius="9" onPress="toggle(demo.locked); set(demo.message, demo.locked ? 'Controls unlocked' : 'Controls locked')">
            <text id="lock-controls-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">\${demo.locked ? 'Unlock Counters' : 'Lock Counters'}</text>
        </button>
        <button id="reset-demo" x="430" y="356" width="320" height="56" background="#35475C" radius="9" onPress="reset(demo.count); reset(demo.locked); set(demo.message, 'Ready')">
            <text id="reset-demo-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Reset Demo</text>
        </button>

        <text id="disabled-note" x="34" y="352" width="330" height="60" fontSize="14" color="\${demo.locked ? '#FFB454' : '#71879D'}" wrap="true">
            \${demo.locked ? 'Disabled buttons ignore click actions.' : 'Hover and press feedback is provided by the simulator.'}
        </text>
    </page>
</app>
`;

const BINDING_DEMO = `<app name="Variable Binding Lab" width="800" height="480" scale="fit" background="#0A111B">
    <vars>
        <fam name="lab">
            <var name="enabled" type="boolean" value="true" />
            <var name="accent" type="color" value="#3D8BFF" />
            <var name="name" type="string" value="Bound Surface" />
            <var name="score" type="number" value="87" />
            <var name="icon" type="image" value="assets/room-icon.png" />
        </fam>
    </vars>

    <page id="lab" title="Binding Lab" initial="true" background="#0A111B">
        <shape id="lab-panel" type="roundRect" x="30" y="30" width="740" height="420" fill="#121F30" stroke="\${lab.accent}" strokeWidth="2" radius="18" visible="\${lab.enabled}" />
        <text id="lab-title" x="60" y="58" width="500" height="52" fontSize="30" weight="bold" color="#FFFFFF" visible="\${lab.enabled}">\${lab.name}</text>
        <img id="lab-icon" x="650" y="50" width="76" height="76" src="\${lab.icon}" fit="contain" radius="12" visible="\${lab.enabled}" />
        <text id="lab-score" x="60" y="126" width="300" height="96" fontSize="72" weight="bold" color="\${lab.accent}" visible="\${lab.enabled}">\${lab.score}</text>
        <text id="lab-description" x="60" y="232" width="620" height="58" fontSize="16" color="#9BB0C5" visible="\${lab.enabled}">
            This single scene is driven by boolean, color, string, number and image variables.
        </text>

        <button id="bind-toggle" x="60" y="322" width="190" height="54" background="#2455AA" radius="8" onPress="toggle(lab.enabled)">
            <text id="bind-toggle-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Toggle Surface</text>
        </button>
        <button id="bind-score" x="270" y="322" width="190" height="54" background="#246B52" radius="8" onPress="set(lab.score, lab.score + 5)">
            <text id="bind-score-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Add 5 Points</text>
        </button>
        <button id="bind-color" x="480" y="322" width="190" height="54" background="#9A5B13" radius="8" onPress="set(lab.accent, lab.accent == '#3D8BFF' ? '#FFB454' : '#3D8BFF')">
            <text id="bind-color-label" x="0" y="0" width="100%" height="100%" color="#FFFFFF" align="center" verticalAlign="middle">Swap Accent</text>
        </button>
        <text id="bind-hidden" x="60" y="396" width="640" height="30" fontSize="14" color="#FFB454" visible="\${!lab.enabled}">Surface is hidden. Toggle it back on.</text>
    </page>
</app>
`;

export const EXAMPLES = [
  {
    id: 'hello-world',
    title: 'Hello World',
    description: 'Minimal static page with text and shape primitives.',
    category: 'Fundamentals',
    assetPaths: [],
    source: HELLO_WORLD,
  },
  {
    id: 'temperature-monitor',
    title: 'Temperature Monitor',
    description: 'Room monitor with nested variables, dynamic colors, images and navigation.',
    category: 'Starter',
    assetPaths: ['assets/room-icon.png'],
    source: STARTER_SOURCE,
  },
  {
    id: 'multi-page-navigation',
    title: 'Multi-page Navigation',
    description: 'Three screens, action chaining, history and persistent variables.',
    category: 'Interaction',
    assetPaths: [],
    source: MULTI_PAGE,
  },
  {
    id: 'control-panel',
    title: 'Control Panel',
    description: 'Boolean and number controls with disabled and dynamic states.',
    category: 'Interaction',
    assetPaths: [],
    source: CONTROL_PANEL,
  },
  {
    id: 'dynamic-color-dashboard',
    title: 'Dynamic Color Dashboard',
    description: 'Colour bindings applied to shapes, borders and text at runtime.',
    category: 'Bindings',
    assetPaths: [],
    source: DYNAMIC_COLORS,
  },
  {
    id: 'image-gallery',
    title: 'Image Gallery',
    description: 'Image variable swapping with registered sample assets.',
    category: 'Assets',
    assetPaths: [
      'assets/gallery-sunset.png',
      'assets/gallery-mountains.png',
      'assets/gallery-city.png',
    ],
    source: IMAGE_GALLERY,
  },
  {
    id: 'button-interaction',
    title: 'Button Interaction Demo',
    description: 'Pressed, disabled, conditional labels and chained actions.',
    category: 'Interaction',
    assetPaths: [],
    source: BUTTON_DEMO,
  },
  {
    id: 'variable-binding-demo',
    title: 'Variable Binding Demo',
    description: 'Every EVE runtime type driving one live scene.',
    category: 'Bindings',
    assetPaths: ['assets/room-icon.png'],
    source: BINDING_DEMO,
  },
];

export function getExample(id) {
  return EXAMPLES.find((example) => example.id === id) || null;
}

export { HELLO_WORLD, MULTI_PAGE, CONTROL_PANEL, DYNAMIC_COLORS, IMAGE_GALLERY, BUTTON_DEMO, BINDING_DEMO };
