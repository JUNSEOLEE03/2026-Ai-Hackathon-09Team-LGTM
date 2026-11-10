import io
import os
import re
import json
import threading
import boto3
from botocore.config import Config
import pymupdf as fitz  # PyMuPDF
import pdfplumber

# AI에 보내는 문서 길이 상한 (이만큼 모이면 나머지 페이지는 읽지 않음)
MAX_DOC_CHARS = 12000


# 커스텀 예외 클래스 (main.py에서 ErrorResponse 규격으로 변환)
class PDFProcessError(Exception):
    def __init__(self, error_code: str, user_message: str, suggestion: str | None = None):
        self.error_code = error_code
        self.user_message = user_message
        self.suggestion = suggestion
        super().__init__(user_message)


# 허용된 태그 전체 목록 (기존 규격 + v2 영유아/근무형태 확장 규격 통합)
ALLOWED_TAGS = {
    # 대상
    "영유아", "청년", "중장년", "어르신", "임산부", "장애인",
    # 지역
    "원주시", "타 지역",
    # 개월 수 (v2)
    "0-11개월", "12-23개월", "24-35개월", "36개월 이상",
    # 근무형태 (v2)
    "직장인", "자영업", "휴직·무직", "휴직/무직",
    # 관심사
    "생활비", "주거", "의료/건강", "의료·건강", "일자리/취업", "일자리",
    "교육/학습", "교육", "돌봄", "저축/자산", "교통", "문화/활동"
}


def normalize_work_status(value) -> str:
    """'휴직/무직'·'휴직·무직'처럼 표기만 다른 근무형태를 하나로 통일"""
    s = str(value or "").strip().replace("/", "·").replace(" ", "")
    return s or "전체"


def to_child_months(value, default: int = 12) -> int:
    """'23개월', '23.0', 23 등 어떤 형태로 와도 0~999 사이 정수 개월 수로 변환"""
    if isinstance(value, (int, float)):
        n = int(value)
    else:
        m = re.search(r"\d+", str(value or ""))
        n = int(m.group(0)) if m else default
    return max(0, min(n, 999))


def pick_value_by_age(val_by_age: dict, child_months: int, fallback: int) -> int:
    """value_by_age의 '0_11', '12_23', '24_35', '36_999' 같은 모든 구간 키를 해석"""
    for key, v in val_by_age.items():
        m = re.fullmatch(r"\s*(\d+)\s*_\s*(\d+)\s*", str(key))
        if m and int(m.group(1)) <= child_months <= int(m.group(2)):
            try:
                return int(v)
            except (TypeError, ValueError):
                return fallback
    return fallback


_BEDROCK_CLIENT = None
_BEDROCK_LOCK = threading.Lock()


def _bedrock():
    """Bedrock 클라이언트는 만들 때 비용이 커서(자격 증명 조회·연결 준비) 한 번만 만들어 재사용.
    만들어진 클라이언트는 여러 스레드에서 같이 써도 안전함."""
    global _BEDROCK_CLIENT
    if _BEDROCK_CLIENT is None:
        with _BEDROCK_LOCK:
            if _BEDROCK_CLIENT is None:
                _BEDROCK_CLIENT = boto3.client(
                    service_name="bedrock-runtime",
                    region_name=os.environ.get("AWS_REGION", "us-east-1"),
                    config=Config(
                        connect_timeout=5,
                        read_timeout=int(os.environ.get("BEDROCK_READ_TIMEOUT", "60")),
                        retries={"max_attempts": 2, "mode": "standard"},
                    ),
                )
    return _BEDROCK_CLIENT


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.0, max_tokens: int = 4096) -> str:
    """[공통 함수] AWS Bedrock(Claude Haiku 4.5)을 호출하여 텍스트 응답 반환"""
    model_id = os.environ.get(
        "BEDROCK_MODEL_ID",
        "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    )
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}]
    })
    response = _bedrock().invoke_model(modelId=model_id, body=body)
    response_body = json.loads(response.get("body").read())
    return response_body["content"][0]["text"].strip()


