const {
  normalizePhone,
  normalizeUrl,
  normalizeCountry,
  normalizeLanguage
} = require('../src/validation/formats');

describe('normalizePhone', () => {
  test.each([
    ['00962 79 123 4567', { ok: true, value: '+962791234567' }],
    ['+970 59 912 3456', { ok: true, value: '+970599123456' }],
    ['+1 (202) 555-0123', { ok: true, value: '+12025550123' }],
    ['079 123 4567', { ok: false, reason: 'phone_without_country_code' }],
    ['+962 12', { ok: false, reason: 'invalid_phone' }],
    ['', { ok: false, reason: 'phone_without_country_code' }],
    ['+', { ok: false, reason: 'invalid_phone' }],
    [null, { ok: false, reason: 'invalid_phone' }],
    [12345, { ok: false, reason: 'invalid_phone' }]
  ])('normalizePhone(%j) -> %j', (raw, expected) => {
    expect(normalizePhone(raw)).toEqual(expected);
  });
});

describe('normalizeUrl', () => {
  test.each([
    ['github.com/sam', { ok: true, value: 'https://github.com/sam' }],
    ['https://example.com/foo', { ok: true, value: 'https://example.com/foo' }],
    ['http://example.com', { ok: true, value: 'http://example.com' }],
    ['  github.com/sam  ', { ok: true, value: 'https://github.com/sam' }],
    ['javascript:alert(1)', { ok: false, reason: 'invalid_url' }],
    ['not a url', { ok: false, reason: 'invalid_url' }],
    ['http://localhost', { ok: false, reason: 'invalid_url' }],
    ['mailto:test@example.com', { ok: false, reason: 'invalid_url' }],
    ['', { ok: false, reason: 'invalid_url' }],
    [null, { ok: false, reason: 'invalid_url' }]
  ])('normalizeUrl(%j) -> %j', (raw, expected) => {
    expect(normalizeUrl(raw)).toEqual(expected);
  });
});

describe('normalizeCountry', () => {
  test.each([
    ['Jordan', { ok: true, value: 'JO' }],
    ['Palestine', { ok: true, value: 'PS' }],
    ['jo', { ok: true, value: 'JO' }],
    ['JO', { ok: true, value: 'JO' }],
    ['UK', { ok: true, value: 'GB' }],
    ['United States', { ok: true, value: 'US' }],
    ['Atlantis', { ok: false, reason: 'invalid_country' }],
    ['', { ok: false, reason: 'invalid_country' }],
    [null, { ok: false, reason: 'invalid_country' }]
  ])('normalizeCountry(%j) -> %j', (raw, expected) => {
    expect(normalizeCountry(raw)).toEqual(expected);
  });
});

describe('normalizeLanguage', () => {
  test.each([
    ['en', { ok: true, value: 'English' }],
    ['EN', { ok: true, value: 'English' }],
    ['arabic', { ok: true, value: 'Arabic' }],
    ['Arabic', { ok: true, value: 'Arabic' }],
    ['fra', { ok: true, value: 'French' }],
    ['xx', { ok: false, reason: 'invalid_language' }],
    ['xyz', { ok: false, reason: 'invalid_language' }],
    ['Atlantis', { ok: false, reason: 'invalid_language' }],
    ['', { ok: false, reason: 'invalid_language' }],
    [null, { ok: false, reason: 'invalid_language' }]
  ])('normalizeLanguage(%j) -> %j', (raw, expected) => {
    expect(normalizeLanguage(raw)).toEqual(expected);
  });
});
