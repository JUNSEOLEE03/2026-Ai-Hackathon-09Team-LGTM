from fastapi import FastAPI, UploadFile, File, Form, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio
import logging
import json
import time
import uuid
import os

from app.ai_pipeline import (
    extract_pdf_to_markdown,
    analyze_document_with_bedrock,
    evaluate_welfare_match,
    chat_with_welfare_bot,
    mask_pdf_sensitive_info,
    call_llm,
    PDFProcessError
)
from app.mock_data import PRESET_CACHE
from app.collab_parser import (
    error_for_url,
    read_public_url,
    read_notice_payload,
    read_hwp,
    read_hwpx
)

logger = logging.getLogger("wonju-api")

APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(APP_DIR)

# mock_data.py에 load_welfare_catalog가 없어도 서버가 뜨도록 대체 로더 제공
try:
    from app.mock_data import load_welfare_catalog as _load_catalog_source
except ImportError:
    _CATALOG_CANDIDATES = [
        os.path.join(APP_DIR, "welfareList.json"),
        os.path.join(APP_DIR, "data", "welfareList.json"),
        os.path.join(ROOT_DIR, "data", "welfareList.json"),
        os.path.join(ROOT_DIR, "static", "welfareList.json"),
        os.path.join(ROOT_DIR, "static", "data", "welfareList.json"),
    ]

    def _load_catalog_source() -> list:
        for path in _CATALOG_CANDIDATES:
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                return data if isinstance(data, list) else data.get("items", [])
        logger.warning("welfareList.json을 찾지 못해 빈 카탈로그로 동작합니다.")
        return []


_CATALOG_CACHE = {"at": 0.0, "data": None}
CATALOG_TTL = float(os.environ.get("CATALOG_TTL_SECONDS", "30"))


def load_welfare_catalog() -> list:
    """요청마다 JSON 파일을 다시 읽지 않도록 30초 동안 메모리에 보관 (파일을 고치면 30초 안에 반영)"""
    now = time.monotonic()
    if _CATALOG_CACHE["data"] is None or now - _CATALOG_CACHE["at"] > CATALOG_TTL:
        _CATALOG_CACHE["data"] = _load_catalog_source() or []
        _CATALOG_CACHE["at"] = now
    return _CATALOG_CACHE["data"]


app = FastAPI(title="원주 혜택 ON Cloud API (v2 + 협업 통합본)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # 같은 서버에서 정적 파일을 서빙하므로 쿠키 인증 불필요
    allow_methods=["*"],
    allow_headers=["*"],
)
# 화면 파일(plan.css 77KB, plan-ui.js 89KB)과 JSON 응답을 압축해 전송량을 약 1/4로 줄임
app.add_middleware(GZipMiddleware, minimum_size=1024)

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB 제한

# Bedrock을 부르는 요청은 동시에 이 개수까지만 처리 (몰려도 서버·비용이 폭주하지 않게, 나머지는 잠시 대기)
AI_SLOTS = asyncio.Semaphore(int(os.environ.get("AI_MAX_CONCURRENCY", "4")))
DEFAULT_SUGGESTION = "화면 상단의 '원주시 대표 복지 공고문 샘플' 버튼을 눌러 바로 체험해 보실 수 있어요!"

# 모의 신청 상태 저장소 (개인정보는 저장하지 않고 접수번호·혜택ID·시각만 보관)
# ※ 메모리 저장이므로 서버 재시작 시 초기화되고, 워커를 여러 개 띄우면 공유되지 않습니다(시연용 단일 워커 권장).
APPLY_STORE: Dict[str, Dict[str, Any]] = {}


# --- 요청 Body 모델 정의 ---
class MatchRequest(BaseModel):
    child_months: int = 12
    work_status: str = "직장인"
    income_level: str = "모름"
    region: str = "원주시"

class ChatRequest(BaseModel):
    message: str

class ApplyPrefillRequest(BaseModel):
    doc_id: str = "benefit_01"
    user_input: Optional[Dict[str, str]] = None

class ApplySubmitRequest(BaseModel):
    doc_id: str = "benefit_01"

class UrlAnalyzeRequest(BaseModel):
    url: str


def make_error_response(error_code: str, user_message: str, suggestion: str | None = None, status_code: int = 200):
    """통일된 ErrorResponse JSON 반환"""
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "error_code": error_code,
            "user_message": user_message,
            "suggestion": suggestion or DEFAULT_SUGGESTION
        }
    )


