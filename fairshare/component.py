from functools import lru_cache
from pathlib import Path

from streamlit.components import v2 as components_v2


FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"


def _read_asset(file_name: str) -> str:
    path = FRONTEND_DIST / file_name
    if not path.exists():
        raise FileNotFoundError(f"FairShare's React bundle is missing: {path}")
    return path.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def get_fairshare_ui():
    return components_v2.component(
        "fairshare_react_app",
        html='<div id="fairshare-root"></div>',
        css=_read_asset("fairshare.css"),
        js=_read_asset("fairshare.js"),
        isolate_styles=True,
    )
