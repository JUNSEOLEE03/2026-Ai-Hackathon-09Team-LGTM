import io
import ipaddress
import re
import socket
import struct
import zipfile
import zlib
from urllib.error import HTTPError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree as ET

import pymupdf as fitz

MAX_BYTES = 2_000_000
TIMEOUT = 12
MAX_REDIRECTS = 4
USER_AGENT = "Mozilla/5.0 (compatible; WonjuOnCloud/2.0)"


# ---------------------------------------------------------------------------
# 공개 URL 읽기 (SSRF 방어 포함)
# ---------------------------------------------------------------------------

def public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local
        or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


def error_for_url(url: str) -> str | None:
    """공개 인터넷 주소가 아니면 사용자에게 보여 줄 오류 문장을, 괜찮으면 None을 반환"""
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return "주소 형식이 올바르지 않습니다."
    if parsed.scheme not in {"http", "https"}:
        return "http 또는 https 주소만 읽을 수 있습니다."
    if parsed.username or parsed.password:
        return "아이디나 비밀번호가 포함된 주소는 읽지 않습니다."
    host = parsed.hostname
    if not host or host.lower() in {"localhost", "localhost.localdomain"}:
        return "유효하지 않거나 내부망인 주소입니다."
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError:
        return "주소의 포트 번호가 올바르지 않습니다."
    try:
        infos = socket.getaddrinfo(host, port)
    except Exception:
        return "주소의 서버를 찾지 못했습니다."
    for info in infos:
        if not public_ip(ipaddress.ip_address(info[4][0])):
            return "내부망으로 연결되는 주소는 읽지 않습니다."
    return None


class _NoRedirect(HTTPRedirectHandler):
    """urllib이 리다이렉트를 몰래 따라가지 않게 막음.
    (기본 동작이면 내부망으로 보내는 리다이렉트가 error_for_url 검사를 건너뜀)"""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = build_opener(_NoRedirect)

_META_CHARSET = re.compile(rb"""<meta[^>]+charset\s*=\s*["']?\s*([\w.-]+)""", re.I)


def _decode_html(payload: bytes, content_type: str) -> str:
    """HTTP 헤더 → <meta charset> → UTF-8 → CP949(EUC-KR) 순서로 인코딩을 정해 디코딩"""
    candidates = []
    m = re.search(r"charset=([\w.-]+)", content_type or "", flags=re.I)
    if m:
        candidates.append(m.group(1))
    m = _META_CHARSET.search(payload[:4096])
    if m:
        candidates.append(m.group(1).decode("ascii", "ignore"))
    candidates += ["utf-8", "cp949"]
    for enc in candidates:
        enc = enc.lower()
        if enc in ("euc-kr", "ks_c_5601-1987", "ksc5601"):
            enc = "cp949"  # EUC-KR의 상위 호환 (공공기관 옛 페이지 대응)
        try:
            return payload.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return payload.decode("utf-8", errors="replace")


def clean_text(value: str) -> str:
    value = (
        value.replace("&nbsp;", " ").replace("&amp;", "&")
        .replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", '"').replace("&#39;", "'")
    )
    value = re.sub(r"[ \t]{2,}", " ", value)
    value = re.sub(r"[ \t]*\n[ \t]*", "\n", value)
    return value.strip()


_MAIN_DIV = re.compile(r"<div\b[^>]*\bid=[\"']contents?[\"'][^>]*>", re.I)


def slice_main_html(raw: str) -> str:
    match = _MAIN_DIV.search(raw)
    if not match:
        return raw
    index = match.end()
    depth = 1
    lower = raw.lower()
    while index < len(raw) and depth:
        next_open = lower.find("<div", index)
        next_close = lower.find("</div", index)
        if next_close == -1:
            break
        if next_open != -1 and next_open < next_close:
            depth += 1
            index = next_open + 4
        else:
            depth -= 1
            end = raw.find(">", next_close)
            index = end + 1 if end != -1 else len(raw)   # </div> 태그를 중간에서 자르지 않음
    return raw[match.start():index]


_COMMENT = re.compile(r"(?s)<!--.*?-->")
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_HIDDEN = re.compile(r"(?is)<(title|script|style|noscript)\b[^>]*>.*?</\1>")
_BREAKS = re.compile(r"(?i)<(br\s*/?|/?(p|div|h[1-6]|li|tr|section|article|table)\b[^>]*)>")
_TAGS = re.compile(r"<[^>]+>")


