import {
  cleanSubject, parseForwardedFrom, htmlToText, parseExtraction, decide, isForwarderName,
  extractWithClaude, Extraction, currencyEvidence,
} from './reader';

const ex = (o: Partial<Extraction>): Extraction => ({
  is_receipt: true, vendor: 'Uber Eats', date: '2026-08-28', total: 63.19,
  currency: 'EUR', category: 'Meals & Entertainment', confidence: 'high', note: null, ...o,
});

describe('cleanSubject', () => {
  test('strips stacked forward prefixes in English and French', () => {
    expect(cleanSubject('FW: Fwd: Your receipt from Fly.io')).toBe('Your receipt from Fly.io');
    expect(cleanSubject('TR: Reçu de carte bancaire')).toBe('Reçu de carte bancaire');
  });
});

describe('parseForwardedFrom — the 22/22 root cause', () => {
  test('Outlook forward: skips Thurston, returns the merchant', () => {
    const body = [
      'From: Thurston Adams <thurstonadams@msn.com>',
      'Sent: Saturday, August 29, 2026 9:02 AM',
      '________________________________',
      'From: Uber Receipts <noreply@uber.com>',
      'Sent: Friday, August 28, 2026 10:14 PM',
      'Subject: Your Friday evening order with Uber Eats',
    ].join('\n');
    expect(parseForwardedFrom(body)).toEqual({ name: 'Uber Receipts', email: 'noreply@uber.com' });
  });

  test('French Outlook "De :" header', () => {
    const body = 'De : SNCF Connect <noreply@sncf-connect.com>\nEnvoyé : jeudi 10 septembre 2026';
    expect(parseForwardedFrom(body)?.email).toBe('noreply@sncf-connect.com');
  });

  test('Outlook [mailto:] style', () => {
    const body = 'From: JW Marriott New Delhi [mailto:folio@marriott.com]\nSent: 18 Aug';
    expect(parseForwardedFrom(body)).toEqual({ name: 'JW Marriott New Delhi', email: 'folio@marriott.com' });
  });

  test('nothing but Thurston → null', () => {
    expect(parseForwardedFrom('From: Thurston Adams <thurston@xfix.tech>')).toBeNull();
  });
});

describe('htmlToText', () => {
  test('keeps line breaks and decodes the euro sign', () => {
    expect(htmlToText('<p>Total</p><div>63,19&nbsp;&euro;</div>')).toBe('Total\n63,19 €');
  });
});

describe('parseExtraction', () => {
  test('reads JSON wrapped in prose/code fences', () => {
    const e = parseExtraction('Here you go:\n```json\n{"is_receipt":true,"vendor":"Conrad Pune","date":"2026-08-25","total":177736.62,"currency":"inr","category":"Travel","confidence":"high","note":null}\n```');
    expect(e).toMatchObject({ vendor: 'Conrad Pune', total: 177736.62, currency: 'INR', category: 'Travel' });
  });
  test('European decimal comma in a string total', () => {
    expect(parseExtraction('{"total":"63,19","currency":"EUR"}')?.total).toBe(63.19);
  });
  test('rejects an invented category and a bad date', () => {
    const e = parseExtraction('{"category":"Food","date":"28/08/2026"}');
    expect(e?.category).toBeNull();
    expect(e?.date).toBeNull();
  });
  test('garbage → null', () => {
    expect(parseExtraction('no json here')).toBeNull();
  });
});

describe('decide — only yellow when something is actually missing', () => {
  const fb = { vendor: 'Thurston Adams', date: '2026-08-29' };

  test('complete + high confidence → ready, no reason', () => {
    const d = decide(ex({}), fb);
    expect(d).toMatchObject({ status: 'ready', reviewReason: null, vendor: 'Uber Eats', total: 63.19, currency: 'EUR', date: '2026-08-28', categoryCode: '6200' });
  });

  test('the forwarder is never accepted as vendor', () => {
    const d = decide(ex({ vendor: 'Thurston Adams' }), fb);
    expect(d.status).toBe('needs-review');
    expect(d.reviewReason).toBe('Vendor not found');
    expect(isForwarderName(d.vendor)).toBe(false);
  });

  test('no amount → says so', () => {
    expect(decide(ex({ total: null }), fb).reviewReason).toBe('Amount not found');
    expect(decide(ex({ total: 0 }), fb).reviewReason).toBe('Amount not found');
  });

  test('not a receipt → says so', () => {
    expect(decide(ex({ is_receipt: false }), fb).reviewReason).toBe('Not a receipt?');
  });

  test('medium confidence → yellow with the model note', () => {
    expect(decide(ex({ confidence: 'medium', note: 'tip not included' }), fb).reviewReason).toBe('Check: tip not included');
  });

  test('model failure → yellow, forwarder name not kept', () => {
    const d = decide(null, fb);
    expect(d.status).toBe('needs-review');
    expect(d.vendor).toBe('Unknown');
  });
});

