import ts from 'typescript';

/**
 * JavaScript output = the TypeScript suite transpiled file by file (support modules included), so
 * both languages share one emitter per adapter. Specs keep their import specifiers, which resolve
 * to the transpiled modules here and to the `.ts` sources under TypeScript.
 */
export function transpileFiles(files: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, source] of files) out.set(path.replace(/\.ts$/, '.js'), transpileSpec(source));
  return out;
}

function transpileSpec(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}