def model_to_dict(model: BaseModel) -> dict:
    """pydantic v1/v2 모두 지원"""
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


def find_catalog_item(doc_id: str):
    for item in load_welfare_catalog():
        if item.get("doc_id") == doc_id:
            return item
    return None


def to_analysis_format(data: dict) -> dict:
    """옛 PRESET_CACHE 형식(document_title, cards.*)을 /api/analyze와 같은 형식으로 변환.
    이미 새 형식이면 그대로 반환합니다."""
    if not isinstance(data, dict) or "cards" not in data:
        return data

    cards = data.get("cards", {})
    summary = cards.get("summary", {})
    target = cards.get("target", {})
    benefits = cards.get("benefits", {})
    sched = cards.get("schedule_and_procedure", {})
    docs = cards.get("documents_and_contact", {})
    contact = docs.get("contact", {}) or {}

    target_text = " / ".join(target.get("criteria", []))
    if target.get("exclusion"):
        target_text = f"{target_text} (제외: {target['exclusion']})" if target_text else target["exclusion"]

    method_parts = [sched.get("period", "")] + list(sched.get("steps", []))
    contact_text = contact.get("department", "")
    if contact.get("phone"):
        contact_text = f"{contact_text} ({contact['phone']})".strip()

    glossary = []
    for g in data.get("glossary", []):
        easy = g.get("easy") or " — ".join(x for x in [g.get("easy_term", ""), g.get("description", "")] if x)
        glossary.append({"term": g.get("term", ""), "easy": easy})

    tts = " ".join(
        c.get("tts_text", "") for c in [summary, target, benefits, sched, docs] if c.get("tts_text")
    )

    return {
        "status": "success",
        "doc_id": data.get("document_id", ""),
        "title": data.get("document_title", ""),
        "tags": data.get("tags", []),
        "one_line_summary": summary.get("headline", ""),
        "checklist": data.get("checklist", []),
        "target": target_text,
        "benefit": " / ".join(benefits.get("items", [])),
        "method": " → ".join(p for p in method_parts if p),
        "contact": contact_text,
        "documents": list(docs.get("required_docs", [])),
        "glossary": glossary,
        "tts_full_script": tts,
    }


async def read_upload(file: UploadFile) -> bytes:
    """15MB를 넘는 파일은 끝까지 읽지 않고 상한+1바이트까지만 읽어 메모리를 아낌"""
    return await file.read(MAX_FILE_SIZE + 1)


def _analyze_hwp_sync(fname: str, content: bytes):
    if fname.endswith(".hwpx") or content.startswith(b"PK"):
        ext_text = read_hwpx(content)
    else:
        ext_text = read_hwp(content)
    if len((ext_text or "").strip()) < 20:
        raise PDFProcessError(
            "EMPTY_PDF_TEXT",
            "한글 문서에서 글자를 찾을 수 없어요. 표나 그림으로만 된 문서인지 확인해 주세요."
        )
    return analyze_document_with_bedrock(ext_text)


def _analyze_pdf_sync(content: bytes):
    # 임시 파일 없이 메모리에서 바로 읽음 (디스크 쓰기·삭제 생략)
    md_text = extract_pdf_to_markdown(content)
    return analyze_document_with_bedrock(md_text)


@app.get("/api/health")
async def health_check():
    return {"message": "원주 혜택 ON Cloud API v2 통합 서버가 정상 작동 중입니다! /docs 로 접속하세요."}


@app.get("/api/catalog")
async def get_welfare_catalog():
    """[기존 유지 + v2 확장] 메인 화면 혜택 목록(welfareList.json) 전체 반환"""
    return load_welfare_catalog()


@app.get("/api/preset/{preset_id}")
async def get_preset_analysis(preset_id: str):
    """[기존 유지] 프리셋 단건 조회. 옛 형식 데이터도 /api/analyze와 같은 형식으로 변환해 반환"""
    item = find_catalog_item(preset_id)
    if item:
        return to_analysis_format(item.get("detail_data", item))
    if preset_id in PRESET_CACHE:
        return to_analysis_format(PRESET_CACHE[preset_id])
    return make_error_response("SERVER_ERROR", f"요청하신 샘플 문서({preset_id})를 찾을 수 없어요.")