describe('extractWithClaude', () => {
  test('sends PDFs as documents, images as images, and parses the reply', async () => {
    const calls: any[] = [];
    const fetchImpl = async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      return {
        ok: true, status: 200, text: async () => '',
        json: async () => ({ content: [{ type: 'text', text: '{"is_receipt":true,"vendor":"Snowflake","date":"2026-09-05","total":25,"currency":"USD","category":"Software & Subscriptions","confidence":"high","note":null}' }] }),
      };
    };
    const r = await extractWithClaude({
      subject: 'FW: Cortex Code CLI Invoice from Snowflake, Inc.',
      htmlBody: '<p>From: Thurston Adams &lt;thurston@xfix.tech&gt;</p>',
      attachments: [
        { name: 'inv.pdf', contentType: 'application/pdf', base64: 'JVBERi0=' },
        { name: 'x.jpg', contentType: 'image/jpeg', base64: '/9j/' },
        { name: 'x.ics', contentType: 'text/calendar', base64: 'AA==' },
      ],
    }, { apiKey: 'k', model: 'm', fetchImpl });
    const content = calls[0].messages[0].content;
    expect(content.map((c: any) => c.type)).toEqual(['document', 'image', 'text']);
    expect(content[2].text).toContain('Subject: Cortex Code CLI Invoice from Snowflake, Inc.');
    expect(r.extraction?.vendor).toBe('Snowflake');
  });

  test('HTTP error surfaces with status', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'invalid x-api-key', json: async () => ({}) });
    await expect(extractWithClaude({ subject: 's' }, { apiKey: 'bad', model: 'm', fetchImpl })).rejects.toThrow('anthropic 401');
  });
});

describe('currencyEvidence + decide — the Aug 17 Uber (52.73 read as USD)', () => {
  test('finds the symbol next to the amount in several formats', () => {
    expect(currencyEvidence('Total €52.73', 52.73)).toEqual(['EUR']);
    expect(currencyEvidence('Montant payé : 52,73 €', 52.73)).toEqual(['EUR']);
    expect(currencyEvidence('Total ₹177,736.62', 177736.62)).toEqual(['INR']);
    expect(currencyEvidence('Total 1 234,56 EUR', 1234.56)).toEqual(['EUR']);
    expect(currencyEvidence('Amount paid $21.60', 21.6)).toEqual(['USD']);
  });
  test('ignores the amount inside a longer number, and says nothing when no symbol', () => {
    expect(currencyEvidence('Order 152.73 total', 52.73)).toEqual([]);
    expect(currencyEvidence('Total 52.73', 52.73)).toEqual([]);
  });
  test('printed EUR overrides a model that said USD', () => {
    const d = decide({ is_receipt: true, vendor: 'Uber', date: '2026-08-17', total: 52.73, currency: 'USD', category: 'Travel', confidence: 'high', note: null },
      { vendor: 'Thurston Adams', date: '2026-08-17' }, ['EUR']);
    expect(d.currency).toBe('EUR');
    expect(d.status).toBe('ready');
  });
  test('two different printed currencies → yellow, asks', () => {
    const d = decide({ is_receipt: true, vendor: 'X', date: '2026-08-04', total: 10, currency: 'EUR', category: 'Other', confidence: 'high', note: null },
      { vendor: 'Thurston Adams', date: '2026-08-04' }, ['EUR', 'USD']);
    expect(d.status).toBe('needs-review');
    expect(d.reviewReason).toBe('Check currency: EUR or USD?');
  });
});
