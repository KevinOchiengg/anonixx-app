"""Pull the sound out of a video into an m4a file, with ffmpeg (bundled by imageio-ffmpeg)."""
import asyncio
import os
import re
import tempfile
from typing import Optional

MAX_SECONDS = 600
TIMEOUT = 180

_DURATION = re.compile(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)")


class ExtractError(Exception):
    pass


def _ffmpeg() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:  # missing package or binary
        raise ExtractError("Audio extraction isn't available on the server.") from e


async def extract_audio(src: str, start: float = 0.0, end: Optional[float] = None) -> tuple[bytes, float]:
    """Returns (m4a bytes, length in seconds) for src between start and end."""
    start = max(0.0, start)
    length = MAX_SECONDS if end is None else min(MAX_SECONDS, end - start)
    if length <= 0.5:
        raise ExtractError("Pick at least a second of the video.")
    fd, out = tempfile.mkstemp(suffix=".m4a")
    os.close(fd)
    try:
        proc = await asyncio.create_subprocess_exec(
            _ffmpeg(), "-hide_banner", "-nostdin", "-y",
            "-ss", f"{start:.2f}", "-i", src, "-t", f"{length:.2f}",
            "-vn", "-map", "0:a:0", "-ac", "2", "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", out,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, err = await asyncio.wait_for(proc.communicate(), TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            raise ExtractError("The video took too long to read. Try a shorter part.")
        log = err.decode("utf-8", "ignore")
        if proc.returncode != 0:
            if "matches no streams" in log or "does not contain any stream" in log:
                raise ExtractError("This video has no sound.")
            raise ExtractError("Couldn't read the video's sound.")
        data = open(out, "rb").read()
        if len(data) < 1024:
            raise ExtractError("This video has no sound.")
        times = _DURATION.findall(log)
        if times:
            h, m, s = times[-1]
            seconds = int(h) * 3600 + int(m) * 60 + float(s)
        else:
            seconds = length
        return data, round(seconds, 2)
    finally:
        try:
            os.remove(out)
        except OSError:
            pass