def parse_json_safely(raw_text: str) -> dict:
    """LLM 출력에서 마크다운 코드블록이나 앞뒤 잡담이 섞여 있어도 순수 JSON 객체만 안전하게 추출"""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            return json.loads(match.group(0))
        raise


def _open_pdf(source):
    """파일 경로(str) 또는 메모리의 PDF 내용(bytes)을 열기"""
    if isinstance(source, (bytes, bytearray)):
        return fitz.open(stream=bytes(source), filetype="pdf")
    return fitz.open(source)


def extract_pdf_to_markdown(source) -> str:
    """PDF에서 일반 텍스트와 표 구조를 추출하며 암호/빈 파일 여부를 검증.
    source: 파일 경로(str) 또는 PDF 내용(bytes). bytes로 주면 임시 파일을 만들지 않음.
    AI에 보낼 분량(MAX_DOC_CHARS)이 모이면 나머지 페이지는 읽지 않음."""
    extracted_content = []
    total_len = 0
    raw_len = 0

    try:
        doc = _open_pdf(source)
    except Exception:
        raise PDFProcessError(
            "INVALID_FILE_TYPE",
            "정상적인 PDF 파일을 열 수 없어요. 파일이 손상되었는지 확인해 주세요."
        )

    if doc.needs_pass:
        doc.close()
        raise PDFProcessError(
            "PASSWORD_PROTECTED",
            "암호가 걸려 있는 PDF 문서예요. 암호를 해제한 뒤 다시 올려주세요."
        )

    plumber_doc = None
    try:
        # 표 추출은 느리고 일부 PDF에서 실패하므로, 실패해도 일반 텍스트로 계속 진행
        try:
            plumber_doc = pdfplumber.open(io.BytesIO(source) if isinstance(source, (bytes, bytearray)) else source)
        except Exception:
            plumber_doc = None

        with doc:
            for page_idx in range(len(doc)):
                page_text = doc[page_idx].get_text("text").strip()
                raw_len += len(page_text)
                if page_text:
                    block = f"--- [Page {page_idx + 1} 텍스트] ---\n{page_text}"
                    extracted_content.append(block)
                    total_len += len(block)

                if plumber_doc is not None and page_idx < len(plumber_doc.pages):
                    try:
                        tables = plumber_doc.pages[page_idx].extract_tables() or []
                    except Exception:
                        tables = []
                    for t_idx, table in enumerate(tables):
                        if not table:
                            continue
                        md_table = "\n".join(
                            ["| " + " | ".join([str(cell or "").replace("\n", " ").strip() for cell in row]) + " |" for row in table]
                        )
                        raw_len += len(md_table)
                        block = f"\n[Page {page_idx + 1} 표 {t_idx + 1}]\n{md_table}\n"
                        extracted_content.append(block)
                        total_len += len(block)

                if total_len >= MAX_DOC_CHARS:
                    break
    except PDFProcessError:
        raise
    except Exception as e:
        raise PDFProcessError(
            "SERVER_ERROR",
            f"PDF를 읽는 중 오류가 발생했어요. ({str(e)})"
        )
    finally:
        if plumber_doc is not None:
            plumber_doc.close()

    if raw_len < 10:
        raise PDFProcessError(
            "EMPTY_PDF_TEXT",
            "문서에서 글자를 찾을 수 없어요. 스캔된 사진 문서이거나 암호가 걸려 있는지 확인해 주세요."
        )

    return "\n".join(extracted_content)


