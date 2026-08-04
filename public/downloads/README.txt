Honest Boost — Placeholder Bundle
====================================

Status: BETA — no signed installer has been published yet.

The real signed installer (HonestBoost-setup.exe) is not yet available in this release channel.
Until it is published, this file is served in its place by /api/download so the
download flow can be smoke-tested end-to-end.

How to install the real binary when it ships:
  1. Place the signed installer at  public/downloads/honest-boost-installer.exe
  2. Update server.js:  app.get('/api/download', ...)  to return the new URL.
  3. Update public/index.html download filename to 'HonestBoost-setup.exe'.

Notes on third-party tools:
  NVCleanstall_1.19.0.exe is shipped for reference only. Verify the upstream
  license (https://www.techpowerup.com/) before redistributing it inside the
  installer. The default Honest Boost build does NOT bundle it.

For updates, see /changelog.html.
