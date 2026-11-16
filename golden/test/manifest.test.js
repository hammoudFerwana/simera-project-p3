const fs = require('fs');
const path = require('path');

describe('manifest: golden dataset validation', () => {
  const manifestPath = path.resolve(__dirname, '../manifest.json');

  test('manifest.json exists and is valid JSON', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.entries)).toBe(true);
  });

  test('dataset contains at least 10 entries covering all required cases', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.entries.length).toBeGreaterThanOrEqual(10);
  });

  test('every entry references a file that exists on disk', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const entry of manifest.entries) {
      const fullPath = path.resolve(__dirname, '..', entry.file);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  test('every stored entry has an expected result file that exists and parses', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const storedEntries = manifest.entries.filter((e) => e.expect === 'stored');
    expect(storedEntries.length).toBeGreaterThanOrEqual(7);

    for (const entry of storedEntries) {
      expect(entry.expected).not.toBeNull();
      const expPath = path.resolve(__dirname, '..', entry.expected);
      expect(fs.existsSync(expPath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(expPath, 'utf8'));
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
    }
  });

  test('every rejected entry has expected null and a non-empty rejectReason', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const rejectedEntries = manifest.entries.filter(
      (e) => e.expect === 'rejected'
    );
    expect(rejectedEntries.length).toBeGreaterThanOrEqual(2);

    for (const entry of rejectedEntries) {
      expect(entry.expected).toBeNull();
      expect(typeof entry.rejectReason).toBe('string');
      expect(entry.rejectReason.trim().length).toBeGreaterThan(0);
    }
  });

  test('uses only fictional emails ending with @golden.example (privacy-by-design)', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const entry of manifest.entries) {
      expect(entry.email).toMatch(/^[a-z0-9._%+-]+@golden\.example$/i);
    }
  });

  test('orders are strictly sequential and unique', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const orders = manifest.entries.map((e) => e.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
    const unique = new Set(orders);
    expect(unique.size).toBe(orders.length);
  });
});
