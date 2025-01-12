# whenst

Depends on [SpatiaLite](https://www.gaia-gis.it/fossil/libspatialite/index):

- `brew install spatialite-tools` on macOS, `apt install libsqlite3-mod-spatialite` on Ubuntu
- set `mod_spatialite.dylib` path as `WHENST_SPATIALITE_MOD` env var

## Scripts

- `npm run build` to compile server and client
- `npm run watch` watches source files and recompiles server/client on changes
- `npm start` starts the server on [localhost:3000](http://localhost:3000)
- `npm run fmt` lints and formats code

## Generating `.data/timezones.db`
_based on [datasette.io/tutorials/spatialite](https://datasette.io/tutorials/spatialite)_

- `brew install spatialite-tools`
- `pipx install shapefile-to-sqlite`
- Download `timezones-with-oceans-1970.shapefile.zip` from [`evansiroky/timezone-boundary-builder`](https://github.com/evansiroky/timezone-boundary-builder/releases)
- `shapefile-to-sqlite .data/timezones.db timezones-with-oceans-1970.shapefile.zip --table timezones --spatial-index --spatialite_mod=/opt/homebrew/lib/mod_spatialite.dylib`
  - if `fiona` throws `KeyError: 'type'`, you might want to remove `feature.pop("type")` from `shapefile_to_sqlite/utils.py`

### Uploading to fly.io
- `devd .data -p 8000`
- `ngrok http 8000`
- `fly console --machine {id}`
- (on the fly machine) `apt install wget`
- (on the fly machine) `wget "https://{ngok hostname}/timezones.db"`
- (on the fly machine) `litefs import -name timezones.db timezones.db`
