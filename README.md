# EVE Studio

A browser-only workbench for the **EVE UI Language**: a live editor, a real compiler pipeline, an interactive runtime simulator, generated C++ API previews, complete documentation, and an exportable intermediate package.

No backend, no native runtime, and no arbitrary JavaScript execution. The compiler and simulator run entirely in the browser.

## Quick start

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:5173/>.
Online On Vercel <https://eve-studio-eight.vercel.app//>.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create the production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest parser, compiler, runtime, export and acceptance suites |
| `npm run test:watch` | Run tests in watch mode |

## Workbench

- **Studio** (`/`) — CodeMirror 6 editor with EVE syntax highlighting, tag matching, folding, completion and diagnostic ranges.
- **Simulator** — renders the compiled scene at its logical resolution with live bindings, typed variables, button actions and real navigation history.
- **Inspector** — edit runtime variables, inspect component properties, bindings and the compiler report.
- **Diagnostics** — structured `EVE-*` diagnostics with source locations and reveal-in-editor navigation.
- **Generated C++** — provisional `EVEClient.h`, `EVETransport.h` and a project header, with a clear hardware boundary.
- **Export ZIP** — deterministic package with scene, variables, bindings, navigation, manifest, compiler report, asset bytes and firmware headers.
- **Documentation** (`/docs/*`) — complete language, component, expression, runtime, compiler, diagnostics, laws, export and limitation references.
- **Examples** (`/examples`) — eight complete projects compiled through the same browser pipeline.

Projects are saved to `localStorage` under `eve.studio.project.v1` after a short debounce. Imported assets are stored as data URLs.

## Language at a glance

```xml
<app name="Hello" width="800" height="480" scale="fit" background="#101820">
    <vars>
        <fam name="ui">
            <var name="message" type="string" value="Hello, EVE." />
            <var name="enabled" type="boolean" value="true" />
        </fam>
    </vars>

    <page id="home" title="Home" initial="true">
        <text id="title" x="40" y="40" width="720" height="80"
              fontSize="48" weight="bold" color="#FFFFFF">
            ${ui.message}
        </text>

        <button id="toggle" x="40" y="150" width="220" height="56"
                background="#2455AA" radius="9" onPress="toggle(ui.enabled)">
            <text id="label" x="0" y="0" width="100%" height="100%"
                  color="#FFFFFF" align="center" verticalAlign="middle">
                ${ui.enabled ? 'Enabled' : 'Disabled'}
            </text>
        </button>
    </page>
</app>
```

Supported tags: `app`, `vars`, `fam`, `var`, `page`, `group`, `text`, `img`, `vid`, `button`, `shape`.
Supported actions: `navigate`, `back`, `set`, `toggle`, `reset`.

Dynamic attributes and text interpolation use `${...}` with a small typed expression grammar. The evaluator parses and interprets expressions directly; it never calls `eval()` or `new Function()`.

## Compiler pipeline

1. Character lexer with 1-based source locations.
2. Recursive-descent parser producing an AST with text and interpolation fragments.
3. Semantic validation of structure, IDs, attributes, dynamic eligibility and types.
4. Variable registry with deterministic FNV-1a IDs and collision probing.
5. Expression AST parsing and safe evaluation.
6. Binding extraction and dependency indexing.
7. Layout resolution and scene construction.
8. Asset manifest validation.
9. C++ API generation.
10. Package serialization and diagnostics reporting.

A failed compile never destroys the last valid scene: the preview is marked **stale** while current diagnostics remain available. Export is blocked until the source compiles cleanly again.

## Export package

The ZIP filename is `<sanitized-app-name>.eve.zip`. Inside the folder:

```text
manifest.json
scene.json
variables.json
bindings.json
navigation.json
reports/compiler-report.json
reports/README.txt
firmware/EVEClient.h
firmware/EVETransport.h
firmware/<AppName>.h
assets/...
```

The package is an **intermediate software package**. It is not FPGA firmware, an FPGA bitstream, an HDMI pipeline or a production hardware protocol. The generated protocol is explicitly provisional.

## Project layout

```text
src/
  components/simulator/   Runtime scene renderers
  components/ui/          Code viewer and shared UI
  docs/                   Data-driven documentation
  editor/                 CodeMirror EVE language support
  examples/               Example library page
  language/compiler/      Compile pipeline, C++ generation, ZIP export
  language/expressions/   Expression lexer, parser and evaluator
  language/runtime/       Runtime state, navigation, bindings, actions
  language/semantic/      Validation, variables, layout, assets
  project/                Starter project, examples, persistence
  studio/                 Studio panels and session orchestration
tests/                    Unit, integration and acceptance tests
```

## Verification

The built-in acceptance scenario is documented at `/docs/acceptance`. It covers:

- clean starter compilation;
- live variable edits without recompilation;
- boolean and visibility bindings;
- button actions (`navigate`, `back`, `set`, `reset`, `toggle`);
- history restoration and variable persistence;
- generated C++ inspection;
- package export and hardware-boundary declarations;
- stale preview behavior after a failed compile;
- diagnostics, examples, documentation routes and browser console cleanliness.

## Boundaries

- This is a **browser prototype and design simulator**, not an FPGA or device emulator.
- Images and video are browser previews; `vid` emits a hardware-boundary warning.
- There is no physical SPI transport, HDMI output or bitstream generation.
- The language has no loops, user-defined functions, assignments inside expressions or arbitrary JavaScript.
