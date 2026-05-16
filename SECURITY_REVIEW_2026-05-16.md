# Application Security Review - 2026-05-16

## Finding 1: High - Q Business fulfillment can read arbitrary S3 objects from Lex session attributes

- **Attacker:** Any authenticated web UI user with the Cognito-issued browser credentials for the deployed Lex bot.
- **Controlled input:** The Lex `sessionState.sessionAttributes.userFilesUploaded` value supplied through `RecognizeText`, `RecognizeUtterance`, or `PutSession`.
- **Path:** The Cognito authenticated role allows `lex:RecognizeText`, `lex:RecognizeUtterance`, `lex:DeleteSession`, and `lex:PutSession` on the bot alias (`templates/cognito.yaml`). The Q Business fulfillment Lambda reads `event["sessionState"]["sessionAttributes"]["userFilesUploaded"]`, parses each attacker-supplied `s3Path`, and calls `boto3.resource('s3').Object(bucket, key).get()` without validating that the object belongs to the upload bucket or to the caller's prefix (`src/qbusiness-lambda/index.py`). The Lambda execution role grants `s3:GetObject` on `arn:aws:s3:::*/*` (`templates/lexbot.yaml`), so those attacker-supplied paths are authorized broadly.
- **Impact:** A user can make the fulfillment Lambda fetch objects from any bucket/key the Lambda role can read, then pass those bytes as Amazon Q attachments. By asking Q to summarize or quote the attachment, the user can exfiltrate S3 object contents that should not be available through the chat UI.
- **Highest-leverage remediation:** Treat `userFilesUploaded` as an untrusted reference, not an authorization decision. Pass the configured upload bucket into the Lambda, validate every `s3Path` against that bucket and the caller's Cognito identity/session prefix, reject malformed or out-of-scope keys before reading S3, and replace the Lambda role's `arn:aws:s3:::*/*` grant with the narrow upload bucket/prefix ARN required for attachments.

## Finding 2: High - CloudFormation-controlled speech text reaches a shell `exec` in CodeBuild

- **Attacker:** A principal that can update this stack's configuration parameters or otherwise control the CodeBuild environment variables, but should not have arbitrary CodeBuild-role command execution.
- **Controlled input:** `WebAppConfBotInitialSpeech`, which is passed into the CodeBuild environment as `BOT_INITIAL_SPEECH` and merged into `revisedConfig.lex.initialSpeechInstruction`.
- **Path:** `build/update-lex-web-ui-config.js` strips only quote characters from `initialSpeechInstruction` and interpolates the result into `aws polly synthesize-speech --text "${text}" ...`, then runs the complete command string with `child_process.exec`. Shell substitutions such as `$(...)` and backticks still execute inside double quotes, so a malicious stack parameter value becomes arbitrary shell code during the deployment build.
- **Impact:** The attacker can execute commands as the CodeBuild project role, allowing web UI supply-chain tampering through the web bucket and abuse of the role's S3, CloudFront invalidation, Polly, Translate, and CloudWatch Logs permissions.
- **Highest-leverage remediation:** Replace `exec` with `execFile` or `spawn` and pass AWS CLI arguments as an array so shell metacharacters are never interpreted. Add an allow-list or length-limited validation pattern for CloudFormation speech parameters as defense in depth.