def analyze_document_with_bedrock(markdown_text: str) -> dict:
    """[/api/analyze & /api/analyze-url 용] 추출된 텍스트를 분석하여 AnalysisResult JSON 반환 (NOT_A_NOTICE 이중 방어)"""
    system_prompt = """당신은 공공 행정 문서를 이해하기 쉬운 일상어로 순화하고 핵심 정보를 추출하는 배리어프리 AI 전문가입니다.

[최우선 규칙: 복지 공고문 여부 판별]
먼저 이 문서가 지자체·공공기관의 복지/지원 사업 공고문(또는 안내문)인지 판단하세요.
- 공고문이 아니면(예: 재학증명서, 영수증, 요리 레시피, 계약서, 이력서, 일반 글) 혹은 지원 대상·혜택·신청 방법을 전혀 찾을 수 없다면 다른 내용은 만들지 말고 정확히 아래 JSON만 출력하세요:
{"status":"error","error_code":"NOT_A_NOTICE","user_message":"복지 공고문이 아닌 것 같아요. 지원 대상이나 혜택, 신청 방법을 찾지 못했어요.","suggestion":"시청·행정복지센터의 복지 공고문 PDF인지 확인해 주세요."}

[공고문이 맞을 때 작성 규칙]
1. 문서에 없는 내용은 절대 지어내지 말고 빈 문자열("") 또는 빈 배열([])로 두세요.
2. 태그는 문서에 근거가 있을 때만 아래 목록 안에서 골라 붙이고, 모르면 빈 배열([])로 두세요:
   - 대상: 영유아, 청년, 중장년, 어르신, 임산부, 장애인
   - 지역: 원주시, 타 지역
   - 관심사: 생활비, 주거, 의료/건강, 일자리/취업, 교육/학습, 돌봄, 저축/자산, 교통, 문화/활동
3. contact는 반드시 마지막에 "(전화번호)" 형식을 포함하세요.
4. glossary는 {"term": "어려운 용어", "easy": "초등학생도 이해할 쉬운 설명"} 배열(2~4개)로 작성하세요.
5. tts_full_script는 숫자나 기호 없이 한글 발음으로만 3~4문장 구어체로 작성하세요."""

    user_prompt = f"""다음 문서를 분석하여 순수 JSON만 출력하세요.

[공고문이 맞을 때 JSON 스키마]
{{
  "status": "success",
  "doc_id": "doc_2026_99",
  "title": "공고문 제목",
  "tags": ["영유아", "원주시", "생활비"],
  "one_line_summary": "한 줄 핵심 요약",
  "checklist": ["질문1?", "질문2?", "질문3?"],
  "target": "지원 대상",
  "benefit": "지원 혜택",
  "method": "신청 방법",
  "contact": "담당 부서 (전화번호)",
  "documents": ["제출 서류 1", "제출 서류 2"],
  "glossary": [{{"term": "용어", "easy": "쉬운 풀이"}}],
  "tts_full_script": "한글 발음 구어체 대본"
}}

[문서 내용]
{markdown_text[:MAX_DOC_CHARS]}"""

    try:
        raw_output = call_llm(system_prompt, user_prompt, temperature=0.0, max_tokens=2500)
        result = parse_json_safely(raw_output)
    except Exception as e:
        raise PDFProcessError(
            "AI_FAILED",
            f"AI가 문서를 분석하는 중 시간이 초과되었거나 오류가 발생했어요. ({str(e)})"
        )

    # 1차 방어: LLM이 NOT_A_NOTICE를 반환한 경우
    if result.get("status") == "error" or result.get("error_code") == "NOT_A_NOTICE":
        raise PDFProcessError(
            "NOT_A_NOTICE",
            result.get("user_message", "복지 공고문이 아닌 것 같아요. 지원 대상이나 혜택, 신청 방법을 찾지 못했어요."),
            result.get("suggestion", "시청·행정복지센터의 복지 공고문 PDF인지 확인해 주세요.")
        )

    # 2차 코드 방어: 핵심 3요소(target, benefit, method) 중 2개 이상 비어 있으면 NOT_A_NOTICE 처리
    empty_count = sum(1 for k in ["target", "benefit", "method"] if len(str(result.get(k) or "").strip()) < 2)
    if empty_count >= 2:
        raise PDFProcessError(
            "NOT_A_NOTICE",
            "복지 공고문이 아닌 것 같아요. 지원 대상이나 혜택, 신청 방법을 찾지 못했어요.",
            "시청·행정복지센터의 복지 공고문 PDF인지 확인해 주세요."
        )

    # 허용된 태그만 필터링 (기본값 강제 주입 금지)
    raw_tags = result.get("tags")
    result["tags"] = [t for t in raw_tags if t in ALLOWED_TAGS] if isinstance(raw_tags, list) else []

    default_keys = {
        "status": "success", "doc_id": "doc_2026_99", "title": "", "tags": [],
        "one_line_summary": "", "checklist": [], "target": "", "benefit": "",
        "method": "", "contact": "", "documents": [], "glossary": [], "tts_full_script": ""
    }
    for k, v in default_keys.items():
        if k not in result or result[k] is None:
            result[k] = v

    return result


