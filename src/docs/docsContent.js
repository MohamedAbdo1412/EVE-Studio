import { TAG_SPECS, VARIABLE_TYPES, LANGUAGE_VERSION, COMPILER_VERSION } from '../language/languageSpec.js';

/**
 * Documentation is data, not a second implementation. Component reference rows
 * are derived from languageSpec.js so the docs cannot drift from the compiler.
 */

export const DOC_GROUPS = [
  {
    id: 'start',
    title: 'Getting started',
    sections: ['overview'],
  },
  {
    id: 'language',
    title: 'Language',
    sections: [
      'syntax',
      'components',
      'expressions',
      'variables',
      'actions',
      'navigation',
      'bindings',
    ],
  },
  {
    id: 'workbench',
    title: 'Workbench',
    sections: ['simulator', 'diagnostics', 'laws'],
  },
  {
    id: 'build',
    title: 'Build & ship',
    sections: ['compiler', 'cpp', 'export'],
  },
  {
    id: 'reference',
    title: 'Reference',
    sections: ['limitations', 'acceptance'],
  },
];

export const DIAGNOSTIC_GROUPS = [
  {
    id: 'parse',
    title: 'Lexer and parser',
    description:
      'Structural diagnostics raised while characters become tokens and tokens become an AST. Parsing continues after many errors so one mistake does not hide the rest of the document.',
    codes: [
      ['EVE-P001', 'error', 'Expected an opening tag, or found a closing tag with no matching open element.'],
      ['EVE-P002', 'error', 'A closing tag is missing before EOF or before an ancestor closing tag.'],
      ['EVE-P004', 'error', 'The same attribute is declared twice on one element.'],
      ['EVE-P005', 'error', 'Non-whitespace text appears outside any component.'],
      ['EVE-P006', 'error', 'The document has more than one root element.'],
      ['EVE-P007', 'error', 'The document contains no root element.'],
      ['EVE-P008', 'error', 'Whitespace appears between "<" or "</" and the tag name.'],
      ['EVE-P010', 'error', 'A comment starts with "<!--" but never reaches "-->".'],
      ['EVE-P011', 'error', 'A tag name is missing after "<" or is not a valid identifier.'],
      ['EVE-P012', 'error', 'An opening tag is not closed with ">" or "/>".'],
      ['EVE-P013', 'error', 'A closing tag contains attributes, or an attribute name is missing.'],
      ['EVE-P014', 'error', 'An attribute is missing "=" or a quoted value.'],
      ['EVE-P015', 'error', 'An attribute value is not wrapped in single or double quotes.'],
      ['EVE-P016', 'error', 'A quoted attribute value starts but never closes before EOF.'],
    ],
    reserved: 'EVE-P003 and EVE-P009 are not emitted in language version 0.1.',
  },
  {
    id: 'expression',
    title: 'Expressions',
    description:
      'Expression diagnostics are attached to the interpolation or attribute value that contains them. The expression engine parses a small, typed grammar and never calls JavaScript.',
    codes: [
      ['EVE-E001', 'error', 'An interpolation or dynamic attribute starts "${" but never reaches "}".'],
      ['EVE-E002', 'error', 'An interpolation or expression is empty.'],
      ['EVE-E003', 'error', 'An unexpected token or character appears, including single "&" or "|" where "&&" or "||" is required.'],
      ['EVE-E004', 'error', 'A string literal starts but never closes.'],
      ['EVE-E005', 'error', 'An operator appears where an operand is required, for example "${1 + * 2}".'],
      ['EVE-E006', 'error', 'A numeric literal cannot be represented as a finite number.'],
      ['EVE-E007', 'error', 'A variable path ends with "." or has a missing segment after ".".'],
      ['EVE-E008', 'error', 'A ternary conditional is missing its ":" branch.'],
      ['EVE-E009', 'error', 'A grouped expression is missing its closing ")".'],
    ],
  },
  {
    id: 'semantic',
    title: 'Document and component semantics',
    description:
      'Semantic validation checks the AST against the EVE document model: root structure, tag nesting, identifiers, attributes, static values and dynamic bindings.',
    codes: [
      ['EVE-S001', 'error', 'Two pages or components declare the same component ID. IDs are unique across the whole document.'],
      ['EVE-S002', 'error', 'A tag is not in the EVE component set. Tag and attribute names are case-sensitive.'],
      ['EVE-S003', 'error', 'A tag appears in a parent that does not allow it, including nested pages and variables inside pages.'],
      ['EVE-S004', 'error', 'Literal text, an interpolation, or a UI child is in a position that only accepts elements or text content.'],
      ['EVE-S005', 'error', 'A page or component is missing its ID, or an identifier attribute is empty.'],
      ['EVE-S006', 'error', 'More than one <vars> block exists at the application root.'],
      ['EVE-S007', 'error', 'More than one page declares initial="true".'],
      ['EVE-S008', 'error', 'The root is not <app>, or the application contains no pages.'],
      ['EVE-S010', 'error', 'An attribute is not declared for that tag.'],
      ['EVE-S011', 'error', 'A "${...}" value is used on a static-only property, or a component ID is dynamic.'],
      ['EVE-S012', 'error', 'A required attribute is missing.'],
      ['EVE-S013', 'error', 'A number, integer or opacity value is invalid or outside its allowed range.'],
      ['EVE-S014', 'error', 'A boolean attribute is not exactly "true" or "false".'],
      ['EVE-S015', 'error', 'A color is not #RGB, #RGBA, #RRGGBB, #RRGGBBAA or transparent.'],
      ['EVE-S016', 'error', 'An enum attribute is not one of its declared values.'],
      ['EVE-S017', 'error', 'A component ID does not match the identifier rule.'],
      ['EVE-S020', 'info', 'No page declares initial="true"; the compiler selects the first page and reports this information.'],
    ],
    reserved: 'EVE-S009, EVE-S018 and EVE-S019 are not emitted in language version 0.1.',
  },
  {
    id: 'variables',
    title: 'Variables and types',
    description:
      'Variable diagnostics cover declaration names, type names, initial values, namespaces and references.',
    codes: [
      ['EVE-V001', 'error', 'An expression or action references a variable path that is not declared in <vars>.'],
      ['EVE-V002', 'error', 'An expression or action produces a type that is incompatible with its target. toggle() also requires a boolean.'],
      ['EVE-V003', 'error', 'A <var> or <fam> name is missing or does not match the variable identifier rule.'],
      ['EVE-V004', 'error', 'A variable type is missing or is not string, number, boolean, color or image.'],
      ['EVE-V005', 'error', 'A variable initial value is missing or does not parse as the declared type.'],
      ['EVE-V006', 'error', 'A variable path or family namespace is declared twice, or a variable collides with a family name.'],
    ],
  },
  {
    id: 'actions',
    title: 'Actions, navigation and assets',
    description:
      'Action validation happens at compile time. The runtime receives a validated action program, never source text to evaluate as JavaScript.',
    codes: [
      ['EVE-A001', 'error', 'An image or video source is not registered, or the registered asset has the wrong media type.'],
      ['EVE-A002', 'error', 'An asset path does not start with assets/ or contains unsupported characters.'],
      ['EVE-A010', 'error', 'onPress exists but contains no action.'],
      ['EVE-A011', 'error', 'An action list contains an empty action between semicolons.'],
      ['EVE-A012', 'error', 'An action is not written as name(arguments).'],
      ['EVE-A013', 'error', 'The action name is not navigate, back, set, toggle or reset.'],
      ['EVE-A014', 'error', 'An action has the wrong number of arguments.'],
      ['EVE-A015', 'error', 'navigate() does not receive a quoted page ID literal.'],
      ['EVE-A016', 'error', 'The first argument of set(), toggle() or reset() is not a bare dot-separated variable path.'],
      ['EVE-N001', 'error', 'A navigate() target is not a declared page ID.'],
      ['EVE-H001', 'warning', 'A <vid> component is preview-only and is not supported by the intended embedded target in version 0.1.'],
    ],
  },
  {
    id: 'layout',
    title: 'Layout',
    description:
      'Layout validation protects the logical coordinate system resolved by the compiler.',
    codes: [
      ['EVE-L001', 'error', 'A dimension is malformed, a width or height is not positive, or a radius, stroke width or border width is negative. Pages cannot use percentage width or height.'],
      ['EVE-L002', 'warning', 'A negative x or y coordinate places a component outside its parent. The value is accepted but may clip.'],
    ],
  },
  {
    id: 'runtime',
    title: 'Runtime',
    description:
      'Runtime codes appear in the simulator log and in binding evaluation messages. They do not invalidate the compiled scene; they describe a failed evaluation or action at run time.',
    codes: [
      ['EVE-R001', 'runtime error', 'A binding evaluates a variable path that is not registered in the runtime.'],
      ['EVE-R002', 'runtime error', 'An expression node or operator is invalid.'],
      ['EVE-R003', 'runtime error', 'An operand has the wrong type, or a condition is not boolean.'],
      ['EVE-R004', 'runtime error', 'Division or modulo by zero.'],
      ['EVE-R005', 'runtime error', 'Comparison operands are not two numbers or two strings of the same type.'],
      ['EVE-R006', 'runtime error', 'A numeric result is not finite.'],
      ['EVE-RT001', 'runtime error', 'A value does not satisfy its declared variable type.'],
      ['EVE-RT002', 'runtime error', 'An action targets a variable that does not exist in the runtime registry.'],
      ['EVE-RT003', 'runtime error', 'An unknown action reached the executor.'],
    ],
  },
];

