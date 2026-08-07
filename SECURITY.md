# Security policy

## Reporting a vulnerability

Report it privately through GitHub. Go to the **Security** tab of
https://github.com/keivanmalhani/weapon-report and choose **Report a
vulnerability** to open a private advisory. That goes to the maintainer and
stays private until there is a fix.

Please do not open a public issue for a vulnerability.

Include what you did, what happened, and what you expected. Whatever reproduces
it, an input file, a command line, a link, helps more than a description of it.

## Scope

In scope is anything that makes the site read, write, send or delete something
the visitor did not ask for. That includes:

- reading or exfiltrating the visitor's Bungie API key, or sending it anywhere
  other than bungie.net
- making requests on the visitor's behalf that they did not trigger
- a crafted Bungie API response that leads to script execution when rendered
- writing to or clearing browser storage beyond the key or keys named below
- anything in the build or release pipeline that could put code the maintainer
  did not write onto the published site

Out of scope: reports about Bungie's API itself, which belong to Bungie;
missing hardening headers with no demonstrated impact; output from an automated
scanner with no working proof; and the fact that a visitor can read their own
key out of their own browser storage, which is where they put it.

## What this app is

A static site. There is no server, no database and no backend of any kind. It
is HTML, CSS and JavaScript served from GitHub Pages.

It holds no API key of its own. There is no key in the repository, in the
build, or in any deployed asset. The key is the visitor's own, entered by them,
kept in their browser, and sent only to bungie.net. There is no credential for
an attacker to steal from this project, and nothing the maintainer can leak on
a visitor's behalf.

Browser storage holds two things: the visitor's API key under
`weapon-report.api-key`, and a cached copy of Bungie's weapon definitions,
keyed by manifest version so a new manifest replaces it.

Nothing travels in the URL. The account being looked at is not put in the
address bar.

## Supported versions

The most recent tagged release is the supported version. Fixes are made there
and deployed to https://keivanmalhani.github.io/weapon-report/. Older tags do
not get backported fixes.