def evaluate_welfare_match(profile: dict, catalog: list) -> dict:
    """[/api/match 용] LLM 없이 규칙 기반으로 정확하게 혜택 해당 여부와 금액 합계를 계산"""
    child_months = to_child_months(profile.get("child_months"), default=0)
    work_status = normalize_work_status(profile.get("work_status", "전체"))
    income_level = str(profile.get("income_level", "모름")).strip()
    region = str(profile.get("region", "원주시")).strip()

    matched = []
    check = []
    total_monthly = 0
    total_once = 0

    for item in catalog:
        elig = item.get("eligibility")
        amt = item.get("amount")
        if not elig or not amt:
            continue

        # 1. 지역 체크
        if elig.get("region", "원주시") == "원주시" and "원주" not in region:
            continue

        # 2. 자녀 개월 수 체크
        cm_rule = elig.get("child_months", {"min": 0, "max": 999})
        if not (cm_rule.get("min", 0) <= child_months <= cm_rule.get("max", 999)):
            continue

        # 3. 근무 형태 체크
        allowed_work = elig.get("work_status", ["전체"])
        if isinstance(allowed_work, str):
            allowed_work = [allowed_work]
        allowed_work = [normalize_work_status(w) for w in allowed_work]
        if "전체" not in allowed_work and work_status not in allowed_work:
            continue

        # 금액 계산 (연령별 차등 금액 지원)
        try:
            val = int(amt.get("value", 0) or 0)
        except (TypeError, ValueError):
            val = 0
        val_by_age = amt.get("value_by_age")
        if isinstance(val_by_age, dict):
            val = pick_value_by_age(val_by_age, child_months, val)

        amt_type = amt.get("type", "monthly")
        amt_monthly = val if amt_type == "monthly" else 0
        amt_once = val if amt_type in ("once", "voucher") else 0

        # 4. 소득/추가 확인 필요 여부 판정
        need_checks = elig.get("need_check", [])
        income_rule = elig.get("income_rule", "없음")

        if isinstance(need_checks, str):
            need_checks = [need_checks]
        need_checks = need_checks or []

        if (income_rule != "없음" and income_level in ("모름", "")) or len(need_checks) > 0:
            reason_str = need_checks[0] if need_checks else f"소득 기준({income_rule}) 확인이 필요해요"
            check.append({
                "doc_id": item.get("doc_id", ""),
                "title": item.get("title", ""),
                "amount_text": amt.get("text", ""),
                "amount_monthly": amt_monthly,
                "amount_once": amt_once,
                "status": "확인 필요",
                "reason": reason_str
            })
        else:
            matched.append({
                "doc_id": item.get("doc_id", ""),
                "title": item.get("title", ""),
                "amount_text": amt.get("text", ""),
                "amount_monthly": amt_monthly,
                "amount_once": amt_once,
                "status": "해당",
                "reason": f"만 {child_months}개월 자녀 및 {work_status} 조건에 해당돼요"
            })
            total_monthly += amt_monthly
            total_once += amt_once

    return {
        "status": "success",
        "matched": matched,
        "check": check,
        "total_monthly": total_monthly,
        "total_once": total_once,
        "disclaimer": "정확한 지급 여부는 담당 부서에서 확인해 주세요."
    }


