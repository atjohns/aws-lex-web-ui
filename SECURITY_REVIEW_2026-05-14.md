# Application Security Review - 2026-05-14

This scheduled review found three validated medium-or-higher issues with concrete attack paths.

## 1. High - Query-controlled sound-effect URL leads to DOM XSS

**Attacker:** An unauthenticated internet attacker who can lure a user to a crafted Lex Web UI URL.

**Input controlled:** The `lexWebUiConfig` query parameter, specifically `ui.enableSFX`, `ui.messageSentSFX`, `ui.messageReceivedSFX`, and optionally `lex.initialUtterance`.

**Attack path:**

1. `lex-web-ui/src/config/index.js` parses `query.lexWebUiConfig` as JSON and merges it into the runtime config. Only `ui.parentOrigin` is removed from query-supplied config; sound-effect settings are accepted.
2. `lex-web-ui/src/store/state.js` enables `isSFXOn` when `ui.enableSFX`, `ui.messageSentSFX`, and `ui.messageReceivedSFX` are present.
3. `lex-web-ui/src/components/LexWeb.vue` renders a `#sound` container whenever `isSFXOn` is true.
4. `lex-web-ui/src/store/actions.js` calls `playSound(context.state.config.ui.messageSentSFX)` before sending a text message, and `playSound` writes the attacker-controlled URL directly into `innerHTML`:

   ```js
   document.getElementById('sound').innerHTML =
     `<audio autoplay="autoplay"><source src="${fileUrl}" type="audio/mpeg" /><embed hidden="true" autostart="true" loop="false" src="${fileUrl}" /></audio>`;
   ```

An attacker can supply a value such as `x" /><img src=x onerror=alert(document.domain)>` for `messageSentSFX`. Because the value is interpolated into an HTML attribute and assigned via `innerHTML`, the payload breaks out of the `src` attribute and executes script. Including `lex.initialUtterance` in the same query config can trigger the send path automatically after initialization.

**Impact:** Arbitrary JavaScript executes in the Lex Web UI origin. In deployments using Cognito login, that script can read tokens from `localStorage`, interact with in-memory AWS credentials, issue Lex or Connect requests as the victim, and tamper with chat content.

**Highest-leverage remediation:** Do not build audio elements with `innerHTML`. Create DOM nodes with `document.createElement`, assign `src` with property setters, and validate sound-effect URLs against allowed schemes such as same-origin `https:` or relative asset URLs. Consider rejecting security-sensitive config keys from `lexWebUiConfig` unless they are explicitly intended to be user-controlled.

## 2. High - Client-controlled Q Business attachment paths allow arbitrary account S3 reads

**Attacker:** An authenticated Lex Web UI user, or any holder of Cognito credentials and a valid login token for the Q Business-enabled bot. In configurations where unauthenticated Lex access is enabled, the Lex invocation is also reachable by unauthenticated identities, though the Q Business path still expects an `idtokenjwt`.

**Input controlled:** Lex V2 `sessionState.sessionAttributes.userFilesUploaded`, sent on `RecognizeText` or `RecognizeUtterance`. The UI normally populates this after upload, but the client can send arbitrary session attributes directly to Lex.

**Attack path:**

1. `templates/cognito.yaml` grants the Cognito authenticated role `lex:RecognizeText`, `lex:RecognizeUtterance`, `lex:DeleteSession`, and `lex:PutSession` on the configured bot alias. The unauthenticated role gets the same Lex actions when `ForceCognitoLogin` is not enabled.
2. `lex-web-ui/src/lib/lex/client.js` sends caller-controlled `sessionAttributes` directly in `RecognizeTextCommand.sessionState.sessionAttributes`.
3. The Q Business fulfillment Lambda reads `event["sessionState"]["sessionAttributes"]["userFilesUploaded"]`, parses it as JSON, and trusts each object `s3Path`:

   ```py
   userFilesUploaded = event["sessionState"]["sessionAttributes"].get("userFilesUploaded", [])
   filesJson = json.loads(userFilesUploaded)
   for userFile in filesJson:
       attachments.append({
           "data": getS3File(userFile["s3Path"]),
           "name": userFile["fileName"]
       })
   ```

4. `getS3File` strips an optional `s3://` prefix, splits the remaining value into bucket and key, and calls `obj.get()` with no bucket, prefix, caller, or upload-bucket validation.
5. `templates/lexbot.yaml` grants the Lambda execution role `s3:GetObject` on `arn:aws:s3:::*/*`.
6. The Lambda passes the fetched bytes as Q Business `attachments`; the attacker can ask Q Business to summarize or quote the attached file content.

**Impact:** A signed Lex caller can cause the fulfillment Lambda to read any S3 object that the Lambda role can access, which is currently every object in every bucket in the account unless separate bucket policies deny it. The object content can be exposed through the Q Business response and is also at risk of disclosure through Lambda logging because the full Q Business input is printed.

**Highest-leverage remediation:** Treat attachment references as untrusted. Scope the Lambda role to the configured upload bucket and expected prefixes only, validate each `s3Path` against that allowlist before reading, and bind uploaded files to a server-side record or opaque attachment ID rather than trusting a client-provided S3 URI. Remove logging of attachment payloads and tokens.

## 3. Medium - Live-chat callers can override the configured Connect contact flow

**Attacker:** Any Cognito identity allowed to invoke the live-chat API. This includes authenticated users when live chat is enabled, and unauthenticated Cognito identities when live chat is enabled and `ForceCognitoLogin` is false.

**Input controlled:** The JSON body sent to `POST /Prod/livechat`, specifically `ContactFlowId` and `InstanceId`.

**Attack path:**

1. `templates/restapi.yaml` exposes `POST /livechat` through API Gateway with `AWS_IAM` authorization.
2. `templates/cognito.yaml` grants Cognito roles `execute-api:Invoke` on `*/Prod/POST/livechat` when live chat is enabled.
3. `src/initiate-chat-lambda/index.js` accepts `ContactFlowId` and `InstanceId` from the request body and uses them instead of the configured environment variables when present:

   ```js
   if (body.hasOwnProperty('ContactFlowId')) {
       contactFlowId = body["ContactFlowId"];
   }
   if (body.hasOwnProperty('InstanceId')) {
       instanceId = body["InstanceId"];
   }
   ```

4. The Lambda role in `templates/restapi.yaml` allows `connect:StartChatContact` on the configured Connect instance and every child resource under that instance: `instance/${ConnectInstanceId}/*`.

The supplied `InstanceId` remains limited by IAM to the configured instance, but the supplied `ContactFlowId` can select other contact flows within that same instance.

**Impact:** A caller can bypass the contact flow selected by the deployment and start chats against other flows in the same Amazon Connect instance. If those flows route to privileged queues, trigger different integrations, collect sensitive data, or incur higher cost, the API becomes an authorization bypass around the intended live-chat entry point.

**Highest-leverage remediation:** Do not accept `ContactFlowId` or `InstanceId` from the request body. Use the deployed `CONTACT_FLOW_ID` and `INSTANCE_ID` environment variables, or reject requests unless body values exactly match them. Also scope the Lambda role to the exact contact-flow ARN needed for this UI where Amazon Connect IAM supports that resource shape.