@app.post("/api/analyze")
async def analyze_uploaded_document(file: UploadFile = File(...)):
    """[기존 유지 + HWP/HWPX 확장 + NOT_A_NOTICE 방어] 공고문(PDF, HWP, HWPX) 직접 업로드 분석"""
    fname = (file.filename or "").lower()
    if not fname.endswith((".pdf", ".hwp", ".hwpx")):
        return make_error_response(
            "INVALID_FILE_TYPE",
            "PDF 또는 한글(HWP, HWPX) 파일만 업로드할 수 있어요. 파일 형식을 다시 확인해 주세요."
        )

    content = await read_upload(file)
    if len(content) > MAX_FILE_SIZE:
        return make_error_response(
            "FILE_TOO_LARGE",
            "파일 용량이 너무 커요(15MB 이하만 가능). 더 작은 파일로 다시 시도해 주세요."
        )

    is_hwp = fname.endswith((".hwp", ".hwpx"))
    try:
        # PDF 파싱·Bedrock 호출은 오래 걸리므로 별도 스레드에서 실행 (다른 요청이 멈추지 않도록)
        async with AI_SLOTS:
            if is_hwp:
                return await run_in_threadpool(_analyze_hwp_sync, fname, content)
            return await run_in_threadpool(_analyze_pdf_sync, content)
    except PDFProcessError as pe:
        return make_error_response(pe.error_code, pe.user_message, pe.suggestion)
    except Exception:
        logger.exception("analyze failed")
        msg = ("한글(HWP/HWPX) 문서를 분석하는 중 오류가 발생했어요." if is_hwp
               else "서버에서 문서를 처리하는 중 예상치 못한 오류가 발생했어요.")
        return make_error_response("SERVER_ERROR", msg)


# =====================================================================
# 신규 추가 API 4종 (1. match / 2. chat / 3. mask / 4. apply 모의 신청)
# =====================================================================

@app.post("/api/match")
async def match_benefits(req: MatchRequest):
    """[신규 1] 프로필(개월 수, 근무형태, 소득, 지역) 기반 혜택 판정 및 금액 합산 (LLM 미사용)"""
    return evaluate_welfare_match(model_to_dict(req), load_welfare_catalog())


@app.post("/api/chat")
async def chat_benefits(req: ChatRequest):
    """[신규 2] 자연어 질문 -> 프로필 추출 -> match 호출 -> 쉬운 한국어 답변"""
    if not req.message or len(req.message.strip()) < 2:
        return make_error_response("SERVER_ERROR", "질문 내용을 입력해 주세요.")
    try:
        async with AI_SLOTS:
            return await run_in_threadpool(chat_with_welfare_bot, req.message[:2000], load_welfare_catalog())
    except Exception:
        logger.exception("chat failed")
        return make_error_response("AI_FAILED", "답변을 만드는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.")


@app.post("/api/mask")
async def mask_uploaded_pdf(
    file: UploadFile = File(...),
    target_words: Optional[str] = Form(default="")
):
    """[신규 3] 업로드된 서류 PDF에서 주민번호·전화번호·계좌번호 및 지정 단어를 검은 박스로 가린 PDF 반환"""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return make_error_response("INVALID_FILE_TYPE", "PDF 파일만 마스킹할 수 있어요.")

    content = await read_upload(file)
    if len(content) > MAX_FILE_SIZE:
        return make_error_response("FILE_TOO_LARGE", "파일 용량이 너무 커요(15MB 이하만 가능).")

    extra_list = [w.strip() for w in (target_words or "").split(",") if w.strip()]
    try:
        masked_bytes, count = await run_in_threadpool(mask_pdf_sensitive_info, content, extra_list)
    except PDFProcessError as pe:
        return make_error_response(pe.error_code, pe.user_message, pe.suggestion)
    except Exception:
        logger.exception("mask failed")
        return make_error_response("SERVER_ERROR", "개인정보 마스킹 처리 중 오류가 발생했어요. 파일이 정상적인 PDF인지 확인해 주세요.")

    return Response(
        content=masked_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="masked_document.pdf"',
            "X-Masked-Count": str(count),
            "Access-Control-Expose-Headers": "X-Masked-Count",  # 프론트 JS에서 개수를 읽을 수 있도록
        }
    )


