# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do not open a public issue, discussion, or pull
request containing vulnerability details while the issue remains unresolved.

1. Use GitHub's **Security** tab and select **Report a vulnerability**. You can also start a private
   report at <https://github.com/pavankh84/voicememo-converter/security/advisories/new>.
2. Include the affected component, reproduction steps, impact, and any suggested mitigation.
3. Remove recordings, transcripts, personal data, access tokens, and other secrets from the report.

If private vulnerability reporting is unavailable, open a public issue that only asks the maintainers
to provide a private reporting channel. Do not include vulnerability details in that issue.

Maintainers will acknowledge the report, assess its impact, and coordinate a fix and disclosure when
appropriate. Please allow a reasonable remediation period before publishing details.

## Scope

Security reports may include, for example:

- Unexpected upload or disclosure of audio, transcripts, filenames, or metadata.
- Cross-site scripting or unsafe handling of file-derived content.
- Dependency or service-worker behavior that compromises the client-side privacy model.
- Exposure of secrets or unauthorized modification of generated downloads.

General bugs and feature requests should use the repository's public issue templates.
