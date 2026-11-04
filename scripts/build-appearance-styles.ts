import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import postcss from "postcss";
import ts from "typescript";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { transform } from "esbuild";
import { appearanceStyleSources } from "../src/lib/appearance-styles";
const output = new URL("../public/appearance-styles/", import.meta.url);
await mkdir(output, { recursive: true });
for (const [appearance, source] of Object.entries(appearanceStyleSources)) {
  const css = await readFile(
    new URL(`../src/app/${source}-theme.css`, import.meta.url),
    "utf8",
  );
  const { code } = await transform(css, {
    loader: "css",
    minify: true,
    legalComments: "none",
  });
  await writeFile(new URL(`${appearance}.css`, output), code);
}

// Keep the homepage shell small while deriving its class inventory from the
// actual layout/page component tree. The original CSS remains the sole source
// for both generated outputs and component browser fixtures.
const shellClasses = new Set<string>();
const visited = new Set<string>();
function collect(file: string) {
  if (visited.has(file) || !existsSync(file)) return;
  visited.add(file);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      for (const token of node.text.match(/[a-zA-Z_][\w-]*/g) ?? [])
        shellClasses.add(token);
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const name = node.moduleSpecifier.text;
      const base = name.startsWith("@/")
        ? resolve("src", name.slice(2))
        : name.startsWith(".")
          ? resolve(dirname(file), name)
          : null;
      if (base)
        for (const candidate of [`${base}.tsx`, `${base}/index.tsx`])
          if (existsSync(candidate)) collect(candidate);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
collect(resolve("src/app/layout.tsx"));
collect(resolve("src/app/page.tsx"));
const sharedClass =
  /^(?:site-|nav-|menu-|header-|mobile-|account-|language-|theme-|appearance-|home-|season-|countdown-|registration-|edition-|news-|footer-|spinner|pending-|loading-)/;
let shell = "",
  pages = "";
for (const name of [
  "globals",
  "public-tournament",
  "workspace",
  "archive-counts",
  "header-mobile",
]) {
  const original = postcss.parse(
    await readFile(new URL(`../src/app/${name}.css`, import.meta.url), "utf8"),
  );
  const common = (selector: string) =>
    [...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].every(
      (match) => shellClasses.has(match[1]) || sharedClass.test(match[1]),
    );
  for (const [tree, keepCommon] of [
    [original.clone(), true],
    [original.clone(), false],
  ] as const) {
    tree.walkRules((rule) => {
      const selectors = rule.selectors.filter(
        (selector) => common(selector) === keepCommon,
      );
      if (selectors.length) rule.selectors = selectors;
      else rule.remove();
    });
    tree.walkAtRules((rule) => {
      if (
        !keepCommon &&
        ["theme", "font-face", "keyframes"].includes(rule.name)
      )
        rule.remove();
      else if (rule.nodes && !rule.nodes.length) rule.remove();
    });
    if (keepCommon) shell += tree.toString();
    else pages += tree.toString();
  }
}
await writeFile(
  new URL("../src/app/shell.generated.css", import.meta.url),
  shell,
);
const pageStyles = await transform(pages, {
  loader: "css",
  minify: true,
  legalComments: "none",
});
await writeFile(new URL("pages.css", output), pageStyles.code);