@app.post("/api/apply/prefill")
async def apply_prefill(req: ApplyPrefillRequest):
    """[신규 4-1] 신청서 자동채움 화면용 필드 목록 및 기본값 반환 (시연용 모의)"""
    target_item = find_catalog_item(req.doc_id)
    if not target_item:
        return make_error_response("SERVER_ERROR", f"신청할 혜택({req.doc_id})을 찾을 수 없어요.")

    fields = target_item.get("form_fields", ["보호자 성명", "자녀 성명", "자녀 생년월일", "연락처", "계좌번호"])
    user_in = req.user_input or {}
    prefilled = {field: user_in.get(field, "") for field in fields}
    return {
        "status": "success",
        "doc_id": target_item["doc_id"],
        "title": target_item.get("title", ""),
        "apply_info": target_item.get("apply", {}),
        "form_fields": fields,
        "prefilled_data": prefilled,
        "notice": "시연용 모의 신청 화면이며, 입력하신 개인정보는 서버에 저장되지 않습니다."
    }


@app.post("/api/apply/submit")
async def apply_submit(req: ApplySubmitRequest):
    """[신규 4-2] 모의 신청 접수 (개인정보 저장 없이 접수번호·혜택ID·시간만 메모리에 기록)"""
    target_item = find_catalog_item(req.doc_id)
    if not target_item:
        return make_error_response("SERVER_ERROR", f"신청할 혜택({req.doc_id})을 찾을 수 없어요.")

    receipt_id = f"WJ-2026-{uuid.uuid4().hex[:8].upper()}"  # 4자리는 충돌 가능성이 있어 8자리로
    APPLY_STORE[receipt_id] = {
        "receipt_id": receipt_id,
        "doc_id": target_item["doc_id"],
        "title": target_item.get("title", ""),
        "created_at": time.time()
    }
    return {
        "status": "success",
        "receipt_id": receipt_id,
        "doc_id": target_item["doc_id"],
        "title": target_item.get("title", ""),
        "current_status": "접수 완료",
        "message": "모의 신청이 정상적으로 접수되었어요. (개인정보는 서버에 저장되지 않습니다.)"
    }


@app.get("/api/apply/status/{receipt_id}")
async def apply_status(receipt_id: str):
    """[신규 4-3] 모의 신청 진행 상태 조회 (시간 경과에 따라 접수 -> 심사중 -> 지급 결정으로 자동 변경)"""
    record = APPLY_STORE.get(receipt_id)
    if not record:
        return make_error_response("SERVER_ERROR", "해당 접수번호를 찾을 수 없어요. 서버가 다시 시작되면 모의 접수 기록은 사라져요.")

    elapsed = time.time() - record["created_at"]
    if elapsed < 10:
        step, state_text, detail = 1, "접수 완료", "행정복지센터 담당 부서로 서류가 전달되었어요."
    elif elapsed < 25:
        step, state_text, detail = 2, "심사 중", "자녀 연령 및 거주지 자격 요건을 확인하고 있어요."
    else:
        step, state_text, detail = 3, "지급 결정", "심사가 완료되어 다음 달 25일 계좌로 지급될 예정이에요!"

    return {
        "status": "success",
        "receipt_id": receipt_id,
        "doc_id": record["doc_id"],
        "title": record["title"],
        "step": step,
        "current_status": state_text,
        "detail_message": detail,
        "elapsed_seconds": int(elapsed)
    }


# =====================================================================
# 협업자(server.py) 통합 API 3종 (URL AI 분석 + 기존 read-url / read-pdf 호환)
# =====================================================================

@app.post("/api/analyze-url")
async def analyze_public_url_with_ai(req: UrlAnalyzeRequest):
    """[통합 신기능] 공공기관 공고 URL을 넣으면 본문 크롤링 후 Bedrock AI 요약 카드로 변환"""
    url_error = await run_in_threadpool(error_for_url, req.url)
    if url_error:
        return make_error_response("INVALID_URL", url_error, "공고 페이지 주소를 다시 확인하거나 공고문 파일(PDF, HWP)을 직접 올려 주세요.")

    try:
        extracted = await run_in_threadpool(read_public_url, req.url)
    except Exception:
        logger.exception("read_public_url failed")
        extracted = {"ok": False, "error": "공고 페이지를 읽는 중 오류가 발생했어요."}
    if not extracted.get("ok"):
        return make_error_response(
            "NOT_A_NOTICE",
            extracted.get("error", "공고 페이지 주소를 읽지 못했어요."),
            "주소가 정확한지 확인하거나 공고문 파일(PDF, HWP)을 직접 올려 주세요."
        )
    try:
        full_text = f"제목: {extracted.get('title', '')}\n\n{extracted.get('text', '')}"
        async with AI_SLOTS:
            return await run_in_threadpool(analyze_document_with_bedrock, full_text)
    except PDFProcessError as pe:
        return make_error_response(pe.error_code, pe.user_message, pe.suggestion)
    except Exception:
        logger.exception("analyze-url failed")
        return make_error_response("SERVER_ERROR", "공고 웹페이지를 AI로 분석하는 중 오류가 발생했어요.")


