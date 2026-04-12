# scrobkit

a minimal CLI toolkit for working with [last.fm] scrobbles

## status of this project

- [x] last.fm api integration (authenticate, scrobble, recent tracks)
- [x] structured error system with typed error codes
- [x] csv import/export with skip directive and quoting
- [x] persistent configuration format
- [x] retry system with exponential backoff + jitter
- [ ] cli command routing structure
  - [ ] individual track scrobbling
  - [ ] multipple album loop scrobbling
  - [ ] csv scrobbling history i/o
  - [ ] [.scrobbler.log] i/o (for [rockbox] and similar projects)
- [ ] dry-run mode support
- [ ] scrobble correction using [musicbrainz] api and [lotus]
- [ ] conflict detection & resolution (timestamp + duplicates)
- [ ] export filtering (date ranges, artist/album filters)
- [ ] structured summary report (per artist/album breakdown)

[last.fm]: https://last.fm
[musicbrainz]: https://musicbrainz.org/
[lotus]: https://github.com/katelyynn/lotus
[.scrobbler.log]: https://web.archive.org/web/20110522185339/http://www.audioscrobbler.net/wiki/Portable_Player_Logging
[rockbox]: https://www.rockbox.org/
