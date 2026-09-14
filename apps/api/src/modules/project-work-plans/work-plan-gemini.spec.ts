import {
  WorkPlanGeminiService,
  geminiErrorSummary,
  geminiGenerateBody,
  readGeminiText,
} from './work-plan-gemini';

describe('readGeminiText', () => {
  it('joins text parts from the first candidate', () => {
    expect(
      readGeminiText({
        candidates: [{ content: { parts: [{ text: '{"phases":' }, { text: '[]}' }] } }],
      }),
    ).toBe('{"phases":[]}');
  });

  it('returns empty when the payload has no candidates', () => {
    expect(readGeminiText({})).toBe('');
  });

  it('skips thought parts so JSON answers are not mixed with reasoning text', () => {
    expect(
      readGeminiText({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: 'Let me think about phases' },
                { text: '{"phases":[]}' },
              ],
            },
          },
        ],
      }),
    ).toBe('{"phases":[]}');
  });
});

describe('geminiErrorSummary', () => {
  it('reads the Google error message without the request body', () => {
    expect(
      geminiErrorSummary(400, { error: { status: 'INVALID_ARGUMENT', message: 'Unknown name thinkingBudget' } }),
    ).toBe('400 INVALID_ARGUMENT: Unknown name thinkingBudget');
  });
});

describe('WorkPlanGeminiService', () => {
  const pdf = Buffer.from('%PDF-1.1 test');

  it('posts the PDF to Gemini and returns the analysed phases', async () => {
    const fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      phases: [
                        {
                          heading: 'Discovery',
                          titles: [
                            {
                              title: 'Kickoff',
                              points: [{ body: 'Gather requirements', estimateMinutes: 30 }],
                            },
                          ],
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const gemini = new WorkPlanGeminiService(
      {
        gemini: { apiKey: 'test-key', model: 'gemini-2.5-flash', timeoutMs: 60_000 },
      } as never,
      { fetch } as never,
    );

    const phases = await gemini.analysePdf(pdf);
    expect(phases[0]?.heading).toBe('Discovery');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = fetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    const payload = JSON.parse(init.body) as ReturnType<typeof geminiGenerateBody>;
    expect(payload.contents).toEqual(geminiGenerateBody(pdf).contents);
    expect(
      (payload.contents as Array<{ parts: Array<{ inlineData?: { mimeType?: string } }> }>)[0]
        ?.parts[1]?.inlineData?.mimeType,
    ).toBe('application/pdf');
    expect(payload.generationConfig).toEqual({
      temperature: 0.2,
      responseMimeType: 'application/json',
    });
  });

  it('turns a Gemini HTTP error into a 400 without exposing the PDF', async () => {
    const fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Unknown name thinkingBudget' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const gemini = new WorkPlanGeminiService(
      {
        gemini: { apiKey: 'test-key', model: 'gemini-2.5-flash', timeoutMs: 60_000 },
      } as never,
      { fetch } as never,
    );

    await expect(gemini.analysePdf(pdf)).rejects.toThrow('The PDF could not be analysed');
  });

  it('is disabled when no key is configured', () => {
    const gemini = new WorkPlanGeminiService(
      { gemini: { apiKey: undefined, model: 'gemini-2.5-flash', timeoutMs: 60_000 } } as never,
      { fetch: jest.fn() } as never,
    );
    expect(gemini.isEnabled()).toBe(false);
  });
});