def chat_with_welfare_bot(message: str, catalog: list) -> dict:
    """[/api/chat 용] 자연어 질문에서 프로필 추출 -> match 호출 -> 목록 내 혜택만으로 답변 생성"""
    # 1단계: 사용자 문장에서 프로필 JSON 추출
    extract_sys = """사용자의 문장에서 아래 4가지 정보를 추출하여 순수 JSON으로만 출력하세요.
- child_months: 자녀의 생후 개월 수 (정수. 예: "두 돌"->24, "1살"->12, "5세"->60, 신생아->1, 언급 없으면 12)
- work_status: "직장인", "자영업", "휴직·무직" 중 택1 (맞벌이/회사원/육아휴직 예정 등은 "직장인", 언급 없으면 "직장인")
- income_level: 소득 언급이 있으면 요약, 없으면 "모름"
- region: 지역 언급이 있으면 작성, 없으면 "원주시"
오직 {"child_months": 23, "work_status": "직장인", "income_level": "모름", "region": "원주시"} 형식으로만 출력하세요."""

    try:
        raw_prof = call_llm(extract_sys, message[:2000], temperature=0.0, max_tokens=200)
        profile = parse_json_safely(raw_prof)
        if not isinstance(profile, dict):
            raise ValueError("profile is not an object")
    except Exception:
        profile = {}

    # LLM이 "23개월"처럼 문자열을 주거나 키를 빠뜨려도 매칭이 깨지지 않도록 정리
    profile = {
        "child_months": to_child_months(profile.get("child_months"), default=12),
        "work_status": normalize_work_status(profile.get("work_status") or "직장인"),
        "income_level": str(profile.get("income_level") or "모름").strip(),
        "region": str(profile.get("region") or "원주시").strip(),
    }

    # 2단계: 규칙 기반 매칭 실행
    match_res = evaluate_welfare_match(profile, catalog)

    # 3단계: 매칭 결과만 바탕으로 쉬운 한국어 설명 생성 (목록 외 혜택 언급 절대 금지)
    answer_sys = """당신은 원주시 육아·복지 안내 AI 상담원입니다.
반드시 아래 [매칭된 혜택 결과]에 들어 있는 혜택 이름과 금액만 사용하여 3~4문장의 다정하고 쉬운 구어체로 답변하세요.
- 목록에 없는 혜택은 절대 지어내거나 언급하지 마세요.
- '해당'되는 혜택과 월 합계 금액을 먼저 안내하고, '확인 필요' 항목이 있다면 어떤 조건을 확인해야 하는지 덧붙여 주세요."""

    answer_user = f"[사용자 질문]\n{message}\n\n[매칭된 혜택 결과]\n{json.dumps(match_res, ensure_ascii=False)}"
    try:
        reply_text = call_llm(answer_sys, answer_user, temperature=0.1, max_tokens=700)
    except Exception:
        reply_text = f"현재 조건으로 매월 총 {match_res['total_monthly']:,}원, 일시금 {match_res['total_once']:,}원의 혜택을 받으실 수 있어요."

    return {
        "status": "success",
        "extracted_profile": profile,
        "reply": reply_text,
        "matched": match_res["matched"],
        "check": match_res["check"],
        "total_monthly": match_res["total_monthly"],
        "total_once": match_res["total_once"],
        "disclaimer": match_res["disclaimer"]
    }


# 날짜(2026-11-09, 2026.3.2 등)는 계좌번호 패턴에 걸려도 가리지 않음
_DATE_LIKE = re.compile(r"(?:19|20)\d{2}[-.](?:0?[1-9]|1[0-2])[-.](?:0?[1-9]|[12]\d|3[01])")

# 숫자형 개인정보 정규식 (주민번호, 휴대전화, 지역전화, 계좌번호)
_PII_PATTERNS = [
    re.compile(r"\d{6}\s*[-~]\s*[1-8]\d{6}"),                    # 주민등록번호
    re.compile(r"01[016789]\s*[-.]?\s*\d{3,4}\s*[-.]?\s*\d{4}"), # 휴대전화번호
    re.compile(r"0\d{1,2}\s*[-.)]\s*\d{3,4}\s*[-.]\s*\d{4}"),    # 지역 전화번호
    re.compile(r"\d{3,6}\s*-\s*\d{2,6}\s*-\s*\d{2,6}"),          # 계좌번호
]


