# Security review — 2026-05-26

Scheduled application security review of `aws-lex-web-ui`.

## Finding 1: Arbitrary S3 object read via Lex session attributes (Q Business)

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Location** | `src/qbusiness-lambda/index.py` (`getS3File`, `getAttachments`), `templates/lexbot.yaml` (Lambda IAM `S3ImportBucketPolicy`) |
| **CWE** | CWE-918 (SSRF), CWE-200 (Exposure of Sensitive Information) |

### Attacker

Any principal that can call Amazon Lex V2 with custom session attributes on the deployed bot alias. In the default stack this includes **unauthenticated** users when `ForceCognitoLogin` is `false` (the default): the Cognito identity pool exposes `lex:PutSession` and `lex:RecognizeText` to unauthenticated identities (`templates/cognito.yaml`).

### Controlled input

The Lex session attribute `userFilesUploaded`, a JSON array of objects such as:

```json
[{"s3Path": "s3://<any-bucket>/<any-key>", "fileName": "x.pdf"}]
```

This attribute is normally set by the upload UI, but Lex does not restrict who may set session attributes on a session.

### Attack path

1. Read the public web UI config (CloudFront/S3) to obtain `cognito.poolId`, `lex.botId`, and `lex.botAliasId`.
2. Obtain unauthenticated temporary AWS credentials from the Cognito identity pool.
3. Call `lex:PutSession` (or include attributes on `lex:RecognizeText`) with a crafted `userFilesUploaded` pointing at a sensitive object, e.g. `s3://corp-secrets-bucket/internal/credentials.json`.
4. Send a user message so the Q Business fulfillment Lambda runs.
5. `getAttachments()` calls `getS3File()` for each entry. Before this fix, IAM allowed `s3:GetObject` on `arn:aws:s3:::*/*`, so the Lambda read arbitrary objects in the account. With a valid `idtokenjwt`, file bytes were passed to `qbusiness:ChatSync` as attachments (potential exfiltration via model response). Without a valid token, `getAttachments()` still executed `GetObject` before authentication failed.

### Impact

Cross-bucket read of S3 objects accessible to the fulfillment Lambda role (previously the entire account), including buckets unrelated to Lex Web UI uploads. This breaks tenant isolation for any deployment using Amazon Q Business integration.

### Remediation (this PR)

1. **IAM**: Restrict `s3:GetObject` to `arn:...:s3:::${UploadBucket}/*` when an upload bucket is configured.
2. **Application**: Enforce the same bucket allowlist in `getS3File()` via `UPLOAD_S3_BUCKET`, reject path traversal in keys, and skip invalid attachments instead of failing open.
3. **Operational**: Set `ForceCognitoLogin` to `true` for Q Business deployments; scope the upload bucket to least privilege.

## Items reviewed without a validated medium+ finding

- **Initiate Connect chat Lambda** (`src/initiate-chat-lambda/index.js`): API Gateway uses `AWS_IAM`; instance/contact flow overrides in the body are still bounded by the Lambda role’s Connect resources.
- **WebSocket streaming connect** (`src/streaming-lambda/index.js`): `$connect` requires `AWS_IAM`.
- **iframe `postMessage`**: Parent/iframe origins are checked on inbound messages; `parentOrigin` cannot be overridden from iframe config at runtime (`mutations.js`).
- **Stored XSS / `AllowSuperDangerousHTMLInMessage`**: Default enables HTML/markdown rendering for bot payloads; this is documented in `templates/master.yaml` and is an intentional trust-the-bot tradeoff, not an unexpected bypass.
- **Connect live chat REST OPTIONS**: Unauthenticated preflight only; `POST` requires IAM.
