# Application Security Review — 2026-05-26

## Summary

One **High** severity issue was validated with a complete attack path. A fix is included in this branch.

---

## HIGH — Arbitrary S3 object read via Q Business file attachments

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Location** | `src/qbusiness-lambda/index.py` (`getAttachments`, `getS3File`), `templates/lexbot.yaml` (`S3ImportBucketPolicy`), `lex-web-ui/src/store/actions.js` (`lexPostText`) |
| **Affected deployments** | Stacks with Amazon Q Business enabled (`AmazonQAppId` set) |

### Attacker

An authenticated chat user (Cognito identity with Lex runtime access). No admin or Lambda invoke rights required.

### Attacker-controlled input

The Lex session attribute `userFilesUploaded`, a JSON array of objects with `s3Path` and `fileName`. The browser sends all `sessionAttributes` on every `RecognizeText` call (`lex-web-ui/src/lib/lex/client.js`).

The attribute can be set without using the upload UI:

1. **URL query config** — `lexWebUiConfig` is parsed at load time (`lex-web-ui/src/config/index.js`) and copied into session state in `initLexClient`.
2. **Browser devtools / script** — `setLexSessionAttributeValue` mutates in-memory session state.
3. **Embedded parent `setSessionAttribute` postMessage** — if `parentOrigin` is misconfigured, a hostile parent page can set the attribute.

Example query parameter (abbreviated):

```text
?lexWebUiConfig={"lex":{"sessionAttributes":{"userFilesUploaded":"[{\"s3Path\":\"s3://OTHER-BUCKET/secret.pdf\",\"fileName\":\"x.pdf\"}]"}}}
```

### Reachability (end-to-end)

1. Attacker sets `userFilesUploaded` to point at any `s3://bucket/key` in the account.
2. Attacker sends a chat message; `lexPostText` forwards `context.state.lex.sessionAttributes` to Lex (`lex-web-ui/src/store/actions.js`).
3. Lex invokes the Q Business fulfillment Lambda with those attributes in `event.sessionState.sessionAttributes`.
4. `getAttachments()` parses `userFilesUploaded` and calls `getS3File()` for each path with **no bucket or key validation** (`src/qbusiness-lambda/index.py`).
5. The Lambda execution role grants `s3:GetObject` on **`arn:aws:s3:::*/*`** (`templates/lexbot.yaml`, policy `S3ImportBucketPolicy`).

### Impact

**Cross-bucket read (IDOR):** Any S3 object the Lambda role can read in the AWS account (and objects allowed by bucket policies) can be pulled into the fulfillment flow and passed to Amazon Q as an attachment. This bypasses the intended upload bucket boundary documented for file upload (`README-file-upload.md`).

Data exposure includes secrets, backups, CloudFormation templates, and other tenants’ data in shared-account setups.

### Remediation (this PR)

1. **IAM:** Restrict `s3:GetObject` to the configured upload bucket only (`UploadBucket` parameter on `lexbot.yaml`).
2. **Lambda:** Add `UPLOAD_BUCKET_NAME` and validate every `s3Path` (allowed bucket, no `..` in key) before `GetObject`.
3. **Client:** Do not initialize `userFilesUploaded` from static/URL config; only the `uploadFile` action may populate it.
