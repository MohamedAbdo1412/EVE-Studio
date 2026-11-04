import { describe, expect, it } from 'vitest';
import { findNodeById, parse, walkAst } from '../src/language/parser.js';

const SOURCE = `<app name="Parser Test" width="320" height="240">
    <!-- a comment is skipped -->
    <vars>
        <fam name="room">
            <var name="temperature" type="number" value="30" />
        </fam>
    </vars>
    <page id="home" title="Home &amp; Away" initial="true">
        <text id="label" x="10" y="12">Hello \${room.temperature}C</text>
        <img id="icon" src="assets/icon.png" />
    </page>
</app>`;

describe('EVE parser', () => {
  it('parses the root, nested elements and attributes with entity decoding', () => {
    const { ast, roots, diagnostics } = parse(SOURCE);
    expect(diagnostics).toEqual([]);
    expect(roots).toHaveLength(1);
    expect(ast.tag).toBe('app');
    expect(ast.type).toBe('App');
    expect(ast.attributes).toMatchObject({
      name: 'Parser Test',
      width: '320',
      height: '240',
    });

    const page = findNodeById(ast, 'home');
    expect(page).not.toBeNull();
    expect(page.tag).toBe('page');
    expect(page.attributes.title).toBe('Home & Away');
    expect(page.attributes.initial).toBe('true');

    const label = findNodeById(ast, 'label');
    expect(label.tag).toBe('text');
    expect(label.children).toHaveLength(3);
    expect(label.children[0]).toMatchObject({ type: 'TextFragment', value: 'Hello ' });
    expect(label.children[1]).toMatchObject({
      type: 'Interpolation',
      expression: 'room.temperature',
    });
    expect(label.children[2]).toMatchObject({ type: 'TextFragment', value: 'C' });

    const icon = findNodeById(ast, 'icon');
    expect(icon.selfClosing).toBe(true);
  });

  it('records 1-based source locations for elements and attribute values', () => {
    const { ast } = parse(SOURCE);
    const page = findNodeById(ast, 'home');
    const label = findNodeById(ast, 'label');

    expect(page.loc.line).toBe(8);
    expect(page.attrLocations.title.valueLoc.line).toBe(8);
    expect(label.loc.line).toBe(9);
    expect(label.loc.column).toBe(9);
    expect(label.attrLocations.x.valueLoc.column).toBe(29);
  });

  it('reports duplicate attributes', () => {
    const { diagnostics } = parse('<app width="100" width="200" height="100"><page id="a" /></app>');
    expect(diagnostics.map((item) => item.code)).toContain('EVE-P004');
  });

  it('reports an unclosed element with EVE-P002', () => {
    const { diagnostics } = parse('<app width="100" height="100"><page id="a"></app>');
    expect(diagnostics.map((item) => item.code)).toContain('EVE-P002');
  });

  it('reports missing closing tags at end of file', () => {
    const { diagnostics } = parse('<app width="100" height="100"><page id="a"></page>');
    expect(diagnostics.map((item) => item.code)).toContain('EVE-P002');
  });

  it('reports empty documents with EVE-P007', () => {
    const { ast, diagnostics } = parse('   \n  ');
    expect(ast).toBeNull();
    expect(diagnostics.map((item) => item.code)).toContain('EVE-P007');
  });

  it('reports text outside the app root with EVE-P005', () => {
    const { diagnostics } = parse('loose text<app width="100" height="100" />');
    expect(diagnostics.map((item) => item.code)).toContain('EVE-P005');
  });

  it('reports multiple roots with EVE-P006', () => {
    const { roots, diagnostics } = parse(
      '<app width="100" height="100" /><app width="100" height="100" />',
    );
    expect(roots).toHaveLength(2);
    expect(diagnostics.map((item) => item.code)).toContain('EVE-P006');
  });

  it('reports unexpected closing tags and missing attribute values', () => {
    const first = parse('<app width="100" height="100"></page></app>');
    expect(first.diagnostics.map((item) => item.code)).toContain('EVE-P001');

    const second = parse('<app width="100" height="100"><page id></page></app>');
    expect(second.diagnostics.map((item) => item.code)).toContain('EVE-P014');
  });

  it('walks the full AST including descendants', () => {
    const { ast } = parse(SOURCE);
    const visited = [];
    walkAst(ast, (node) => visited.push(node.tag || node.type));
    expect(visited).toContain('app');
    expect(visited).toContain('vars');
    expect(visited).toContain('fam');
    expect(visited).toContain('page');
    expect(visited).toContain('text');
    expect(visited).toContain('img');
    expect(visited).toContain('TextFragment');
    expect(visited).toContain('Interpolation');
  });

  it('reports unterminated and empty text interpolations', () => {
    const unterminated = parse(
      '<app width="100" height="100"><page id="a"><text id="t">Hi \${name</text></page></app>',
    );
    expect(unterminated.diagnostics.map((item) => item.code)).toContain('EVE-E001');

    const empty = parse(
      '<app width="100" height="100"><page id="a"><text id="t">Hi \${ }</text></page></app>',
    );
    expect(empty.diagnostics.map((item) => item.code)).toContain('EVE-E002');
  });
});
