#!/usr/bin/env python3
"""
fix_small.py — 작은 감점 요인 정리
  ① 복직 준비 일정의 'AI 비서에게 설명 듣기'·'AI 설명 듣기' 버튼 아이콘을 다른 곳과 같은 헤드셋으로
  ② 서버 제도 목록(mock_data.py)에서 중앙정부 제도 앞의 '원주시' 표기 정리
     (부모급여·첫만남이용권·아동수당은 중앙정부 제도)

사용법 (EC2):  cd ~/wonju-on-cloud/backend && python3 fix_small.py
두 번 실행해도 안전하고, 고칠 곳을 모두 찾은 뒤에만 파일을 바꿉니다.
"""
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
UI = "static/js/plan-ui.js"
MOCK = "app/mock_data.py"
# (파일, 설명, 원래 문장, 바꿀 문장, 여러 곳 모두 바꾸기)
PATCHES = [
    (UI, "일정 자세히: 'AI 비서에게 설명 듣기' 버튼 아이콘을 헤드셋으로",
     '[icon(ICONS.spark, "ico-sm"), "AI 비서에게 설명 듣기"]', '[aiIcon(), "AI 비서에게 설명 듣기"]', False),
    (UI, "AI 비서 복직 준비 카드: 'AI 설명 듣기' 버튼 아이콘을 헤드셋으로",
     '[icon(ICONS.spark, "ico-sm"), "AI 설명 듣기"]', '[aiIcon(), "AI 설명 듣기"]', False),
    (MOCK, "부모급여 앞 '원주시' 표기 정리", "원주시 부모급여", "부모급여", True),
    (MOCK, "첫만남이용권 앞 '원주시' 표기 정리", "원주시 첫만남이용권", "첫만남이용권", True),
    (MOCK, "아동수당 앞 '원주시' 표기 정리", "원주시 아동수당", "아동수당", True),
]


def main():
    texts, crlf = {}, {}
    for path, *_ in PATCHES:
        if path in texts:
            continue
        full = os.path.join(BASE, path)
        if not os.path.exists(full):
            print(f"멈춤 — 파일이 없습니다: {path}  (~/wonju-on-cloud/backend 에서 실행하세요)")
            sys.exit(1)
        with open(full, encoding="utf-8", newline="") as f:
            raw = f.read()
        crlf[path] = "\r\n" in raw
        texts[path] = raw.replace("\r\n", "\n")
    if "function aiIcon" not in texts[UI]:
        print("멈춤 — plan-ui.js에 헤드셋 아이콘 함수(aiIcon)가 없습니다. 협업자 병합본이 먼저 적용되어야 합니다.")
        sys.exit(1)

    planned, skipped, problems = [], [], []
    for path, desc, old, new, many in PATCHES:
        t = texts[path]
        n = t.count(old)
        if n == 0:
            if new in t:
                skipped.append(f"{path}: 이미 고쳐져 있음 — {desc}")
            else:
                problems.append(f"{path}: 원래 문장을 못 찾음 — {desc}")
            continue
        if n > 1 and not many:
            problems.append(f"{path}: 같은 문장이 {n}곳 — {desc}")
            continue
        texts[path] = t.replace(old, new)
        planned.append((path, f"{desc} ({n}곳)"))

    print("고칠 곳")
    for p, d in planned:
        print(f"  ✓ {p}  {d}")
    if skipped:
        print("건너뜀")
        for s in skipped:
            print(f"  · {s}")
    if problems:
        print("멈춤 — 파일을 하나도 바꾸지 않았습니다.")
        for p in problems:
            print(f"  ✗ {p}")
        sys.exit(1)
    for path in {p for p, _ in planned}:
        out = texts[path].replace("\n", "\r\n") if crlf[path] else texts[path]
        with open(os.path.join(BASE, path), "w", encoding="utf-8", newline="") as f:
            f.write(out)
    print(f"완료: {len(planned)}가지 수정. 서버를 다시 켜고(mock_data.py가 바뀜) 브라우저에서 Ctrl+Shift+R 하세요.")


if __name__ == "__main__":
    main()