def html_to_text(raw: str) -> tuple[str, str]:
    raw = _COMMENT.sub(" ", raw)
    # <title>은 본문 영역을 잘라 내기 전에 찾아야 함 (잘라 낸 뒤에는 <head>가 없어짐)
    title_match = _TITLE.search(raw)
    title = clean_text(title_match.group(1)) if title_match else ""
    raw = slice_main_html(raw)
    without_hidden = _HIDDEN.sub(" ", raw)
    with_breaks = _BREAKS.sub("\n", without_hidden)
    text = clean_text(_TAGS.sub(" ", with_breaks))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    for marker in ("콘텐츠 만족도", "만족도 조사", "배너모음", "배너 모음", "개인정보처리방침"):
        at = text.find(marker)
        if at != -1:
            text = text[:at].strip()
    return title, text


def _pdf_text_from_bytes(payload: bytes) -> str:
    with fitz.open(stream=payload, filetype="pdf") as doc:
        if doc.needs_pass:
            return ""
        return "\n".join(page.get_text("text") for page in doc).strip()


def read_public_url(url: str) -> dict:
    """공개 공고 URL 본문 추출. 리다이렉트마다 내부망 여부를 다시 검사합니다."""
    current = (url or "").strip()
    for _ in range(MAX_REDIRECTS + 1):
        problem = error_for_url(current)
        if problem:
            return {"ok": False, "error": problem}
        req = Request(current, headers={"User-Agent": USER_AGENT, "Accept-Language": "ko-KR,ko;q=0.9"}, method="GET")
        try:
            with _OPENER.open(req, timeout=TIMEOUT) as resp:
                content_type = resp.headers.get("Content-Type", "")
                payload = resp.read(MAX_BYTES + 1)
                final_url = resp.geturl()
        except HTTPError as exc:
            location = exc.headers.get("Location") if exc.headers else None
            if exc.code in {301, 302, 303, 307, 308} and location:
                current = urljoin(current, location)
                continue
            return {"ok": False, "error": "공고 페이지가 열리지 않았습니다. (HTTP %d)" % exc.code}
        except Exception:
            return {"ok": False, "error": "공고 페이지에 연결하지 못했습니다."}

        if len(payload) > MAX_BYTES:
            return {"ok": False, "error": "페이지가 너무 큽니다. 공고 파일을 직접 올려 주세요."}

        if payload.startswith(b"%PDF") or "pdf" in content_type.lower():
            try:
                text = _pdf_text_from_bytes(payload)
            except Exception:
                return {"ok": False, "error": "PDF를 열지 못했습니다. 파일을 직접 올려 주세요."}
            if not text:
                return {"ok": False, "error": "PDF에서 글자를 찾지 못했습니다."}
            return {"ok": True, "url": final_url, "title": "", "text": text}

        title, text = html_to_text(_decode_html(payload, content_type))
        if len(text) < 20:
            return {"ok": False, "error": "본문을 읽지 못했습니다. 문서 파일을 올려 주세요."}
        return {"ok": True, "url": final_url, "title": title, "text": text}
    return {"ok": False, "error": "페이지 이동이 너무 많아 멈췄습니다."}


# ---------------------------------------------------------------------------
# 한글 문서(HWP, HWPX) 읽기
# ---------------------------------------------------------------------------

_KEEP_PUNCT = set("·※○●□■▶▷◆◇「」『』【】∼～")


def visible_text(value: str) -> str:
    kept = []
    for char in value:
        code = ord(char)
        if char in "\n\t " or 32 <= code <= 126 or 0xAC00 <= code <= 0xD7A3 or 0x3131 <= code <= 0x318E:
            kept.append(char)
        elif 0x2010 <= code <= 0x205E or 0x3000 <= code <= 0x303F or 0xFF01 <= code <= 0xFF60:
            kept.append(char)
        elif char in _KEEP_PUNCT:
            kept.append(char)
        elif code < 32 or 0xE000 <= code <= 0xF8FF:
            kept.append("\n")
    text = re.sub(r"[ \t]+\n", "\n", "".join(kept))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


# HWP 5.0 제어 문자: 1 WCHAR짜리(문자 컨트롤)와 8 WCHAR짜리(인라인·확장 컨트롤)가 있음
_HWP_CHAR_CTRLS = {0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31}
_HWPTAG_PARA_TEXT = 67