export const LANGUAGE_LAWS = [
  {
    code: 'L001',
    title: 'Logical pixel geometry',
    text: 'Geometry is expressed in logical pixels. Dimensions are numbers with an optional px or % suffix. Widths and heights must be positive; radii, stroke widths and border widths cannot be negative. Pages are always positive pixel dimensions.',
  },
  {
    code: 'L002',
    title: 'Coordinate containment',
    text: 'Components are positioned in their parent coordinate space. Percentage dimensions resolve against the parent. Negative x or y coordinates are accepted with a warning because they may place content outside the visible parent.',
  },
  {
    code: 'L003',
    title: 'One application root',
    text: 'A document contains exactly one <app> root. The root declares the logical resolution and application defaults.',
  },
  {
    code: 'L004',
    title: 'One variable block',
    text: 'An application may contain at most one <vars> block. Pages are direct children of <app> and are never nested.',
  },
  {
    code: 'L005',
    title: 'Declaration before reference',
    text: 'Every variable referenced by an expression, binding or action must be declared in <vars>. A reference to an unknown path is a compile error.',
  },
  {
    code: 'L006',
    title: 'Strong variable types',
    text: 'Every variable has one of five types: string, number, boolean, color or image. Initial values, expressions and action assignments must agree with that type.',
  },
  {
    code: 'L007',
    title: 'Static identity',
    text: 'Component IDs and page IDs are compile-time identifiers. IDs are unique across all pages, cannot contain interpolation, and are used for selection, bindings and inspector tooling.',
  },
  {
    code: 'L008',
    title: 'Closed component set',
    text: 'Only app, vars, fam, var, page, group, text, img, vid, button and shape are EVE tags. Unknown tags are rejected; names are case-sensitive.',
  },
  {
    code: 'L009',
    title: 'Declared nesting',
    text: 'Each tag has a fixed child set. Pages contain UI components, buttons and groups contain UI components, text accepts only literal text and interpolation, and variable declarations live only inside <vars>.',
  },
  {
    code: 'L010',
    title: 'Text is data',
    text: 'Text content is literal data with ${...} interpolation. It is never markup, script or a template language with control blocks, and <text> cannot contain UI children.',
  },
  {
    code: 'L011',
    title: 'Binding eligibility',
    text: 'Only properties marked dynamic by the language specification accept ${...} values. Text content is always eligible for interpolation. Static-only properties reject dynamic expressions.',
  },
  {
    code: 'L012',
    title: 'Pure expressions',
    text: 'Expressions are literals, variable paths, grouping, unary operators, arithmetic, comparisons, logical operators and the ternary conditional. There are no function calls, assignments, loops, property methods or side effects.',
  },
  {
    code: 'L013',
    title: 'No arbitrary JavaScript',
    text: 'The browser never calls eval(), new Function() or a JavaScript engine to execute EVE source. Parsing, type checking and evaluation are implemented by the EVE toolchain.',
  },
  {
    code: 'L014',
    title: 'Declarative actions',
    text: 'Interaction is data. Buttons may execute navigate, back, set, toggle and reset. Actions are parsed and type-checked before they reach the runtime, and they run in source order.',
  },
  {
    code: 'L015',
    title: 'Literal navigation targets',
    text: 'navigate() requires a quoted page ID literal that exists at compile time. Computed navigation targets are not part of language version 0.1.',
  },
  {
    code: 'L016',
    title: 'History stack semantics',
    text: 'navigate() pushes the active page onto history. back() pops one page. Navigating to the active page is a no-op and does not push duplicate history.',
  },
  {
    code: 'L017',
    title: 'Variables outlive pages',
    text: 'Runtime variables belong to the application session, not to a page. Navigation and back() never reset variable values. Only an explicit reset action, Reset all, or loading a new project restores initial values.',
  },
  {
    code: 'L018',
    title: 'Bindings are the runtime path',
    text: 'The compiler extracts a binding table and a variable dependency index. Editing a runtime variable re-evaluates bindings only; it never invokes the lexer or parser.',
  },
  {
    code: 'L019',
    title: 'Registered assets',
    text: 'Every image and video source must be registered in the asset manifest. Asset paths must start with assets/ and use a supported filename.',
  },
  {
    code: 'L020',
    title: 'Preview and target boundary',
    text: 'The browser simulator is a design preview, not an FPGA, HDMI or physical-device runtime. Video is preview-only in version 0.1 and is reported as unsupported by the embedded target.',
  },
  {
    code: 'L021',
    title: 'Deterministic output',
    text: 'Variable IDs are deterministic FNV-1a hashes of their full paths with collision probing. Compiler reports carry a source hash, and ZIP timestamps are fixed so a repeated export is stable.',
  },
  {
    code: 'L022',
    title: 'Last good preview',
    text: 'A failed compile never destroys the last valid scene, runtime values or generated API. The simulator keeps the last valid scene and marks it stale until the source compiles again.',
  },
];

