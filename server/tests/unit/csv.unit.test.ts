import { toCsv } from '../../src/utils/csv';

describe('toCsv (Phase 8: Export / Official Reports)', () => {
  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('renders a header row and one data row', () => {
    expect(toCsv([{ cluster: 'wash', count: 3 }])).toBe('cluster,count\nwash,3');
  });

  it('quotes and escapes a value containing a comma or quote', () => {
    expect(toCsv([{ name: 'Ward 4, "the flooded one"' }])).toBe('name\n"Ward 4, ""the flooded one"""');
  });

  it('renders multiple rows in order', () => {
    expect(
      toCsv([
        { cluster: 'wash', count: 1 },
        { cluster: 'health', count: 2 },
      ]),
    ).toBe('cluster,count\nwash,1\nhealth,2');
  });
});
