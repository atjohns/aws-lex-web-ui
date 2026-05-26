/**
 * Regression tests for Lex V2 client response normalization.
 * Covers postText mapping in lex-web-ui/src/lib/lex/client.js.
 */

const BOT_CONFIG = {
  botV2Id: 'BOT123',
  botV2AliasId: 'ALIAS456',
  botV2LocaleId: 'en_US',
};

describe('Lex client', () => {
  let LexClient;

  beforeAll(async () => {
    const module = await import('../../src/lib/lex/client.js');
    LexClient = module.default;
  });

  function createClient(sendImpl) {
    const lexRuntimeV2Client = {
      send: sendImpl,
      config: { credentials: null },
    };
    return new LexClient({
      userId: 'test-session',
      ...BOT_CONFIG,
      lexRuntimeV2Client,
    });
  }

  describe('constructor', () => {
    test('throws when required bot configuration is missing', () => {
      expect(() => new LexClient({
        userId: 'user',
        botV2Id: 'BOT',
        botV2AliasId: 'ALIAS',
        botV2LocaleId: 'en_US',
        lexRuntimeV2Client: null,
      })).toThrow('invalid lex client constructor arguments');
    });
  });

  describe('postText', () => {
    test('maps sessionState.intent fields onto the v1-compatible response shape', async () => {
      const send = async () => ({
        sessionState: {
          sessionAttributes: { tenant: 'acme' },
          intent: {
            name: 'BookHotel',
            slots: { city: 'Seattle' },
            state: 'Fulfilled',
          },
          dialogAction: { slotToElicit: 'city' },
        },
        messages: [
          { contentType: 'PlainText', content: 'Your booking is confirmed.' },
        ],
      });

      const client = createClient(send);
      const response = await client.postText('book a hotel', 'en_US', { source: 'web' });

      expect(response.sessionAttributes).toEqual({ tenant: 'acme' });
      expect(response.intentName).toBe('BookHotel');
      expect(response.slots).toEqual({ city: 'Seattle' });
      expect(response.dialogState).toBe('Fulfilled');
      expect(response.slotToElicit).toBe('city');

      const { messages: messagePayload } = JSON.parse(response.message);
      expect(messagePayload).toHaveLength(1);
      expect(messagePayload[0]).toMatchObject({
        type: 'PlainText',
        value: 'Your booking is confirmed.',
        isLastMessageInGroup: 'true',
      });
    });

    test('falls back to interpretations when sessionState has no intent', async () => {
      const send = async () => ({
        sessionState: {
          sessionAttributes: {},
          dialogAction: { type: 'ElicitIntent' },
        },
        interpretations: [{
          intent: {
            name: 'FallbackIntent',
            slots: {},
          },
        }],
        messages: [],
      });

      const client = createClient(send);
      const response = await client.postText('hello');

      expect(response.intentName).toBe('FallbackIntent');
      expect(response.dialogState).toBe('');
      const { messages: messagePayload } = JSON.parse(response.message);
      expect(messagePayload[0]).toMatchObject({ type: 'PlainText', value: '' });
    });

    test('converts ImageResponseCard messages into generic response cards', async () => {
      const imageCard = {
        title: 'Pick an option',
        buttons: [{ text: 'Yes', value: 'yes' }],
      };
      const send = async () => ({
        sessionState: {
          sessionAttributes: {},
          intent: { name: 'Choice', slots: {}, state: 'InProgress' },
          dialogAction: {},
        },
        messages: [
          { contentType: 'ImageResponseCard', imageResponseCard: imageCard },
        ],
      });

      const client = createClient(send);
      const response = await client.postText('show options');

      expect(response.responseCardLexV2).toHaveLength(1);
      expect(response.responseCardLexV2[0].genericAttachments[0]).toEqual(imageCard);
    });
  });
});