export const COMPONENT_DOCS = Object.values(TAG_SPECS).map((spec) => ({
  tag: spec.tag,
  summary: spec.summary,
  children: spec.children || [],
  textOnly: Boolean(spec.textOnly),
  experimental: Boolean(spec.experimental),
  attributes: Object.entries(spec.attributes || {}).map(([name, attribute]) => ({
    name,
    type: attribute.type,
    required: Boolean(attribute.required),
    dynamic: Boolean(attribute.dynamic) || name === 'text',
    defaultValue:
      attribute.default === undefined
        ? attribute.inherits
          ? `inherits ${attribute.inherits}`
          : '—'
        : String(attribute.default),
    allowed: attribute.values ? attribute.values.join(', ') : '',
  })),
  examples: spec.examples || [],
}));

export const DOC_SECTIONS = [
  {
    id: 'overview',
    title: 'Overview',
    lead: 'EVE Studio is a browser workbench for the EVE UI Language: a live editor, a real compiler pipeline, an interactive runtime simulator, a generated MCU API and an exportable intermediate package.',
    blocks: [
      {
        type: 'cards',
        items: [
          {
            title: 'Live compiler',
            text: 'A character lexer, recursive-descent parser, semantic analyser, binding extractor and layout resolver run on every debounced edit.',
          },
          {
            title: 'Interactive simulator',
            text: 'Real navigation history, typed variables, live bindings, button states and a stale-preview policy for failed compiles.',
          },
          {
            title: 'Generated C++ API',
            text: 'A transport-independent client header, transport interface and project-specific setter class with deterministic variable IDs.',
          },
          {
            title: 'Intermediate package',
            text: 'A deterministic ZIP with scene, variables, bindings, navigation, asset manifest, compiler report and firmware headers.',
          },
        ],
      },
      {
        type: 'h2',
        text: 'What runs where',
      },
      {
        type: 'p',
        text: 'Everything in this repository runs in the browser. Source, assets and project state are stored in local storage. There is no server, no account, no remote compiler and no hardware connection.',
      },
      {
        type: 'code',
        title: 'Compilation pipeline',
        language: 'text',
        code: `EVE source
  → character lexer        tokens with 1-based locations
  → parser                 AST and structural diagnostics
  → semantic analysis      document, components, types, actions, assets
  → binding extraction     dynamic property table + dependency index
  → layout resolution      scene tree + initial boxes
  → asset manifest         usage, missing assets, processing intent
  → C++ generation         EVETransport.h, EVEClient.h, project header
  → package export         deterministic ZIP (JSZip)`,
      },
      {
        type: 'note',
        tone: 'warning',
        title: 'Browser prototype, not FPGA hardware',
        text: 'The simulator is a browser rendering of a logical display. It is not an FPGA bitstream, HDMI pipeline, SPI driver, physical display or production firmware. Generated C++ is a draft API and the wire protocol is provisional.',
      },
      {
        type: 'h2',
        text: 'Quick start',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Open the Studio. The starter project compiles automatically after the editor loads.',
          'Click a component in the simulator or the explorer to inspect its resolved properties.',
          'Edit a runtime variable in the Variables tab and watch text, colors, sizes and visibility update without recompiling source.',
          'Press a button to execute its onPress actions. Use Back to walk the history stack.',
          'Open Generated C++ to inspect the class produced from the current variable registry.',
          'Make a deliberate syntax error. Diagnostics appear, the last valid scene remains visible and is marked stale.',
          'Fix the source, then export a ZIP from the toolbar.',
        ],
      },
      {
        type: 'table',
        headers: ['Surface', 'Version', 'Notes'],
        rows: [
          ['Language', LANGUAGE_VERSION, 'EVE UI Language 0.1'],
          ['Compiler', COMPILER_VERSION, 'Browser-side pipeline and report'],
          ['Runtime', '0.1', 'Browser preview only'],
          ['Storage', 'localStorage', 'Project source, assets as data URLs, save backup'],
          ['Package', '1.0', 'Intermediate software package, not a bitstream'],
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Persistence',
        text: 'The editor debounces source changes into local storage. Clearing or importing a new project keeps a one-slot backup before replacing the current source. Large uploaded assets can exhaust browser storage; the toolbar reports a save failure instead of silently losing work.',
      },
    ],
  },
  {
    id: 'syntax',
    title: 'Language and syntax',
    lead: 'EVE is an XML-like declarative language with a small expression grammar. Tags and attributes are case-sensitive. Every dynamic value is explicit.',
    blocks: [
      {
        type: 'h2',
        text: 'Document shape',
      },
      {
        type: 'code',
        title: 'Minimal application',
        language: 'eve',
        code: `<app name="Hello" width="800" height="480" scale="fit" background="#101820">
    <vars>
        <fam name="ui">
            <var name="message" type="string" value="Hello, EVE." />
            <var name="accent" type="color" value="#00D084" />
        </fam>
    </vars>

    <page id="home" title="Home" initial="true">
        <text id="title" x="40" y="40" width="720" height="80"
              fontSize="48" weight="bold" color="\${ui.accent}">
            \${ui.message}
        </text>
    </page>
</app>`,
      },
      {
        type: 'list',
        items: [
          'Exactly one <app> root declares name, width, height, scale (fit, fill, none) and background.',
          'At most one <vars> block declares families and variables. Families create dot-separated paths.',
          'One or more <page> elements are direct children of <app>. Exactly one page may declare initial="true".',
          'Only page, group, text, img, vid, button and shape are UI components.',
          'Whitespace-only text between tags is ignored. Non-whitespace text outside a component is an error.',
        ],
      },
      {
        type: 'h2',
        text: 'Tags, attributes and values',
      },
      {
        type: 'list',
        items: [
          'Every attribute must have a quoted value. Single and double quotes are both accepted.',
          'A component ID is required on page, group, text, img, vid, button and shape. IDs use letters, digits, underscores and hyphens, and cannot start with a digit.',
          'Attribute names are case-sensitive. Unknown attributes are compile errors.',
          'Static colors accept #RGB, #RGBA, #RRGGBB, #RRGGBBAA or transparent.',
          'Static dimensions are numbers with an optional px or % suffix. A bare number is logical pixels.',
          'Comments use <!-- ... -->. XML entities such as &amp; &lt; &gt; &quot; &apos; and numeric entities are decoded in text and attribute values.',
        ],
      },
      {
        type: 'h2',
        text: 'Dynamic values',
      },
      {
        type: 'p',
        text: 'A property marked dynamic in the component reference accepts a `${...}` expression. Text content may mix literal text and any number of interpolations. Static-only properties reject interpolation with EVE-S011.',
      },
      {
        type: 'code',
        title: 'Bindings and text interpolation',
        language: 'eve',
        code: `<shape id="status-dot" type="circle" x="32" y="32" width="12" height="12"
       fill="\${ui.enabled ? '#00FF88' : '#FFB454'}"
       visible="\${ui.enabled}" />

<text id="summary" x="60" y="28" width="500" height="40" color="#FFFFFF">
    Room \${ui.name} is \${ui.enabled ? 'online' : 'offline'}.
</text>`,
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Escaping in JavaScript',
        text: 'In the Studio editor write a literal dollar-brace expression. Inside JavaScript template literals in this repository, the sequence is escaped as \\${...} so the documentation source itself is valid JavaScript. The language sees ${...}.',
      },
      {
        type: 'h2',
        text: 'Tag semantics',
      },
      {
        type: 'p',
        text: 'The complete generated reference below lists each tag, its allowed children, every attribute, defaults, required flags and dynamic eligibility. It is rendered directly from the compiler language specification.',
      },
    ],
  },
  {
    id: 'components',
    title: 'Component reference',
    lead: 'The component reference is generated from the same specification object the compiler and editor use. Attribute types, defaults, required flags and dynamic support therefore cannot drift from validation.',
    blocks: [{ type: 'components' }],
  },
  {
    id: 'expressions',
    title: 'Expressions',
    lead: 'Expressions are parsed into an AST and evaluated by the EVE evaluator. They are pure: no calls, no assignments, no loops and no arbitrary JavaScript.',
    blocks: [
      {
        type: 'table',
        headers: ['Operator', 'Precedence', 'Operands', 'Result'],
        rows: [
          ['!', 'unary', 'boolean', 'boolean'],
          ['-', 'unary', 'number', 'number'],
          ['* / %', 'multiplicative', 'number, number', 'number'],
          ['+ -', 'additive', 'number + number, or a string on either side', 'number or string'],
          ['< > <= >=', 'comparison', 'two numbers or two strings', 'boolean'],
          ['== !=', 'equality', 'any two values', 'boolean (strict equality)'],
          ['&& ||', 'logical', 'boolean, boolean', 'boolean, short-circuit'],
          ['condition ? a : b', 'conditional', 'boolean condition', 'type of branches'],
          ['( ... )', 'grouping', 'expression', 'same value'],
        ],
      },
      {
        type: 'h2',
        text: 'Literals and variables',
      },
      {
        type: 'list',
        items: [
          'Numbers: 0, 42, 3.5, .5, 1e3, and negative values through unary minus.',
          'Strings: single or double quoted, with \\n, \\t, \\r, \\\\ and escaped quotes.',
          'Booleans: true and false. Null is accepted as a value but is not a valid variable type.',
          'Variables: bare dot-separated paths such as room.temperature or page12.room12.icon.',
          'There are no function calls, array literals, object literals, property access beyond a variable path or comments inside expressions.',
        ],
      },
      {
        type: 'code',
        title: 'Expression examples',
        language: 'eve',
        code: `<text id="temperature" color="\${room.temperature > 32 ? '#FF6B6B' : '#00D084'}">
    \${room.temperature}°C · \${room.temperature >= 30 ? 'Warm' : 'Nominal'}
</text>

<shape id="bar" type="roundRect" x="40" y="200"
       width="\${level.value}%" height="12"
       fill="\${level.value > 80 ? '#FFB454' : '#00D084'}" />`,
      },
      {
        type: 'h2',
        text: 'Typing',
      },
      {
        type: 'p',
        text: 'The compiler infers an expression type and compares it with the target property type. A color property accepts a color variable or a string expression; an asset property accepts a string or image expression; a dimension accepts a number or numeric string. A conditional whose branches have different non-null types is reported as mixed and can be rejected by a strict target.',
      },
      {
        type: 'note',
        tone: 'warning',
        title: 'Runtime evaluation can still fail',
        text: 'Static type checks cannot prove every division is non-zero or every guard is sufficient. Evaluation failures are reported as EVE-R001 through EVE-R006 in the runtime log, and the affected binding falls back to its declared default where one exists.',
      },
    ],
  },
  {
    id: 'variables',
    title: 'Variables',
    lead: 'Variables are typed, namespaced and persistent for the life of the runtime session. Editing one re-evaluates bindings without recompiling source.',
    blocks: [
      {
        type: 'table',
        headers: ['Type', 'Initial value rule', 'Typical bindings', 'C++ argument'],
        rows: [
          ['string', 'Any text.', 'Text, labels, captions', 'const std::string&'],
          ['number', 'A finite decimal, including exponent notation.', 'Position, size, opacity, counters', 'float'],
          ['boolean', 'Exactly true or false.', 'Visibility, disabled, conditions', 'bool'],
          ['color', 'A color literal.', 'Fill, stroke, text, border', 'uint32_t (packed RGBA)'],
          ['image', 'A registered asset path.', 'img src, image picker', 'const std::string& (asset path)'],
        ],
      },
      {
        type: 'code',
        title: 'Families and paths',
        language: 'eve',
        code: `<vars>
    <fam name="page12">
        <fam name="room12">
            <var name="temperature" type="number" value="30" />
            <var name="enabled" type="boolean" value="true" />
        </fam>
    </fam>
    <var name="title" type="string" value="Dashboard" />
</vars>`,
      },
      {
        type: 'list',
        items: [
          'The code above declares page12.room12.temperature, page12.room12.enabled and title.',
          'Family and variable segments use letters, digits and underscores, cannot start with a digit, and are case-sensitive.',
          'A variable path must be unique. A variable cannot share a name with a family in the same namespace.',
          'Every variable requires both a type and an initial value. An image initial value must resolve to a registered asset at compile time.',
          'The compiler reports initial values back into the generated C++ API and the variables.json package file.',
        ],
      },
      {
        type: 'h2',
        text: 'Deterministic IDs',
      },
      {
        type: 'p',
        text: 'Each variable receives a 32-bit FNV-1a hash of its full dot-separated path. Zero and collisions are resolved by deterministic probing. IDs are stable across recompilations and independent of declaration order, which lets an MCU target address variables without shipping their names.',
      },
      {
        type: 'h2',
        text: 'Runtime editing',
      },
      {
        type: 'list',
        items: [
          'Number variables use a stepper and a numeric field. Invalid drafts revert to the current value.',
          'Boolean variables use a true/false switch.',
          'Color variables use a color picker plus a text field that accepts EVE color syntax.',
          'Image variables select from registered assets; a missing current value remains visible but is not silently replaced.',
          'String variables edit inline. Every accepted change re-evaluates the binding table and updates the scene immediately.',
          'Reset restores one variable. Reset all restores every variable and returns navigation to the initial page.',
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Recompiles preserve compatible values',
        text: 'When source recompiles, the runtime merges the new registry. Existing values survive when the path and declared type still validate; incompatible or removed paths fall back to their declared initial value.',
      },
    ],
  },
  {
    id: 'actions',
    title: 'Actions',
    lead: 'Buttons execute a validated, ordered action list. Actions are data produced by the compiler, never source text handed to JavaScript.',
    blocks: [
      {
        type: 'table',
        headers: ['Action', 'Arguments', 'Behaviour', 'Diagnostics'],
        rows: [
          ['navigate(pageId)', 'one quoted page ID literal', 'Push the active page onto history and activate the target.', 'A014, A015, N001'],
          ['back()', 'none', 'Pop one page from history. No-op when history is empty.', 'A014'],
          ['set(path, expression)', 'bare variable path, typed expression', 'Evaluate the expression and assign the typed value.', 'A014, A016, V001, V002'],
          ['toggle(path)', 'bare boolean variable path', 'Flip a boolean value.', 'A014, A016, V001, V002'],
          ['reset(path)', 'bare variable path', 'Restore the declared initial value.', 'A014, A016, V001'],
        ],
      },
      {
        type: 'code',
        title: 'Chained actions',
        language: 'eve',
        code: `<button id="open-detail" x="40" y="300" width="240" height="56"
        onPress="set(nav.visits, nav.visits + 1); set(nav.lastPage, 'Detail'); navigate('detail')">
    <text id="open-detail-label" x="0" y="0" width="100%" height="100%"
          color="#FFFFFF" align="center" verticalAlign="middle">
        Open Detail
    </text>
</button>`,
      },
      {
        type: 'list',
        items: [
          'Separate actions with semicolons. Actions run in order and later actions see earlier variable changes.',
          'Empty actions, trailing duplicate semicolons and malformed calls are compile errors.',
          'navigate() cannot compute its target at runtime. Use a quoted literal that names a declared page.',
          'set() takes exactly two arguments. The first is a bare path; the second is an expression.',
          'toggle() and reset() take exactly one bare path. toggle() additionally requires a boolean variable.',
          'A disabled button ignores its onPress actions in the simulator.',
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Failure isolation',
        text: 'At runtime, each action is attempted independently. An evaluation error is recorded and the action list continues, so a failed set() does not prevent a following navigate(). The runtime log lists the failed action and its code.',
      },
    ],
  },
  {
    id: 'navigation',
    title: 'Navigation and history',
    lead: 'The simulator implements a real page history stack. Pages are display surfaces, not separate variable scopes.',
    blocks: [
      {
        type: 'list',
        items: [
          'The initial page is the page with initial="true". If none is declared, the first page is selected with an EVE-S020 information diagnostic.',
          'navigate(pageId) pushes the currently active page and activates the target. Navigating to the current page returns ok with changed=false and does not push history.',
          'back() pops one valid page from the stack. An empty stack is a no-op, not a crash.',
          'The preview header shows the current breadcrumb. The Back control is disabled when the stack is empty.',
          'Every page remains in the scene. Navigation changes the active page only; it does not recompile, rerun bindings from scratch or reset variables.',
          'Reset all returns navigation to the compiled initial page and clears history.',
        ],
      },
      {
        type: 'table',
        headers: ['Event', 'History effect', 'Variable effect'],
        rows: [
          ['Initial compile', 'Empty stack, initial page active', 'Registry initial values loaded'],
          ['navigate("gallery")', 'Push current page', 'Values preserved'],
          ['back()', 'Pop previous page', 'Values preserved'],
          ['Recompile (valid)', 'Active page kept when it still exists', 'Compatible values preserved'],
          ['Reset all', 'Clear history, initial page active', 'All initial values restored'],
          ['Load example/project', 'New runtime session', 'New registry initial values'],
        ],
      },
    ],
  },
  {
    id: 'bindings',
    title: 'Bindings and the runtime',
    lead: 'Bindings are the contract between static structure and mutable values. The compiler records them once; the runtime evaluates them on every variable change.',
    blocks: [
      {
        type: 'code',
        title: 'A binding and its dependencies',
        language: 'eve',
        code: `<text id="status" color="\${room.enabled ? '#00D084' : '#FFB454'}">
    Room \${room.name} is \${room.enabled ? 'online' : 'offline'}
</text>`,
      },
      {
        type: 'list',
        items: [
          'The compiler emits descriptors for resolved properties. A static descriptor stores a value; a binding descriptor stores a binding ID and its template segments.',
          'Each binding records its component, property, source template, expected type, inferred type, dependencies and expression AST.',
          'The dependency index maps every variable path to the bindings that read it.',
          'BindingEngine.evaluateAll evaluates every binding for a full scene refresh. evaluateChanged is the incremental path reserved for a changed-path set.',
          'A single expression in a single property preserves its typed value. Mixed text interpolation produces a string.',
          'Runtime evaluation errors do not alter the compiled scene. The affected property uses its fallback and the error is logged.',
        ],
      },
      {
        type: 'h2',
        text: 'What recompiles',
      },
      {
        type: 'table',
        headers: ['Change', 'Parser', 'Semantic checks', 'Binding table', 'Runtime values'],
        rows: [
          ['Runtime variable edit', 'No', 'No', 'Reused', 'Changed path updated'],
          ['Button action', 'No', 'No', 'Reused', 'Set/toggle/reset applied'],
          ['Navigation', 'No', 'No', 'Reused', 'Preserved'],
          ['Source edit', 'Yes, debounced', 'Yes', 'Rebuilt', 'Compatible values merged'],
          ['Asset upload/removal', 'Yes, debounced compile', 'Asset checks rerun', 'Rebuilt', 'Compatible values merged'],
        ],
      },
      {
        type: 'note',
        tone: 'success',
        title: 'Stale preview policy',
        text: 'If a source edit does not compile, the Studio keeps the last valid scene, binding table, generated C++ and runtime values. The preview is explicitly marked STALE and every current diagnostic remains available until the next valid compile.',
      },
    ],
  },
  {
    id: 'simulator',
    title: 'Simulator',
    lead: 'The simulator renders the compiled scene at its logical resolution and scales it into the available stage. It is a design preview, not a device emulator.',
    blocks: [
      {
        type: 'cards',
        items: [
          {
            title: 'Stage and scaling',
            text: 'The page is rendered at its logical width and height, then scaled with fit, fill or none. Clicking the stage selects the component under the pointer.',
          },
          {
            title: 'Page tabs',
            text: 'Every compiled page is available in the preview header. Tabs navigate through the same history manager as navigate() actions.',
          },
          {
            title: 'Runtime inspector',
            text: 'Variables, component properties, bindings and the compiler report are available in the right-hand inspector.',
          },
          {
            title: 'Diagnostics',
            text: 'Errors, warnings and information diagnostics are listed below the editor. Clicking a row reveals the source location.',
          },
        ],
      },
      {
        type: 'h2',
        text: 'Interaction model',
      },
      {
        type: 'list',
        items: [
          'Buttons receive pointer and keyboard focus, show hover/press feedback from the browser and ignore actions while disabled.',
          'group components clip only when clip="true". They establish a coordinate reference but are not scroll containers.',
          'Opacities are clamped to 0–1 in the browser renderer. Missing assets render an explicit "Missing asset" placeholder rather than a blank box.',
          'Text uses browser font rendering. This is not an FPGA glyph-atlas implementation.',
          'Video renders through the browser video element and carries a PREVIEW ONLY badge. It emits EVE-H001 at compile time.',
          'The runtime log records the last eight actions, navigation events and compile/runtime failures.',
        ],
      },
      {
        type: 'h2',
        text: 'Assets',
      },
      {
        type: 'list',
        items: [
          'The explorer accepts PNG, JPG, WebP, MP4 and WebM uploads.',
          'Uploaded binaries are stored as data URLs under assets/<filename>. Names are sanitized and collisions receive a numeric suffix.',
          'Asset metadata includes path, media type, byte size, image dimensions when available, source and usage references.',
          'Removing an asset does not rewrite source. A missing reference becomes EVE-A001 on the next compile.',
          'The demo assets used by examples are generated in the browser with canvas so the repository carries no binary fixtures.',
        ],
      },
    ],
  },
  {
    id: 'diagnostics',
    title: 'Diagnostics reference',
    lead: 'Diagnostics are structured objects with a stable code, severity, message, 1-based source location, optional hint, source stage and compiler stage. Clicking a diagnostic in the Studio reveals its line and column.',
    blocks: [
      {
        type: 'table',
        headers: ['Severity', 'Meaning', 'Effect'],
        rows: [
          ['error', 'The document or a referenced capability is invalid.', 'Compilation is not valid. The preview remains on the last valid scene and export is blocked.'],
          ['warning', 'The document compiles, but a documented risk or boundary applies.', 'Compilation is valid. Export remains available.'],
          ['info', 'A compiler decision that the author may want to make explicit.', 'Compilation is valid.'],
        ],
      },
      {
        type: 'table',
        headers: ['Compiler stage', 'What it validates', 'Typical codes'],
        rows: [
          ['lex', 'Characters, tags, attributes, quoted values, comments', 'P001–P016, E001–E009'],
          ['parse', 'Element nesting, root structure, text fragments and interpolation splitting', 'P001, P002, P005–P007, E001, E002'],
          ['document', 'Root, app configuration, one vars block, page identity and initial page', 'S003–S008, S010, S012, S015, S016, S020'],
          ['components', 'IDs, attributes, nesting, dynamic eligibility, text content', 'S001–S005, S010–S017, E001–E009'],
          ['variables', 'Names, types, initial values, paths and collisions', 'V003–V006'],
          ['actions', 'Action syntax, arguments, references, navigation targets and assignment types', 'A010–A016, N001, V001, V002'],
          ['layout', 'Dimensions, positivity and negative placement', 'L001, L002'],
          ['assets', 'Registration, media type and image variable values', 'A001, A002, H001'],
        ],
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Reserved codes',
        text: 'P003, P009, S009, S018 and S019 are reserved and are not emitted in version 0.1. They are omitted below rather than documented as working behaviour.',
      },
      { type: 'diagnostics' },
    ],
  },
  {
    id: 'laws',
    title: 'Language laws',
    lead: 'The twenty-two laws are the normative design rules behind the compiler, runtime and documentation. EVE-L001 and EVE-L002 are also diagnostic codes; the remaining laws are enforced by the stages named in their text.',
    blocks: [
      {
        type: 'p',
        text: 'These laws are intentionally narrow. A feature that does not appear here is not part of language version 0.1, and the workbench does not simulate it.',
      },
      { type: 'laws' },
    ],
  },
  {
    id: 'compiler',
    title: 'Compiler',
    lead: 'The compiler is a real browser-side pipeline. It does not extract tags with regular expressions and it never executes source.',
    blocks: [
      {
        type: 'table',
        headers: ['Stage', 'Input', 'Output', 'Stops on error?'],
        rows: [
          ['Lexer', 'Source characters', 'Tag, attribute, value, text, comment and EOF tokens with locations', 'Recovers and continues'],
          ['Parser', 'Tokens', 'AST, text fragments, interpolation nodes, structural diagnostics', 'Recovers and continues'],
          ['Semantic analysis', 'AST + language specification + assets', 'App config, pages, variable registry, validated actions, diagnostics', 'Collects all errors'],
          ['Bindings', 'AST binding metadata', 'Binding list, by-ID map, dependency index, serializable table', 'Uses validated metadata'],
          ['Layout', 'Pages + bindings + registry', 'Scene tree, initial boxes, layout statistics', 'Defaults invalid geometry'],
          ['Assets', 'Assets + scene + registry', 'Usage references, missing list, processing intent', 'Reports missing assets'],
          ['C++ generation', 'App config + registry + diagnostics', 'Transport header, client header, project header, setters', 'Still emits a draft'],
        ],
      },
      {
        type: 'h2',
        text: 'Determinism',
      },
      {
        type: 'list',
        items: [
          'Variable IDs use a 32-bit FNV-1a hash of the full path, with deterministic collision probing.',
          'The compiler report includes sourceHash, a FNV-1a hash of the entire source.',
          'Diagnostics are deduplicated by code, line, column and message, then sorted by position and code.',
          'The export uses fixed ZIP date metadata so repeated exports of the same content are stable.',
          'Compiler and asset timings are measured with performance.now when available and rounded for display.',
        ],
      },
      {
        type: 'code',
        title: 'Compile result shape (selected fields)',
        language: 'json',
        code: `{
  "valid": true,
  "counts": { "error": 0, "warning": 0, "info": 0 },
  "registry": [{ "path": "room.temperature", "type": "number", "id": 3735928559 }],
  "pages": [{ "id": "home", "title": "Room Monitor", "initial": true }],
  "bindings": { "bindings": [], "dependencyIndex": {} },
  "scene": { "initialPage": "home", "pages": [] },
  "cpp": { "className": "EveRoomMonitorClient", "methods": [] },
  "report": { "stages": [], "hardware": { "fpgaBitstream": false } }
}`,
      },
      {
        type: 'note',
        tone: 'info',
        title: 'Last-good build',
        text: 'The Studio stores the last valid compile result separately from the current result. Diagnostics and compiler status always describe the current source; the preview, C++ tab and export describe the last valid build until a newer source compiles.',
      },
    ],
  },
  {
    id: 'cpp',
    title: 'Generated C++ API',
    lead: 'The compiler emits a provisional, transport-independent MCU API. It is a starting point for integration, not firmware and not a finalized protocol.',
    blocks: [
      {
        type: 'table',
        headers: ['File', 'Purpose', 'Key content'],
        rows: [
          ['EVETransport.h', 'Transport boundary', 'Abstract write(const uint8_t*, size_t) and optional packet-drop hook'],
          ['EVEClient.h', 'Protocol draft', 'SET_VARIABLE packet framing, typed setters, CRC16-CCITT-FALSE, sequence number'],
          ['<Project>.h', 'Project API', 'One constant and typed setter per variable, VariableInfo registry, usage comment'],
        ],
      },
      {
        type: 'code',
        title: 'Generated setter shape',
        language: 'cpp',
        code: `class EveRoomMonitorClient {
public:
    static constexpr uint32_t kPage12Room12Temperature = 0x1234ABCDu; // page12.room12.temperature

    explicit EveRoomMonitorClient(EVE::EVEClient& client) : client_(client) {}

    void setPage12Room12Temperature(float value) {
        client_.setFloat(kPage12Room12Temperature, value);
    }

private:
    EVE::EVEClient& client_;
};`,
      },
      {
        type: 'code',
        title: 'Usage sketch',
        language: 'cpp',
        code: `#include "EveRoomMonitor.h"

MyTransport transport;              // implements EVE::EVETransport
EVE::EVEClient client(transport);
EveRoomMonitorClient ui(client);

void setup() {
    ui.setPage12Room12Temperature(30.0f);
}

void loop() {
    // Read a sensor and send a typed variable update.
}`,
      },
      {
        type: 'h2',
        text: 'Provisional packet draft',
      },
      {
        type: 'table',
        headers: ['Field', 'Size', 'Encoding'],
        rows: [
          ['magic', '2 bytes', '0x45 0x56 ("EV")'],
          ['version', '1 byte', '0x01'],
          ['opcode', '1 byte', '0x01 SET_VARIABLE'],
          ['payloadLength', '2 bytes', 'Little-endian'],
          ['sequence', '2 bytes', 'Little-endian, incremented per packet'],
          ['payload', 'N bytes', 'uint32 variable ID, uint8 type, encoded value'],
          ['crc16', '2 bytes', 'Little-endian CRC16-CCITT-FALSE over header and payload'],
        ],
      },
      {
        type: 'list',
        items: [
          'boolean encodes as uint8 0 or 1.',
          'number encodes as IEEE-754 float32 little-endian.',
          'color encodes as uint32 little-endian.',
          'string and image encode as UTF-8 bytes; image values are asset paths.',
          'The generator names image setters with setImage so the wire type remains kImage.',
        ],
      },
      {
        type: 'note',
        tone: 'warning',
        title: 'Not a hardware specification',
        text: 'No SPI, UART, USB, FPGA, HDMI or display driver is included. The packet framing, CRC coverage and image delivery model are provisional. Do not treat generated headers as production firmware or as a validated interoperability contract.',
      },
    ],
  },
  {
    id: 'export',
    title: 'Package export',
    lead: 'Export produces a deterministic ZIP of the last valid build: scene, variables, bindings, navigation, assets, reports and firmware API headers.',
    blocks: [
      {
        type: 'table',
        headers: ['Path', 'Content'],
        rows: [
          ['manifest.json', 'Package format, project name, versions, logical resolution, initial page, asset summary, API file list, notAFpgaBitstream'],
          ['scene.json', 'App, pages and serialized component tree with static/binding property descriptors, layout and actions'],
          ['variables.json', 'Variable IDs, hex IDs, paths, types, initial values and declaration locations'],
          ['bindings.json', 'Serializable bindings, dependency index and source templates'],
          ['navigation.json', 'Page graph, action references, history model and variable persistence flag'],
          ['reports/compiler-report.json', 'Diagnostics, statistics, hardware boundary flags, asset entries and unsupported features'],
          ['firmware/EVETransport.h', 'Generated transport interface'],
          ['firmware/EVEClient.h', 'Generated provisional client'],
          ['firmware/<Project>.h', 'Generated project-specific API'],
          ['assets/...', 'Binary asset data when a data URL was available, otherwise a MISSING note'],
          ['reports/README.txt', 'Explicit statement that the package is intermediate software, not a bitstream'],
        ],
      },
      {
        type: 'h2',
        text: 'Export rules',
      },
      {
        type: 'list',
        items: [
          'Export is blocked while the current source has errors, even if a last-good build exists. Fix the source or restore the last valid source first.',
          'The package is built from the last valid compile result so its scene, C++ and diagnostics describe one coherent build.',
          'The filename is <sanitized-project-name>.eve.zip.',
          'Fixed ZIP dates make repeated exports of identical content stable.',
          'The report explicitly sets fpgaBitstream, physicalFpgaRendering, hdmiPipeline, spiTransport and videoSupported to false.',
          'Asset entries describe intended future conversion steps such as RGB565 and atlas packing. Those conversions are not implemented.',
        ],
      },
      {
        type: 'note',
        tone: 'warning',
        title: 'Intermediate software package',
        text: 'This ZIP is not an FPGA bitstream and contains no production hardware firmware. It is an integration artifact for the browser prototype and generated API draft.',
      },
    ],
  },
  {
    id: 'limitations',
    title: 'Limitations and boundaries',
    lead: 'These are deliberate boundaries of version 0.1. The Studio reports them rather than pretending to implement them.',
    blocks: [
      {
        type: 'table',
        headers: ['Boundary', 'Version 0.1 behaviour'],
        rows: [
          ['Hardware', 'No FPGA bitstream, HDMI output, SPI transport, display driver or physical device connection.'],
          ['Firmware', 'Generated C++ headers are a transport-independent API draft with a provisional protocol.'],
          ['Video', 'Browser preview only. <vid> emits EVE-H001 and is marked unsupported by the embedded target.'],
          ['Fonts', 'Browser font rendering only. No glyph atlas, font subsetting or embedded rasterization.'],
          ['Expressions', 'No function calls, arrays, objects, loops, mutation or methods. Pure typed expressions only.'],
          ['Navigation', 'Literal page IDs only. No computed routes, parameters, guards or deep links.'],
          ['Storage', 'localStorage only. No backend, account, sync, database or server-side compile.'],
          ['Assets', 'Data URLs in browser storage. Intended embedded conversions are described but not performed.'],
          ['Package', 'Intermediate software package, not a production release, bitstream or signed firmware image.'],
          ['Editing', 'Single document per project. No multi-file includes or component libraries.'],
        ],
      },
      {
        type: 'h2',
        text: 'Storage and privacy',
      },
      {
        type: 'list',
        items: [
          'Projects, assets and backups stay in this browser profile.',
          'Clearing site data removes the project. Use Export ZIP for a portable copy.',
          'Large images and videos can exceed the localStorage quota. The save indicator turns to "Save failed" and the toolbar exposes the reason.',
          'No source, asset or diagnostic is uploaded anywhere by the application.',
        ],
      },
      {
        type: 'h2',
        text: 'Deliberate non-features',
      },
      {
        type: 'list',
        items: [
          'No arbitrary JavaScript execution, plugin runtime or eval().',
          'No hidden preview rendering of uncompiled source.',
          'No regex-based extraction presented as a compiler.',
          'No documentation of diagnostics or components that the code does not implement.',
          'No claim that the browser preview is hardware or that generated headers are production firmware.',
        ],
      },
    ],
  },
  {
    id: 'acceptance',
    title: 'Acceptance scenario',
    lead: 'This end-to-end scenario exercises the editor, compiler, runtime, diagnostics, generated API, examples and package export. Every step is observable in the browser workbench.',
    blocks: [
      {
        type: 'list',
        ordered: true,
        items: [
          'Start the development server and open the Studio. The starter Room Monitor compiles automatically. Expected: header status "Compiled", no errors, preview shows the Room Monitor home page and a generated room icon.',
          'In the Variables tab, set page12.room12.temperature to 42. Expected: the large temperature text and the Settings page value update immediately, with no recompile delay.',
          'Toggle page12.room12.enabled off. Expected: the cooling label changes to COOLING DISABLED, the status dot hides and the label color changes to amber.',
          'Press Toggle Cooling in the simulator. Expected: the boolean flips back, the label and dot update, and the runtime log records the toggle.',
          'Press Open Settings, then Back. Expected: the Settings page renders the same runtime values, and Back restores Home using the history stack without resetting temperature.',
          'In Settings, press Increase twice, then Reset Value. Expected: the value increments by two, then returns to the declared initial 30 without a recompile.',
          'Click the generated C++ tab. Expected: EVETransport.h, EVEClient.h and EveRoomMonitor.h are listed, and the project header exposes typed setters for the five variables.',
          'Remove the closing </app> tag in the editor. Expected: a parse diagnostic (for example EVE-P002) appears, the compile status turns to errors, and the preview stays visible with a STALE banner.',
          'Click the diagnostic row. Expected: the editor reveals the reported line and column. Restore the closing tag and confirm the stale banner disappears after the debounced compile.',
          'Press Export ZIP. Expected: <Project>.eve.zip downloads with manifest.json, scene.json, variables.json, bindings.json, navigation.json, compiler-report.json and firmware headers.',
          'Open the Examples page and load Multi-page Navigation. Expected: the source replaces the project after confirmation, the navigation example compiles and its three pages are available in the simulator.',
        ],
      },
      {
        type: 'note',
        tone: 'success',
        title: 'Pass condition',
        text: 'The scenario passes when runtime edits update the scene without recompiling, navigation is reversible, invalid source preserves the last valid preview with accurate diagnostics, generated C++ matches the variable registry, and the ZIP contains the documented files and explicit hardware-boundary metadata.',
      },
      {
        type: 'h2',
        text: 'Troubleshooting',
      },
      {
        type: 'table',
        headers: ['Symptom', 'Likely cause', 'Resolution'],
        rows: [
          ['Preview says "No valid scene"', 'The first source has compile errors and no last-good build exists', 'Fix the diagnostics shown below the editor.'],
          ['Missing asset placeholder', 'The asset path is not registered or the demo asset was removed', 'Upload the file in Assets or correct src.'],
          ['Save failed', 'localStorage quota exceeded', 'Remove a large asset or export and clear site data.'],
          ['Export button disabled', 'Current source has compile errors or no valid build exists', 'Fix errors; export uses the last valid build only when current source is valid.'],
          ['Back button disabled', 'Navigation history is empty', 'Use navigate() or a page tab to create history first.'],
          ['C++ tab disabled', 'No successful compile has produced an API yet', 'Resolve the first compile errors.'],
        ],
      },
    ],
  },
];

export function getDocSection(id) {
  return DOC_SECTIONS.find((section) => section.id === id) || null;
}

export function getDocNeighbours(id) {
  const index = DOC_SECTIONS.findIndex((section) => section.id === id);
  return {
    previous: index > 0 ? DOC_SECTIONS[index - 1] : null,
    next: index >= 0 && index < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[index + 1] : null,
  };
}

export { VARIABLE_TYPES };
