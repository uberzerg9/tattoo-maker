import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";

/**
 * Finds UI text that bypasses i18next: words written straight into JSX, text-like attributes
 * (aria-label, title, placeholder, alt…), and string fallbacks inside JSX expressions. Also
 * checks that every literal key passed to t() exists in en.json.
 */

const SRC = join(__dirname, "..");
/** Not user-facing: the dev-only debug overlay and the engine (no UI). */
const SKIPPED = [/DebugOverlay\.tsx$/, /[\\/]engine[\\/]/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !SKIPPED.some((re) => re.test(path)) ? [path] : [];
  });
}

const hasLetters = (text: string) => /\p{L}/u.test(text);
const TEXT_ATTRIBUTES = new Set(["aria-label", "aria-description", "aria-valuetext", "aria-placeholder", "aria-roledescription", "title", "placeholder", "alt", "label"]);
/** A prop that is a translation key rather than text, e.g. <Placeholder title="terms" />. */
const looksLikeKey = (text: string) => /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*$/.test(text);

interface Finding {
  where: string;
  what: string;
}

function stringIn(node: ts.Node | undefined): ts.StringLiteralLike | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node;
  return null;
}

/** String literals that end up as text when a JSX expression is rendered: `{x ? "a" : "b"}`, `{x ?? "a"}`, `{"a"}`. */
function renderedLiterals(expression: ts.Expression): ts.StringLiteralLike[] {
  const direct = stringIn(expression);
  if (direct) return [direct];
  if (ts.isParenthesizedExpression(expression)) return renderedLiterals(expression.expression);
  if (ts.isConditionalExpression(expression)) return [...renderedLiterals(expression.whenTrue), ...renderedLiterals(expression.whenFalse)];
  if (ts.isBinaryExpression(expression)) {
    const op = expression.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return [...renderedLiterals(expression.left), ...renderedLiterals(expression.right)];
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return renderedLiterals(expression.right);
  }
  return [];
}

function scan(file: string): Finding[] {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings: Finding[] = [];
  const add = (node: ts.Node, what: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    findings.push({ where: `${relative(SRC, file)}:${line + 1}`, what });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasLetters(node.text)) add(node, `text ${JSON.stringify(node.text.trim())}`);

    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText())) {
      const tag = node.parent.parent;
      const tagName = ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag) ? tag.tagName.getText() : "";
      const isDomElement = /^[a-z]/.test(tagName);
      const init = node.initializer;
      const literals = !init ? [] : stringIn(init) ? [stringIn(init)!] : ts.isJsxExpression(init) && init.expression ? renderedLiterals(init.expression) : [];
      for (const lit of literals) {
        if (!hasLetters(lit.text) || (!isDomElement && looksLikeKey(lit.text))) continue;
        add(lit, `${node.name.getText()}=${JSON.stringify(lit.text)}`);
      }
    }

    // {cond ? "text" : other} and {name ?? "text"} as children of an element.
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const lit of renderedLiterals(node.expression)) if (hasLetters(lit.text)) add(lit, `text ${JSON.stringify(lit.text)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/** Literal keys of t("a.b") calls, and the fixed head of t(`a.b.${x}`) calls. */
function translationKeys(file: string): { where: string; key: string; dynamic: boolean }[] {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const keys: { where: string; key: string; dynamic: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && /^(t|i18n\.t)$/.test(node.expression.getText()) && node.arguments[0]) {
      const arg = node.arguments[0];
      const { line } = sf.getLineAndCharacterOfPosition(arg.getStart());
      const where = `${relative(SRC, file)}:${line + 1}`;
      if (stringIn(arg)) keys.push({ where, key: stringIn(arg)!.text, dynamic: false });
      else if (ts.isTemplateExpression(arg)) keys.push({ where, key: arg.head.text, dynamic: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return keys;
}

type Tree = { [key: string]: string | Tree };
function lookup(path: string): string | Tree | undefined {
  let node: string | Tree | undefined = en as Tree;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return node;
}

const files = sourceFiles(SRC);

describe("no hardcoded UI text", () => {
  it("every component's text, labels and fallbacks come from i18next", () => {
    const found = files.filter((f) => f.endsWith(".tsx")).flatMap(scan);
    expect(found.map((f) => `${f.where}  ${f.what}`)).toEqual([]);
  });

  it("every literal t() key exists in en.json (plural forms count)", () => {
    const missing = files.flatMap(translationKeys).filter(({ key, dynamic }) => {
      if (dynamic && key === "") return false; // `${base}.x`: nothing fixed to check here (the owner of the keys has its own test)
      if (dynamic) return typeof lookup(key.replace(/\.$/, "")) !== "object"; // `a.b.${x}`: a.b must be a group
      return lookup(key) === undefined && lookup(`${key}_other`) === undefined;
    });
    expect(missing.map((m) => `${m.where}  ${m.key}`)).toEqual([]);
  });
});
