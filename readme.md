# scrobkit

a minimal CLI toolkit for working with [last.fm] scrobbles

## status of this project

- [x] last.fm api integration (authenticate, scrobble, recent tracks)
- [x] structured error system with typed error codes
- [x] csv import/export with skip directive and quoting
- [x] persistent configuration format
- [x] retry system with exponential backoff + jitter
- [x] cli command routing structure
  - [x] csv scrobbling history i/o
  - [x] [.scrobbler.log] i/o (for [rockbox] and similar projects)
  - [x] format-agnostic architecture
- [x] dry-run mode support
- [x] command-line commands
  - [x] individual track scrobbling
  - [ ] multiple album loop scrobbling
- [x] scrobble correction 
  - [x] using [lotus]
  - [ ] using [musicbrainz] api
- [x] export filtering (date ranges, artist/album filters)

[last.fm]: https://last.fm
[musicbrainz]: https://musicbrainz.org/
[lotus]: https://github.com/katelyynn/lotus
[.scrobbler.log]: https://web.archive.org/web/20110522185339/http://www.audioscrobbler.net/wiki/Portable_Player_Logging
[rockbox]: https://www.rockbox.org/
