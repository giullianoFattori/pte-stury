# Synthetic audio fixtures

`tone.mp3` is a 250 ms 440 Hz mono sine at 22,050 Hz, encoded at 32 kbit/s
by development ffmpeg with metadata removed and bitexact flags. It contains no
speech or copyrighted recording. The `wfd/` and `rs/` copies supply local bytes
for existing deterministic-build fixtures; they are never production questions.

Tests derive corrupt, truncated, empty, oversized and symlink variants inside
private temporary fixture directories, and remove them after each test.
