import os
import json

# 기본 내장 v2 데이터 (원주시 0~6세 자녀 직장인 부모 핵심 혜택 3종 + 향후 확장용 어르신 1종)
DEFAULT_WELFARE_CATALOG = [
    {
        "doc_id": "benefit_01",
        "title": "2026년 부모급여 지원 안내",
        "tags": ["영유아", "원주시", "0-11개월", "12-23개월", "직장인", "자영업", "휴직·무직", "생활비"],
        "badge_text": "월 최대 100만 원",
        "one_line_summary": "만 0세(0~11개월) 아동에게 월 100만 원, 만 1세(12~23개월) 아동에게 월 50만 원의 부모급여를 지급합니다.",
        "original_pdf_url": "/pdf/sample_01.pdf",
        "eligibility": {
            "child_months": {"min": 0, "max": 23},
            "work_status": ["전체"],
            "region": "원주시",
            "income_rule": "없음",
            "need_check": []
        },
        "amount": {
            "type": "monthly",
            "value": 1000000,
            "value_by_age": {"0_11": 1000000, "12_23": 500000},
            "text": "만 0세 월 100만 원 / 만 1세 월 50만 원",
            "months": 24
        },
        "apply": {
            "channel": "온라인/방문",
            "where": "복지로·정부24 또는 읍면동 행정복지센터",
            "url": "https://www.bokjiro.go.kr",
            "deadline_note": "출생일 포함 60일 이내 신청 시 출생월부터 소급 지원"
        },
        "form_fields": ["보호자 성명", "자녀 성명", "자녀 생년월일", "연락처", "계좌번호"],
        "source": {
            "url": "https://www.bokjiro.go.kr",
            "checked_at": "2026-11-08"
        },
        "detail_data": {
            "status": "success",
            "doc_id": "benefit_01",
            "title": "2026년 부모급여 지원 안내",
            "tags": ["영유아", "원주시", "0-11개월", "12-23개월", "생활비"],
            "one_line_summary": "만 0세 아동은 월 100만 원, 만 1세 아동은 월 50만 원의 양육비를 매월 받으실 수 있습니다.",
            "checklist": [
                "현재 자녀가 생후 0~23개월(만 0~1세)인가요?",
                "원주시에 주민등록을 두고 거주 중이신가요?",
                "아동 명의 또는 부모 명의의 통장이 준비되어 있나요?"
            ],
            "target": "원주시 거주 만 0세~1세(0~23개월) 아동을 양육하는 부모 (소득·근무형태 무관)",
            "benefit": "만 0세(0~11개월) 월 100만 원, 만 1세(12~23개월) 월 50만 원 매월 25일 현금 지급 (어린이집 이용 시 보육료 바우처 차액 지급)",
            "method": "복지로·정부24 온라인 신청 또는 주소지 읍면동 행정복지센터 방문 신청",
            "contact": "원주시 보육아동과 부모급여 담당 (033-737-5754)",
            "documents": [
                "사회보장급여(사회서비스이용권) 신청서 1부",
                "신청인 신분증",
                "아동 또는 부모 명의 통장 사본 1부"
            ],
            "glossary": [
                {
                    "term": "소급 지원",
                    "easy": "아기가 태어난 날부터 육십 일 안에만 신청하면, 신청이 조금 늦어졌더라도 태어난 달부터 계산해서 돈을 모두 챙겨 드리는 것입니다."
                },
                {
                    "term": "보육료 바우처",
                    "easy": "어린이집에 다닐 때 현금 대신 어린이집 비용을 결제할 수 있도록 정부에서 국민행복카드에 넣어주는 포인트입니다."
                }
            ],
            "tts_full_script": "부모급여 지원 안내입니다. 소득이나 직장에 상관없이 생후 십일 개월까지는 매달 백만 원, 십이 개월에서 이십삼 개월까지는 매달 오십만 원을 지원해 드립니다. 출생 후 육십 일 안에 복지로 사이트나 가까운 행정복지센터에서 신청하시면 태어난 달부터 모두 받으실 수 있습니다."
        }
    },
    {
        "doc_id": "benefit_02",
        "title": "2026년 첫만남이용권 지원 안내",
        "tags": ["영유아", "원주시", "0-11개월", "직장인", "자영업", "휴직·무직", "생활비"],
        "badge_text": "1회 200~300만 원",
        "one_line_summary": "출생신고된 아기에게 첫째아 200만 원, 둘째아 이상은 300만 원의 국민행복카드 이용권을 드립니다.",
        "original_pdf_url": "/pdf/sample_02.pdf",
        "eligibility": {
            "child_months": {"min": 0, "max": 23},
            "work_status": ["전체"],
            "region": "원주시",
            "income_rule": "없음",
            "need_check": []
        },
        "amount": {
            "type": "once",
            "value": 2000000,
            "text": "첫째아 200만 원 / 둘째아 이상 300만 원 (1회 바우처)",
            "months": 1
        },
        "apply": {
            "channel": "온라인/방문",
            "where": "복지로·정부24 또는 읍면동 행정복지센터",
            "url": "https://www.bokjiro.go.kr",
            "deadline_note": "아동 출생일로부터 2년(만 2세 미만) 이내 사용 필수"
        },
        "form_fields": ["보호자 성명", "자녀 성명", "자녀 생년월일", "연락처", "국민행복카드 보유 여부"],
        "source": {
            "url": "https://www.bokjiro.go.kr",
            "checked_at": "2026-11-08"
        },
        "detail_data": {
            "status": "success",
            "doc_id": "benefit_02",
            "title": "2026년 첫만남이용권 지원 안내",
            "tags": ["영유아", "원주시", "0-11개월", "생활비"],
            "one_line_summary": "새로 태어난 아기에게 첫째는 200만 원, 둘째 이상은 300만 원의 육아용품·병원비 포인트를 지급합니다.",
            "checklist": [
                "출생신고가 완료된 만 2세 미만(0~23개월) 영유아인가요?",
                "국민행복카드를 가지고 계시거나 새로 발급받을 예정이신가요?",
                "원주시에 주민등록을 두고 거주 중이신가요?"
            ],
            "target": "출생신고 후 주민등록번호를 부여받은 원주시 거주 아동 (소득 무관)",
            "benefit": "첫째아 200만 원, 둘째아 이상 300만 원 국민행복카드 바우처(포인트) 일시 지급",
            "method": "복지로·정부24 온라인 신청 또는 주소지 읍면동 행정복지센터 방문 신청",
            "contact": "원주시 여성가족과 출산지원팀 (033-737-2743)",
            "documents": [
                "사회보장급여 신청서 1부",
                "신청인 신분증",
                "국민행복카드 (미보유 시 신청과 동시에 발급 가능)"
            ],
            "glossary": [
                {
                    "term": "국민행복카드",
                    "easy": "정부에서 주는 임신, 출산, 보육 지원금을 한곳에 담아서 병원이나 마트에서 쓸 수 있는 국가 지원 전용 카드입니다."
                }
            ],
            "tts_full_script": "첫만남이용권 안내입니다. 새로 태어난 첫째 아기에게는 이백만 원, 둘째 이상 아기에게는 삼백만 원의 국민행복카드 포인트를 드립니다. 아기가 두 돌이 되기 전까지 병원비나 육아용품을 사는 데 자유롭게 쓰실 수 있으니 행정복지센터나 복지로에서 신청해 보세요."
        }
    },
    {
        "doc_id": "benefit_03",
        "title": "2026년 아동수당 지원 안내",
        "tags": ["영유아", "원주시", "0-11개월", "12-23개월", "24-35개월", "36개월 이상", "직장인", "자영업", "휴직·무직", "생활비"],
        "badge_text": "월 10.5만 원",
        "one_line_summary": "만 9세 미만(0~107개월) 모든 아동에게 소득과 관계없이 매월 10.5만 원(비수도권 기준)의 아동수당을 현금으로 지급합니다.",
        "original_pdf_url": "/pdf/sample_03.pdf",
        "eligibility": {
            "child_months": {"min": 0, "max": 107},
            "work_status": ["전체"],
            "region": "원주시",
            "income_rule": "없음",
            "need_check": []
        },
        "amount": {
            "type": "monthly",
            "value": 105000,
            "text": "월 10.5만 원 (비수도권 기준, 부모급여와 중복 수령 가능)",
            "months": 108
        },
        "apply": {
            "channel": "온라인/방문",
            "where": "복지로·정부24 또는 읍면동 행정복지센터",
            "url": "https://www.bokjiro.go.kr",
            "deadline_note": "출생일 포함 60일 이내 신청 시 출생월부터 소급 지급"
        },
        "form_fields": ["보호자 성명", "자녀 성명", "자녀 생년월일", "연락처", "계좌번호"],
        "source": {
            "url": "https://www.bokjiro.go.kr",
            "checked_at": "2026-11-08"
        },
        "detail_data": {
            "status": "success",
            "doc_id": "benefit_03",
            "title": "2026년 아동수당 지원 안내",
            "tags": ["영유아", "원주시", "생활비"],
            "one_line_summary": "만 9세 미만(생후 0~107개월) 모든 아동에게 매월 25일 10.5만 원(비수도권 기준)씩 현금으로 지원합니다.",
            "checklist": [
                "현재 자녀가 만 9세 미만(생후 0~107개월)인가요?",
                "대한민국 국적을 보유하고 국내에 거주 중인가요?"
            ],
            "target": "원주시 거주 만 9세 미만(0~107개월) 모든 아동 (부모급여와 별도로 추가 지급)",
            "benefit": "아동 1인당 매월 10.5만 원 현금 지급 (비수도권 기준, 매월 25일 입금)",
            "method": "복지로·정부24 온라인 신청 또는 읍면동 행정복지센터 방문 신청",
            "contact": "원주시 보육아동과 아동수당 담당 (033-737-2753)",
            "documents": [
                "사회보장급여 신청서 1부",
                "신청인 신분증 및 통장 사본"
            ],
            "glossary": [
                {
                    "term": "중복 수령",
                    "easy": "부모급여나 보육료를 받고 있더라도 깎이지 않고 아동수당 십만 오천 원을 추가로 다 받을 수 있다는 뜻입니다."
                }
            ],
            "tts_full_script": "아동수당 지원 안내입니다. 만 구 세 미만 아동을 키우시는 모든 가정에 소득과 상관없이 매달 십만 오천 원을 현금으로 드립니다. 부모급여와 함께 중복해서 받으실 수 있으니 출생신고 때 행복출산 원스톱 서비스로 한 번에 신청하세요."
        }
    },
    {
        "doc_id": "benefit_04",
        "title": "2026년 고용보험 육아휴직급여 지원 안내",
        "tags": ["영유아", "원주시", "0-11개월", "12-23개월", "24-35개월", "36개월 이상", "직장인", "일자리/취업", "생활비"],
        "badge_text": "월 최대 250만 원",
        "one_line_summary": "만 8세 이하 자녀를 양육하기 위해 육아휴직을 사용하는 직장인 부모에게 통상임금의 80~100%(월 최대 250만 원)를 지원합니다.",
        "original_pdf_url": "/pdf/sample_04.pdf",
        "eligibility": {
            "child_months": {"min": 0, "max": 95},
            "work_status": ["직장인"],
            "region": "원주시",
            "income_rule": "고용보험 피보험 단위기간 180일 이상",
            "need_check": ["고용보험 가입 기간(180일 이상) 및 회사 육아휴직 확인서 발급 필요"]
        },
        "amount": {
            "type": "monthly",
            "value": 1500000,
            "text": "1~6개월 통상임금 100%(월 상한 250·200만 원), 7개월부터 80%(월 상한 160만 원)",
            "months": 12
        },
        "apply": {
            "channel": "온라인/방문",
            "where": "고용24 홈페이지 또는 원주고용복지플러스센터",
            "url": "https://www.work24.go.kr",
            "deadline_note": "육아휴직 시작일 이후 1개월부터 종료 후 12개월 이내 신청"
        },
        "form_fields": ["신청인 성명", "근무 회사명", "자녀 생년월일", "육아휴직 시작일", "연락처", "계좌번호"],
        "source": {
            "url": "https://www.work24.go.kr",
            "checked_at": "2026-11-08"
        },
        "detail_data": {
            "status": "success",
            "doc_id": "benefit_04",
            "title": "2026년 고용보험 육아휴직급여 지원 안내",
            "tags": ["영유아", "원주시", "직장인", "일자리/취업"],
            "one_line_summary": "고용보험에 가입된 직장인 부모가 육아휴직을 쓰면 매월 최대 250만 원의 급여를 지급합니다.",
            "checklist": [
                "현재 고용보험에 가입된 직장인(근로자)이신가요?",
                "휴직 전 고용보험 가입 기간이 모두 합쳐 180일 이상인가요?",
                "자녀가 만 8세 이하(초등학교 2학년 이하)인가요?"
            ],
            "target": "만 8세 이하 자녀를 둔 고용보험 가입 기간 180일 이상 직장인 부모",
            "benefit": "육아휴직 기간 동안 통상임금의 80~100% 지급 (초기 개월 수에 따라 월 상한 150만~250만 원)",
            "method": "사업주로부터 육아휴직 확인서 발급 후 고용24 온라인 또는 원주고용복지플러스센터 신청",
            "contact": "고용노동부 고객상담센터 (1350)",
            "documents": [
                "육아휴직 급여 신청서 1부",
                "사업주가 발급한 육아휴직 확인서 1부",
                "통상임금을 확인할 수 있는 임금대장 또는 근로계약서 사본"
            ],
            "glossary": [
                {
                    "term": "피보험 단위기간 180일",
                    "easy": "직장에서 고용보험에 가입하고 실제로 월급을 받으며 일한 날이 모두 합쳐 백팔십 일이 넘어야 한다는 뜻입니다."
                },
                {
                    "term": "통상임금",
                    "easy": "보너스나 연장근무 수당을 빼고 매달 고정적으로 받기로 약속된 기본 월급을 말합니다."
                }
            ],
            "tts_full_script": "직장인 부모님을 위한 육아휴직급여 안내입니다. 만 팔 세 이하 자녀를 돌보기 위해 육아휴직을 신청하신 직장인께 매달 백오십만 원에서 최대 이백오십만 원까지 급여를 지원해 드립니다. 회사에서 육아휴직 확인서를 받아 고용이십사 사이트에서 간편하게 신청하실 수 있습니다."
        }
    }
]

def load_welfare_catalog() -> list:
    """app/welfareList.json 파일이 있으면 읽고, 없으면 기본 데이터를 반환"""
    json_path = os.path.join(os.path.dirname(__file__), "welfareList.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    return data
        except Exception:
            pass
    return DEFAULT_WELFARE_CATALOG

WELFARE_CATALOG = load_welfare_catalog()

# 프리셋 단건 조회 호환용 캐시 (기존 doc_2026_01, sample_welfare_01 요청도 안 깨지게 연결)
PRESET_CACHE = {item["doc_id"]: item.get("detail_data", item) for item in WELFARE_CATALOG}
if len(WELFARE_CATALOG) > 0:
    PRESET_CACHE["doc_2026_01"] = WELFARE_CATALOG[0]["detail_data"]
    PRESET_CACHE["sample_welfare_01"] = WELFARE_CATALOG[0]["detail_data"]