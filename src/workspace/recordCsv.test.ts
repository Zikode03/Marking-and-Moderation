import { describe, it, expect } from 'vitest';
import { parseRecordCsv, exportRecordCsv } from './recordCsv';
import { institutionModules } from './institutionModules';
const module = institutionModules.find(m => m.key === 'learner')!;
describe('Institution CSV exchange', () => {
  it('preserves quoted commas, quotes and newlines', () => {
    const rows = parseRecordCsv('code,name,email\r\nC1,"Doe, Jane",jane@example.test', module);
    expect(rows[0].name).toBe('Doe, Jane');
    expect(() => parseRecordCsv('code,name\nC1,"unclosed', module)).toThrow();
  });
  it('rejects unknown headers and inconsistent rows', () => {
    expect(() => parseRecordCsv('code,name,password\nC1,Name,secret', module)).toThrow();
    expect(() => parseRecordCsv('code,name\nC1', module)).toThrow();
  });
  it('escapes spreadsheet formulas on export', () => {
    expect(exportRecordCsv(module, [{
      id: '1',
      kind: 'learner',
      code: 'C1',
      name: '=1+1',
      fields: {},
      active: true,
      revision: 1
    }])).toContain("'=1+1");
  });
});
