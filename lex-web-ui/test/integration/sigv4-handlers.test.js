/**
 * Regression tests for AWS Signature V4 signing utilities.
 * Covers sigv4-handlers.js introduced in the SigV4 migration (streaming / API auth).
 */

const TEST_CREDENTIALS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  sessionToken: 'test-session-token',
};

const SNAKE_CASE_CREDENTIALS = {
  access_key: 'AKIAIOSFODNN7EXAMPLE',
  secret_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  session_token: 'test-session-token',
};

const SERVICE_INFO = { region: 'us-east-1', service: 'execute-api' };

describe('sigv4-handlers', () => {
  let signRequest;
  let signUrl;

  beforeAll(async () => {
    const handlers = await import('../../src/store/sigv4-handlers.js');
    signRequest = handlers.signRequest;
    signUrl = handlers.signUrl;
  });

  describe('signRequest', () => {
    test('adds SigV4 authorization and security token headers', async () => {
      const signed = await signRequest(
        {
          url: 'https://execute-api.us-east-1.amazonaws.com/prod/recognize',
          method: 'POST',
          data: '{"text":"hello"}',
          mode: 'cors',
        },
        TEST_CREDENTIALS,
        SERVICE_INFO,
      );

      expect(signed.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
      expect(signed.headers['x-amz-security-token']).toBe('test-session-token');
      expect(signed.method).toBe('POST');
      expect(signed.mode).toBe('cors');
      expect(signed.url).toContain('execute-api.us-east-1.amazonaws.com');
    });

    test('accepts snake_case credential fields from Cognito-style payloads', async () => {
      const signed = await signRequest(
        {
          url: 'https://runtime-v2-lex.us-east-1.amazonaws.com/bots/test/aliases/live',
          method: 'GET',
        },
        SNAKE_CASE_CREDENTIALS,
        { region: 'us-east-1', service: 'lex' },
      );

      expect(signed.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
      expect(signed.headers['x-amz-security-token']).toBe('test-session-token');
    });

    test('signs requests whose URL includes query string parameters', async () => {
      const signed = await signRequest(
        {
          url: 'https://execute-api.us-east-1.amazonaws.com/prod/stream?sessionId=sess-123',
          method: 'GET',
        },
        TEST_CREDENTIALS,
        SERVICE_INFO,
      );

      expect(signed.url).toContain('execute-api.us-east-1.amazonaws.com/prod/stream');
      expect(signed.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    });
  });

  describe('signUrl', () => {
    test('presigns HTTPS URLs with query authentication parameters', async () => {
      const signed = await signUrl(
        'https://execute-api.us-east-1.amazonaws.com/prod/stream?sessionId=sess-456',
        TEST_CREDENTIALS,
        SERVICE_INFO,
        300,
      );

      const parsed = new URL(signed);
      expect(parsed.protocol).toBe('https:');
      expect(parsed.searchParams.get('sessionId')).toBe('sess-456');
      expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();
      expect(parsed.searchParams.get('X-Amz-Credential')).toContain('AKIAIOSFODNN7EXAMPLE');
    });

    test('presigns WebSocket URLs over HTTPS but returns wss protocol', async () => {
      const signed = await signUrl(
        'wss://execute-api.us-east-1.amazonaws.com/prod/stream?sessionId=sess-789',
        TEST_CREDENTIALS,
        SERVICE_INFO,
        300,
      );

      const parsed = new URL(signed);
      expect(parsed.protocol).toBe('wss:');
      expect(parsed.searchParams.get('sessionId')).toBe('sess-789');
      expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();
    });
  });
});