@app.post("/api/read-url")
async def compat_read_url(req: UrlAnalyzeRequest):
    """[팀원 server.py 100% 호환] 공개 공고 URL 텍스트 추출"""
    try:
        res = await run_in_threadpool(read_public_url, req.url)  # 리다이렉트마다 내부망 검사 포함
    except Exception:
        logger.exception("read-url failed")
        res = {"ok": False, "error": "공고 페이지를 읽는 중 오류가 발생했어요."}
    return JSONResponse(status_code=200 if res.get("ok") else 422, content=res)


@app.post("/api/read-pdf")
async def compat_read_pdf(request: FastAPIRequest):
    """[팀원 server.py 100% 호환] Raw 바이너리(PDF 총괄표, HWP, HWPX) 텍스트/표 추출"""
    chunks, size = [], 0
    async for chunk in request.stream():   # 15MB를 넘으면 끝까지 받지 않고 바로 거절
        size += len(chunk)
        if size > MAX_FILE_SIZE:
            return JSONResponse(status_code=400, content={"ok": False, "error": "파일이 너무 큽니다. (15MB 이하)"})
        chunks.append(chunk)
    payload = b"".join(chunks)
    if not payload:
        return JSONResponse(status_code=400, content={"ok": False, "error": "파일이 비어 있습니다."})
    res = await run_in_threadpool(read_notice_payload, payload)
    return JSONResponse(status_code=200 if res.get("ok") else 422, content=res)


class ScheduleExplainRequest(BaseModel):
    context: str = ""
    items: list = []


@app.post("/api/explain-schedule")
async def explain_schedule(req: ScheduleExplainRequest):
    """[킥 기능] 화면이 규칙으로 계산한 복직 준비 일정을 AI가 쉬운 말로 설명 (새 일정·날짜·금액은 만들지 않음)"""
    lines = []
    for it in (req.items or [])[:12]:
        if isinstance(it, dict):
            lines.append(f"- {str(it.get('date', ''))[:10]} {str(it.get('title', ''))[:100]}: {str(it.get('detail', ''))[:240]}")
    if not lines:
        return make_error_response("SERVER_ERROR", "설명할 일정이 없어요.")
    system = (
        "당신은 원주시 육아 혜택 안내 상담원입니다. 아래 [준비 일정]에 있는 항목과 날짜만 사용해, "
        "각 일정을 왜 그 시점에 해야 하는지 쉬운 존댓말 4~6문장으로 설명하세요. "
        "목록에 없는 일정, 날짜, 금액, 제도는 절대 만들지 마세요. 마크다운 기호(**, #, -)는 쓰지 마세요."
    )
    user = f"[가족 상황]\n{(req.context or '')[:500]}\n\n[준비 일정]\n" + "\n".join(lines)
    try:
        async with AI_SLOTS:
            reply = await run_in_threadpool(call_llm, system, user, 0.2, 700)
    except Exception:
        logger.exception("explain-schedule failed")
        return make_error_response("AI_FAILED", "AI 설명을 만들지 못했어요. 잠시 후 다시 시도해 주세요.")
    return {"status": "success", "reply": reply}


# =====================================================================
# 정적 프론트엔드(plan.html, index.html, css, js) 통합 서빙
# ※ API 라우트를 모두 등록한 뒤 마지막에 마운트해야 /api/* 가 가려지지 않습니다.
# =====================================================================
STATIC_DIR = os.path.join(ROOT_DIR, "static")
if os.path.exists(STATIC_DIR):
    # 주소만 치면 진단 화면으로. 공고 읽기 화면은 /index.html 로 들어갑니다. (마운트보다 먼저 등록해야 동작)
    @app.get("/", include_in_schema=False)
    async def go_plan():
        return RedirectResponse("/plan.html")

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    @app.get("/")
    async def root():
        return {"message": "원주 혜택 ON Cloud API v2 통합 서버가 정상 작동 중입니다! /docs 로 접속하세요."}