def _hwp_para_text(chunk: bytes) -> str:
    out = []
    i, n = 0, len(chunk) - 1
    while i < n:
        code = chunk[i] | (chunk[i + 1] << 8)
        i += 2
        if code >= 32:
            out.append(chr(code))
        elif code in (10, 13):
            out.append("\n")
        elif code == 9:          # 탭(인라인 컨트롤)
            out.append("\t")
            i += 14
        elif code in (30, 31):   # 묶음 빈칸, 고정폭 빈칸
            out.append(" ")
        elif code in _HWP_CHAR_CTRLS:
            pass
        else:                    # 표·각주·필드 등 8 WCHAR 컨트롤: 나머지 7 WCHAR(14바이트) 건너뜀
            i += 14
    return "".join(out)


def read_hwp(payload: bytes) -> str:
    """한글(.hwp) 파일 텍스트 추출"""
    import olefile
    with olefile.OleFileIO(io.BytesIO(payload)) as compound:
        # FileHeader 속성: bit0 = 압축 여부, bit1 = 암호, bit2 = 배포용 문서
        header = compound.openstream("FileHeader").read()
        props = struct.unpack_from("<I", header, 36)[0] if len(header) >= 40 else 1
        if props & 0b10:
            raise ValueError("암호가 걸린 한글 문서입니다.")
        compressed = bool(props & 0b1)

        sections = sorted(
            ("/".join(p) for p in compound.listdir() if "/".join(p).startswith("BodyText/Section")),
            key=lambda name: int(re.sub(r"\D", "", name) or 0),
        )
        paragraphs = []
        for name in sections:
            data = compound.openstream(name).read()
            if compressed:
                data = zlib.decompress(data, -15)
            idx = 0
            while idx + 4 <= len(data):
                rec = struct.unpack_from("<I", data, idx)[0]
                idx += 4
                tag = rec & 0x3FF
                size = (rec >> 20) & 0xFFF
                if size == 0xFFF:
                    size = struct.unpack_from("<I", data, idx)[0]
                    idx += 4
                if tag == _HWPTAG_PARA_TEXT:
                    paragraphs.append(_hwp_para_text(data[idx:idx + size]))
                idx += size
    return visible_text("\n".join(paragraphs))


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def read_hwpx(payload: bytes) -> str:
    """한글(.hwpx) 파일 텍스트 추출.
    표 안의 문단은 바깥 문단과 따로 한 번씩만 읽고, <t> 안의 탭·줄바꿈 뒤 글자(tail)도 빠뜨리지 않음"""
    lines: list[str] = []

    def walk(node, buf):
        name = _local(node.tag)
        if name == "p":
            slot = len(lines)
            lines.append("")          # 자리를 먼저 잡아 두어 표 안 문단보다 앞에 오게 함
            own: list[str] = []
            for child in node:
                walk(child, own)
            lines[slot] = "".join(own).strip()
            return
        if name == "t":
            if node.text:
                buf.append(node.text)
            for child in node:
                child_name = _local(child.tag)
                if child_name == "tab":
                    buf.append("\t")
                elif child_name in ("lineBreak", "lineBreakChar"):
                    buf.append("\n")
                if child.tail:
                    buf.append(child.tail)
            return
        for child in node:
            walk(child, buf)

    with zipfile.ZipFile(io.BytesIO(payload)) as pkg:
        names = sorted(
            (n for n in pkg.namelist() if n.startswith("Contents/section") and n.endswith(".xml")),
            key=lambda n: int(re.sub(r"\D", "", n) or 0),
        )
        for name in names:
            walk(ET.fromstring(pkg.read(name)), [])
    return visible_text("\n".join(line for line in lines if line))


def read_notice_payload(payload: bytes) -> dict:
    """PDF 총괄표 및 HWP/HWPX 통합 리더 (팀원 /api/read-pdf 호환)"""
    try:
        if payload.startswith(b"%PDF"):
            text = _pdf_text_from_bytes(payload)
            if text:
                return {"ok": True, "title": "", "text": text, "programs": []}
        elif payload.startswith(b"PK"):
            text = read_hwpx(payload)
            if len(text) >= 20:
                return {"ok": True, "title": "", "text": text, "programs": []}
        elif payload.startswith(b"\xd0\xcf\x11\xe0"):
            text = read_hwp(payload)
            if len(text) >= 20:
                return {"ok": True, "title": "", "text": text, "programs": []}
    except Exception:
        pass
    return {"ok": False, "error": "문서에서 글자를 읽지 못했습니다. PDF나 HWP/HWPX 파일을 확인해 주세요."}