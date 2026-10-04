# Background music

Waypoint uses edited background loops from the eight recordings below. All are
licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
The artist-owned track pages and their download links were checked on 2026-10-04.

The visible bilingual music credit must identify the selected title and artist,
link its original track page and the license, and indicate that an edited loop is used.
The authors retain copyright; these edits do not imply their endorsement of Waypoint.

## Recordings and original downloads

| Asset | Recording | Artist | Original download |
| --- | --- | --- | --- |
| `reverie.m4a` | [Reverie](https://www.scottbuckley.com.au/library/reverie/) | Scott Buckley | [MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2020/03/sb_reverie.mp3) |
| `borealis.m4a` | [Borealis](https://www.scottbuckley.com.au/library/borealis/) | Scott Buckley | [MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2019/09/sb_borealis.mp3) |
| `snowfall.m4a` | [Snowfall](https://www.scottbuckley.com.au/library/snowfall/) | Scott Buckley | [MP3](http://www.scottbuckley.com.au/library/wp-content/uploads/2018/12/sb_snowfall.mp3) |
| `moonlight.m4a` | [Moonlight](https://www.scottbuckley.com.au/library/moonlight/) | Scott Buckley | [MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2022/07/Moonlight.mp3) |
| `hiraeth.m4a` | [Hiraeth](https://www.scottbuckley.com.au/library/hiraeth/) | Scott Buckley | [MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2020/06/sb_hiraeth.mp3) |
| `aurora.m4a` | [Aurora](https://www.scottbuckley.com.au/library/aurora/) | Scott Buckley | [MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2021/10/Aurora.mp3) |
| `hymn.m4a` | [Hymn](https://www.scottbuckley.com.au/library/hymn/) | Scott Buckley | [MP3](http://www.scottbuckley.com.au/library/wp-content/uploads/2018/02/sb_hymn.mp3) |
| `dreams-become-real.m4a` | [Dreams Become Real](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1500027) | Kevin MacLeod | [MP3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Dreams%20Become%20Real.mp3) |

Scott Buckley asks that each use name the title, Scott Buckley, CC BY 4.0 and
[www.scottbuckley.com.au](https://www.scottbuckley.com.au/). Each linked track page states its license and attribution format.
Kevin MacLeod asks that uses name the title, Kevin MacLeod (incompetech.com), and
the CC BY 4.0 license: [official attribution and editing guidance](https://incompetech.com/music/royalty-free/faq.html).
`Dreams Become Real` is the official recording with ISRC `USUAN1500027`, verified
against [the artist's track data](https://incompetech.com/music/royalty-free/pieces.json).

## Edits

Each derivative contains only a selected excerpt of its original recording.
A 6-second crossfade blends the last 6 seconds into the first 6 seconds using
complementary sine-squared weights. The loop is rotated so the file boundary
joins consecutive source samples, then moved by less than 0.25 seconds to a
nearby stereo zero crossing to reduce AAC boundary artifacts. No new musical
material, equalization, compression or dynamic limiter was added.

Source ranges below are before crossfading; output duration is 6 seconds shorter.
Aurora uses its quiet ambience after the climax described at 5:00 on the artist's page.
Snowfall stops before its louder final section. Hymn is short enough to retain
nearly its complete piano piece.

Each loop uses a fixed gain to target approximately -20.5 LUFS integrated.
Files are stereo AAC-LC in M4A, 48 kHz, approximately 96 kbps, with the MP4
index placed first for streaming. Frame counts are exact multiples of 1024 to
avoid an extra padded AAC frame at the loop boundary. The player uses volume 0.14.

| Asset | Source excerpt (seconds) | Loop duration | Fixed gain | Boundary rotation adjustment |
| --- | ---: | ---: | ---: | ---: |
| `reverie.m4a` | 19.000–185.000 | 160 s | -6.35 dB | -0.155396 s |
| `borealis.m4a` | 23.500–189.500 | 160 s | -4.41 dB | -0.107667 s |
| `snowfall.m4a` | 15.500–165.500 | 144 s | -3.48 dB | -0.064083 s |
| `moonlight.m4a` | 22.000–188.000 | 160 s | -6.12 dB | +0.009250 s |
| `hiraeth.m4a` | 10.500–176.500 | 160 s | -6.79 dB | -0.156229 s |
| `aurora.m4a` | 320.500–486.500 | 160 s | +2.42 dB | -0.136979 s |
| `hymn.m4a` | 0.000–118.000 | 112 s | -1.88 dB | -0.099812 s |
| `dreams-become-real.m4a` | 54.000–220.000 | 160 s | +3.08 dB | -0.204521 s |

## Technical verification

The final encoded assets were decoded and checked for exact duration, stereo
channels, 48 kHz sample rate, clipping, integrated loudness, true peak, and a
boundary sample step within ordinary nearby waveform changes. Loudness and
true-peak values below are measured on the decoded final AAC files, not their sources.

| Asset | Size | Integrated loudness | True peak | Boundary sample step |
| --- | ---: | ---: | ---: | ---: |
| `reverie.m4a` | 1,957,949 bytes | -20.55 LUFS | -6.78 dBTP | -66.28 dBFS |
| `borealis.m4a` | 1,959,331 bytes | -20.53 LUFS | -6.63 dBTP | -48.70 dBFS |
| `snowfall.m4a` | 1,762,269 bytes | -20.58 LUFS | -4.26 dBTP | -48.44 dBFS |
| `moonlight.m4a` | 1,957,754 bytes | -20.56 LUFS | -6.70 dBTP | -36.88 dBFS |
| `hiraeth.m4a` | 1,957,075 bytes | -20.57 LUFS | -7.51 dBTP | -38.69 dBFS |
| `aurora.m4a` | 1,957,495 bytes | -20.55 LUFS | -7.29 dBTP | -44.05 dBFS |
| `hymn.m4a` | 1,370,803 bytes | -20.56 LUFS | -3.17 dBTP | -58.84 dBFS |
| `dreams-become-real.m4a` | 1,964,107 bytes | -20.53 LUFS | -6.24 dBTP | -48.76 dBFS |

These technical checks do not constitute a subjective headphone audition or
real-phone/browser confirmation of gapless playback. Those checks belong to
the site playback validation.

Original downloads, hashes, source-page snapshots, preparation scripts and
machine-readable measurements are retained locally in ignored `.local/music/`.
Only the edited M4A assets and this provenance record belong in the public build.
