import { maskDestination, maskEmail, maskPhone } from './destination-mask';

describe('maskEmail', () => {
  it('keeps enough to recognise a row and no more', () => {
    const masked = maskEmail('priya.nair@example.com');
    expect(masked).toMatch(/^p•+r@example\.com$/);
    expect(masked).not.toContain('priya');
    expect(masked).not.toContain('nair');
  });

  it('keeps the domain, which is what makes a row identifiable', () => {
    expect(maskEmail('someone@acme.co.uk')).toContain('@acme.co.uk');
  });

  it('hides a very short local part completely', () => {
    // With two characters there is nothing to keep that would not be the whole thing.
    expect(maskEmail('jo@example.com')).toBe('••@example.com');
  });

  it('does not grow with the address, so the mask reveals no length', () => {
    const short = maskEmail('abcd@example.com');
    const long = maskEmail('averyveryverylongaddress@example.com');
    expect(short.split('@')[0]?.length).toBeLessThanOrEqual(7);
    expect(long.split('@')[0]?.length).toBeLessThanOrEqual(7);
  });

  it('masks something that is not an address rather than guessing at it', () => {
    expect(maskEmail('not-an-address')).toMatch(/^•+$/);
    expect(maskEmail('')).toMatch(/^•+$/);
  });
});

describe('maskPhone', () => {
  it('keeps the last three digits', () => {
    expect(maskPhone('+44 7700 900321')).toMatch(/^\+•+321$/);
  });

  it('keeps the plus so the number is still recognisable as international', () => {
    expect(maskPhone('+919876543210').startsWith('+')).toBe(true);
    expect(maskPhone('07700900321').startsWith('+')).toBe(false);
  });

  it('reveals nothing from a very short number', () => {
    expect(maskPhone('12')).toMatch(/^•+$/);
  });

  it('strips the formatting, so spacing cannot leak the shape of the number', () => {
    expect(maskPhone('+44 (0) 7700-900-321')).toBe(maskPhone('+4407700900321'));
  });
});

describe('maskDestination', () => {
  it('picks the right masker for the channel', () => {
    expect(maskDestination('EMAIL', 'priya@example.com')).toContain('@example.com');
    expect(maskDestination('WHATSAPP', '+447700900321')).toMatch(/321$/);
  });
});