def find_sensitive_spans(compact_text: str, user_targets: list) -> list:
    """공백을 뺀 페이지 문자열에서 가릴 구간 (시작, 끝) 목록을 찾고, 겹치는 구간은 하나로 합침"""
    spans = []

    # A. 사용자가 지정한 단어(예: "고용")의 정확한 위치
    for target in user_targets:
        clean_target = "".join(target.split())
        if not clean_target:
            continue
        start_idx = 0
        while True:
            idx = compact_text.find(clean_target, start_idx)
            if idx == -1:
                break
            spans.append((idx, idx + len(clean_target)))
            start_idx = idx + len(clean_target)

    # B. 숫자형 개인정보 (날짜로 시작하는 결과는 제외)
    for pat in _PII_PATTERNS:
        for m in pat.finditer(compact_text):
            if _DATE_LIKE.match(m.group(0)):
                continue
            spans.append(m.span())

    # C. 같은 번호가 전화·계좌 패턴에 동시에 걸리는 경우 등 겹치는 구간 병합
    spans.sort()
    merged = []
    for s, e in spans:
        if merged and s < merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def _span_to_rects(rects: list) -> list:
    """한 구간의 글자 박스들을 줄 단위로 합쳐 사각형 목록으로 반환"""
    if not rects:
        return []
    out = []
    curr = fitz.Rect(rects[0])
    for r in rects[1:]:
        if abs(r.y0 - curr.y0) < 10:
            curr = curr | r  # 같은 줄이면 박스 합치기
        else:
            out.append(curr)
            curr = fitz.Rect(r)
    out.append(curr)
    return out


def mask_pdf_sensitive_info(source, extra_words: list | None = None) -> tuple[bytes, int]:
    """[/api/mask 용] 정확히 일치하는 글자(예: '고용')와 숫자형 개인정보만 핀셋 마스킹.
    source: 파일 경로(str) 또는 PDF 내용(bytes). 반환값의 개수는 '가린 항목 수'(겹침 제거 후)입니다."""
    doc = _open_pdf(source)
    if doc.needs_pass:
        doc.close()
        raise PDFProcessError(
            "PASSWORD_PROTECTED",
            "암호가 걸려 있는 PDF 문서예요. 암호를 해제한 뒤 다시 올려주세요."
        )
    masked_count = 0

    # 사용자가 입력한 마스킹 단어 정리
    user_targets = []
    for w in extra_words or []:
        for sub_w in str(w).split(","):
            if sub_w.strip():
                user_targets.append(sub_w.strip())

    for page in doc:
        # 페이지 내 모든 글자(char)를 좌표와 함께 추출 (공백 제외)
        raw = page.get_text("rawdict")
        non_space_chars = []
        non_space_rects = []
        for block in raw.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    for ch in span.get("chars", []):
                        c_str = ch.get("c", "")
                        if c_str and not c_str.isspace():
                            non_space_chars.append(c_str)
                            non_space_rects.append(fitz.Rect(ch["bbox"]))

        compact_text = "".join(non_space_chars)
        spans = find_sensitive_spans(compact_text, user_targets)
        masked_count += len(spans)

        rects_to_mask = []
        for s_idx, e_idx in spans:
            rects_to_mask.extend(_span_to_rects(non_space_rects[s_idx:e_idx]))

        if not rects_to_mask:
            continue

        # 옆 글자가 같이 지워지지 않도록 박스 테두리를 안쪽으로 살짝 줄여서 적용
        for rect in rects_to_mask:
            inner_rect = fitz.Rect(rect.x0 + 1, rect.y0 + 1.5, rect.x1 - 1, rect.y1 - 1.5)
            if inner_rect.is_empty or inner_rect.width <= 0 or inner_rect.height <= 0:
                inner_rect = rect
            page.add_redact_annot(inner_rect, fill=(0, 0, 0))

        page.apply_redactions()

        # 시각적으로 깔끔하게 원래 글자 크기만큼 검은색 박스 덧칠
        for rect in rects_to_mask:
            page.draw_rect(rect, color=(0, 0, 0), fill=(0, 0, 0))

    # garbage=3·deflate: 지운 글자 데이터가 파일 안에 남지 않게 정리하고 용량도 줄임
    out_bytes = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return out_bytes, masked_count