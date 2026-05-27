# Application Security Review — 2026-05-27

Scheduled review of `aws-lex-web-ui` v0.24.0. Findings below have verified end-to-end attack paths.

---

## 1. [Critical] Arbitrary S3 object read via Q Business file attachments

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Location** | `src/qbusiness-lambda/index.py` (`getAttachments`), `templates/lexbot.yaml` (Lambda `s3:GetObject` on `arn:aws:s3:::*/*`) |
| **Attacker** | Authenticated Cognito user chatting with the Q Business Lex bot |
| **Controlled input** | Lex session attribute `userFilesUploaded` (JSON array of `{ s3Path, fileName }`), set from the browser before the next fulfillment |
| **Attack path** | User sets `userFilesUploaded` to `s3://<any-bucket>/<any-key>` (browser devtools, `setSessionAttribute` postMessage, or tampered client state) → sends a chat utterance → fulfillment Lambda calls `getS3File()` on the attacker-chosen URI → Lambda role has `s3:GetObject` on `*/*` → object bytes are attached to the Amazon Q request |
| **Impact** | Read arbitrary S3 objects in the account accessible to the Lambda role (secrets, backups, other tenants’ upload prefixes) |
| **Remediation** | Restrict Lambda S3 IAM to the upload bucket only; validate each `s3Path` is under `s3://{UPLOAD_BUCKET}/{cognito_sub}/`; derive `userId` from the JWT `sub` claim |

---

## 2. [High] Stored XSS in bot HTML / markdown rendering

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Location** | `lex-web-ui/src/components/MessageText.vue`, `src/config/default-lex-web-ui-loader-config.json`, `src/qbusiness-lambda/index.py` (`format_response`) |
| **Attacker** | Remote chat user (Q Business / CustomPayload bots) or party influencing Q source metadata |
| **Controlled input** | Bot `CustomPayload` markdown/HTML (`alts.markdown`, `alts.html`), including Q Business `systemMessage` and unescaped `sourceAttributions` link HTML |
| **Attack path** | Malicious markdown/HTML in Lex response → `actions.js` assigns `alts.markdown` → `MessageText.vue` runs `marked.parse()` (raw HTML pass-through) → `v-html` with `AllowSuperDangerousHTMLInMessage: true` by default → script runs in victim origin |
| **Impact** | Session theft (`localStorage` Cognito JWTs / refresh tokens), abuse of parent/iframe `getCredentials` bridge for temporary AWS keys |
| **Remediation** | Sanitize all HTML before `v-html` (DOMPurify); escape/allowlist URLs in Q Business source links; default `AllowSuperDangerousHTMLInMessage` to `false` |

---

## 3. [Medium] Amazon Connect contact flow IDOR in initiate-chat API

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Location** | `src/initiate-chat-lambda/index.js` |
| **Attacker** | Unauthenticated or authenticated Cognito principal with `execute-api:Invoke` on `POST /livechat` |
| **Controlled input** | JSON body fields `InstanceId` and `ContactFlowId` |
| **Attack path** | Attacker obtains temporary IAM credentials from the identity pool → signs `POST /livechat` with alternate `ContactFlowId` (same Connect instance; IAM allows `instance/{id}/*`) → Lambda calls `StartChatContact` with attacker-supplied flow ID instead of configured defaults |
| **Impact** | Unauthorized live chats on non-public contact flows (queue flooding, social engineering agents, bypassing intended IVR routing) when flow UUIDs are known or leaked |
| **Remediation** | Use only `INSTANCE_ID` and `CONTACT_FLOW_ID` environment variables in the Lambda; ignore client-supplied overrides |
