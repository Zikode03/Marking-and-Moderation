import type { ManagedRecord, ModuleDefinition } from './institutionModules';
export function parseRecordCsv(text: string, module: ModuleDefinition) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else value += c;
    } else if (c === '"') {
      if (value || afterQuote) throw Error('Invalid CSV quotes.');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(value);
      value = '';
      afterQuote = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some(v => v.trim())) rows.push(row);
        row = [];
      }
    } else {
      if (afterQuote) throw Error('Unexpected text after a quoted CSV field.');
      value += c;
    }
  }
  if (quoted) throw Error('Unclosed CSV field.');
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const header = rows.shift()?.map(v => v.replace(/^\uFEFF/, '').trim());
  if (!header || new Set(header).size !== header.length || !header.includes('code') || !header.includes('name')) throw Error('CSV needs unique code and name headers.');
  const allowed = ['code', 'name', ...module.fields.map(f => f.key)];
  if (header.some(h => !allowed.includes(h))) throw Error('CSV contains unrecognised columns.');
  if (!rows.length || rows.length > 500) throw Error('Import 1-500 records.');
  return rows.map(cells => {
    if (cells.length !== header.length) throw Error('CSV row has a different column count.');
    const entry = Object.fromEntries(header.map((h, i) => [h, cells[i].trim()]));
    return {
      code: entry.code,
      name: entry.name,
      fields: Object.fromEntries(module.fields.map(f => [f.key, entry[f.key] || ''])),
      active: true,
      revision: 0
    };
  });
}
export function exportRecordCsv(module: ModuleDefinition, rows: ManagedRecord[]) {
  const header = ['code', 'name', ...module.fields.map(f => f.key)];
  const cell = (v: string) => '"' + v.replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  return [header, ...rows.map(r => header.map(k => k === 'code' ? r.code : k === 'name' ? r.name : r.fields[k] || ''))].map(row => row.map(cell).join(',')).join('\r\n');
}
