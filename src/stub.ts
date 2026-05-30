export function notImplemented(item: number, lldSection?: string): never {
  const suffix = lldSection ? ` — see docs/DESIGN-LLD.md ${lldSection}` : "";
  throw new Error(`Not yet implemented (item ${item})${suffix}`);
}
