# FM shortlist `.fmf` format

The FM24 build can import and export player shortlist `.fmf` files. The importer
supports archive versions 7 and 8; FM24-native exports are version 8. Version 8
stores a Zstandard-compressed manifest, while version 7 uses a deflate manifest.
The manifest identifies the `.slf` member and its byte range in the archive.

Each member has a 16-byte AES key and 16-byte IV in its payload header, followed
by the encrypted member data. After decrypting the `.slf`, the importer reads the
list name, count, and one 32-bit Football Manager player ID per entry. It accepts
the raw `.slf` representation found in FM24 exports and the compressed form used
by older FMSuperScout-generated files.

The exporter writes the version-8 archive structure, including `image.img`, the
player-list `.slf`, and `_data/details.aom`. The generated file was checked by
loading it in FM24. Import/export round-trips preserve the IDs.

File parsing and matching those IDs to a loaded game are separate steps. The app
only adds players whose IDs occur in its current memory dump. If none match, it
keeps the existing app shortlist and reports that the IDs may belong to another
save or may no longer be in the active database. That warning is a lookup result;
it does not mean the `.fmf` archive failed to parse.
