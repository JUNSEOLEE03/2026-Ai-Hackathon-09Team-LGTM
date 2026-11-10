/**
 * ai-assist.js — plan.html의 "AI 도우미" 영역을 서버 AI 기능과 연결하는 스크립트
 * ---------------------------------------------------------------------------
 * 연결하는 서버 주소 (backend/app/main.py)
 *   POST /api/chat         질문 하나 → 답변 + 해당/확인 필요 혜택 목록 + 합계
 *   POST /api/analyze      공고문 파일(PDF·HWP·HWPX) → 항목별 요약
 *   POST /api/analyze-url  공고 페이지 주소 → 항목별 요약
 *
 * plan-ui.js와 상태(변수)를 나눠 쓰지 않습니다. 화면에 보이는 '조건 요약'(#summary-text) 글만 읽어
 * 질문 앞에 붙여 보내므로, plan-ui.js를 고쳐도 이 파일은 영향을 받지 않습니다.
 *
 * 화면 구성 (plan.html의 #sec-ai 안)
 *   1) AI에게 물어보기: #ai-chat-form(#ai-q 입력, #ai-ask 버튼), 예시 질문 버튼 .ai-chip[data-q], 대화 목록 #ai-log
 *   2) 공고문 AI 분석: #ai-file-form(#ai-file, #ai-file-btn), #ai-url-form(#ai-url, #ai-url-btn),
 *                      진행 상태 #ai-doc-status, 결과 #ai-result
 *
 * 보안: 서버·AI가 돌려준 글은 모두 textContent로만 넣습니다(innerHTML을 쓰지 않음). 글 안에 태그가 있어도 실행되지 않습니다.
 */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  /** 올릴 수 있는 파일 최대 크기 (서버 제한과 같게 15MB) */
  const MAX_FILE = 15 * 1024 * 1024;
  /** 서버 응답을 기다리는 최대 시간. AI 분석은 길게 걸릴 수 있어 90초 */
  const TIMEOUT_MS = 90000;
  /** 소리로 듣기 버튼의 기본 글자 */
  const TTS_LABEL = "소리로 듣기";

  // AI 도우미 영역이 없는 페이지에서는 아무것도 하지 않습니다.
  if (!$("sec-ai")) return;

  /* ===================== 화면 요소 만들기 도우미 ===================== */

  /**
   * 요소를 만듭니다.
   * @param {string} tag 태그 이름
   * @param {object} [attrs] text → 글자, class → 클래스, onclick 같은 on… → 이벤트, 나머지 → 속성
   *   (값이 null·undefined·false인 속성은 건너뜀, true는 빈 값 속성)
   * @param {(Node|string|null)[]} [children] 자식. 글자는 텍스트 노드로, null·빈 글자는 건너뜀
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    const options = attrs || {};
    Object.keys(options).forEach(function (key) {
      const value = options[key];
      if (value == null || value === false) return;
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    });
    (children || []).forEach(function (child) {
      if (child == null || child === "") return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  /** 요소 안을 비웁니다. */
  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  /** child가 있을 때만 붙입니다. (목록이 비어 null을 돌려준 경우 appendChild 오류를 막음) */
  function append(parent, child) {
    if (child) parent.appendChild(child);
  }

  /** 금액 표시: 0 → "0원", 만 원 단위로 떨어지면 "30만 원", 아니면 "12,345원" */
  function won(n) {
    const v = Number(n) || 0;
    if (!v) return "0원";
    if (v % 10000 === 0) return (v / 10000).toLocaleString("ko-KR") + "만 원";
    return v.toLocaleString("ko-KR") + "원";
  }

  /* ===================== 서버 호출 공통 ===================== */

  /**
   * 서버에 요청을 보내고 JSON 결과를 돌려줍니다. 실패하면 사용자에게 보여 줄 한국어 문장으로 Error를 던집니다.
   *   - 90초 넘게 응답이 없으면 요청을 끊음
   *   - 서버가 { status: "error", user_message, suggestion }을 주면 그 문장을 그대로 씀
   *   - 그 밖의 HTTP 오류는 FastAPI의 detail 문장, 없으면 상태 코드를 알려 줌
   */
  async function callApi(url, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
    } catch (e) {
      throw new Error(e && e.name === "AbortError"
        ? "AI 응답이 너무 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요."
        : "AI 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.");
    } finally {
      clearTimeout(timer); // 성공·실패 어느 쪽이든 타이머 정리
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!data) throw new Error("서버 응답을 읽지 못했어요. (HTTP " + res.status + ")");
    if (data.status === "error") {
      throw new Error([data.user_message, data.suggestion].filter(Boolean).join(" "));
    }
    if (!res.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "요청을 처리하지 못했어요. (HTTP " + res.status + ")");
    }
    return data;
  }

  /** 버튼들을 한꺼번에 잠그거나 풉니다. (화면 읽기 프로그램용 aria-busy도 함께) */
  function setBusy(buttons, busy) {
    buttons.forEach(function (button) {
      if (!button) return;
      button.disabled = busy;
      button.setAttribute("aria-busy", busy ? "true" : "false");
    });
  }

  /* ===================== 1. AI에게 물어보기 ===================== */

  const log = $("ai-log");
  const form = $("ai-chat-form");
  const input = $("ai-q");
  const askBtn = $("ai-ask");
  /** 예시 질문 버튼. 페이지에 고정으로 있는 버튼이라 한 번만 찾아 둡니다. */
  const chips = Array.prototype.slice.call(document.querySelectorAll(".ai-chip"));
  /** 질문 중에 잠글 버튼 (보내기 + 예시 질문) */
  const chatButtons = [askBtn].concat(chips);
  /** 답을 기다리는 중이면 true (같은 질문이 두 번 가지 않게) */
  let chatBusy = false;

  /** 계산 화면에 보이는 조건 요약 글 (예: "아이 1명 · 6개월 · 원주 거주 …"). 없으면 빈 글자 */
  function familySummary() {
    const node = $("summary-text");
    return node ? node.textContent.trim() : "";
  }

  /**
   * 대화 목록에 말풍선 하나를 붙이고 보이도록 스크롤합니다.
   * @param {string} kind "user" 또는 "bot is-loading" 같은 클래스 꼬리 (ai-msg-<kind>)
   */
  function addMsg(kind, children) {
    const li = el("li", { class: "ai-msg ai-msg-" + kind }, children);
    log.appendChild(li);
    li.scrollIntoView({ block: "nearest" });
    return li;
  }

  /** 답변 안의 혜택 목록 묶음. 항목이 없으면 null (append가 건너뜀) */
  function benefitList(title, items, lineOf) {
    if (!items || !items.length) return null;
    return el("div", { class: "ai-sub" }, [
      el("p", { class: "ai-sub-title", text: title }),
      el("ul", { class: "ai-list" }, items.map(function (item) { return el("li", {}, lineOf(item)); }))
    ]);
  }

  /**
   * '기다리는 중' 말풍선을 서버 답으로 바꿉니다.
   * data: { reply, matched: [{title, amount_text}], check: [{title, reason}], total_monthly, total_once, disclaimer }
   */
  function renderChatAnswer(li, data) {
    clear(li);
    li.classList.remove("is-loading");
    li.appendChild(el("p", { class: "ai-reply", text: data.reply || "답변을 만들지 못했어요." }));
    append(li, benefitList("해당하는 혜택", data.matched, function (m) {
      return [el("strong", { text: m.title }), m.amount_text ? " · " + m.amount_text : ""];
    }));
    append(li, benefitList("확인이 필요한 혜택", data.check, function (m) {
      return [el("strong", { text: m.title }), m.reason ? " · " + m.reason : ""];
    }));
    if (data.total_monthly || data.total_once) {
      li.appendChild(el("p", {
        class: "ai-total",
        text: "AI 기준 합계: 매월 " + won(data.total_monthly) + (data.total_once ? ", 일시금 " + won(data.total_once) : "")
      }));
    }
    // AI는 서버의 혜택 목록(mock_data)으로 판정하므로 화면 계산(rules.js)과 다를 수 있다는 안내를 항상 붙임
    li.appendChild(el("p", {
      class: "ai-fine",
      text: (data.disclaimer || "정확한 지급 여부는 담당 부서에서 확인해 주세요.") + " AI 답변은 서버의 혜택 목록으로 판정하므로 위 계산 결과와 다를 수 있어요."
    }));
  }

  /**
   * 질문을 보냅니다. 2글자 미만이면 입력 칸에 오류 표시만 하고 보내지 않습니다.
   * 화면의 조건 요약을 "우리 가족 상황: …" 으로 앞에 붙여, AI가 가족 상황에 맞춰 답하게 합니다.
   */
  async function ask(question) {
    const q = String(question || "").trim();
    if (chatBusy) return;
    if (q.length < 2) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    chatBusy = true;
    setBusy(chatButtons, true);

    addMsg("user", [el("p", { text: q })]);
    const pending = addMsg("bot is-loading", [el("p", { class: "ai-reply", text: "AI가 답을 정리하고 있어요…" })]);
    input.value = "";

    const summary = familySummary();
    const message = (summary ? "우리 가족 상황: " + summary + "\n" : "") + "질문: " + q;
    try {
      const data = await callApi("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message })
      });
      renderChatAnswer(pending, data);
    } catch (e) {
      // 실패하면 기다리는 말풍선을 오류 문장으로 바꿈
      clear(pending);
      pending.classList.remove("is-loading");
      pending.classList.add("is-error");
      pending.appendChild(el("p", { class: "ai-reply", text: e.message }));
    } finally {
      chatBusy = false;
      setBusy(chatButtons, false);
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    ask(input.value);
  });
  // Enter로 보내고 Shift+Enter는 줄바꿈. 한글 조합 중(isComposing)의 Enter는 글자 확정이므로 보내지 않음
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(input.value);
    }
  });
  input.addEventListener("input", function () { input.removeAttribute("aria-invalid"); });
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () { ask(chip.getAttribute("data-q")); });
  });

  /* ===================== 2. 공고문 AI 분석 ===================== */

  const fileForm = $("ai-file-form");
  const fileInput = $("ai-file");
  const fileBtn = $("ai-file-btn");
  const urlForm = $("ai-url-form");
  const urlInput = $("ai-url");
  const urlBtn = $("ai-url-btn");
  const status = $("ai-doc-status");
  const result = $("ai-result");
  /** 분석 중에 잠글 버튼 (파일·주소 둘 다) */
  const docButtons = [fileBtn, urlBtn];
  /** 분석 중이면 true (한 번에 하나만) */
  let docBusy = false;

  /** 진행·오류 문장을 보여 줍니다. text가 비면 숨김. kind: "loading" | "error" | null */
  function showStatus(text, kind) {
    status.hidden = !text;
    status.textContent = text || "";
    status.className = "ai-status" + (kind ? " is-" + kind : "");
  }

  /** 분석 결과 한 줄(dt 제목 + dd 내용). 값이 비었거나 빈 목록이면 null (그 줄은 그리지 않음) */
  function fact(label, value) {
    if (!value || (Array.isArray(value) && !value.length)) return null;
    const body = Array.isArray(value)
      ? el("ul", { class: "ai-list" }, value.map(function (v) { return el("li", { text: String(v) }); }))
      : el("p", { text: String(value) });
    return el("div", { class: "ai-fact" }, [el("dt", { text: label }), el("dd", {}, [body])]);
  }

  /**
   * 브라우저 음성 합성으로 요약을 읽어 주는 버튼. 대본이 없거나 브라우저가 지원하지 않으면 null.
   * 읽는 중에 다시 누르면 멈춥니다.
   */
  function ttsButton(script) {
    if (!script || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;
    const btn = el("button", { type: "button", class: "btn-ghost-sm", text: TTS_LABEL });
    btn.addEventListener("click", function () {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.textContent = TTS_LABEL;
        return;
      }
      const utterance = new SpeechSynthesisUtterance(script);
      utterance.lang = "ko-KR";
      utterance.rate = 0.95; // 조금 천천히
      utterance.onend = utterance.onerror = function () { btn.textContent = TTS_LABEL; };
      window.speechSynthesis.speak(utterance);
      btn.textContent = "듣기 멈추기";
    });
    return btn;
  }

  /**
   * 분석 결과를 #ai-result에 그립니다.
   * data: { title, tags[], one_line_summary, target, benefit, method, documents[], contact, checklist[],
   *         glossary: [{term, easy|easy_term|description}], tts_full_script }
   * @param {string} sourceLabel 어디서 온 결과인지 ("올린 파일 · 이름.pdf" / "공고 주소 · https://…")
   */
  function renderAnalysis(data, sourceLabel) {
    clear(result);
    result.hidden = false;
    const tags = (data.tags || []).map(function (t) { return el("span", { class: "tag check", text: t }); });
    const glossary = (data.glossary || []).filter(function (g) { return g && g.term; });

    // 머리: 출처 · 제목 · 태그 · 한 줄 요약
    result.appendChild(el("div", { class: "ai-result-head" }, [
      el("p", { class: "ai-source", text: sourceLabel }),
      el("h4", { class: "ai-result-title", text: data.title || "제목을 찾지 못한 공고" }),
      tags.length ? el("div", { class: "ai-tags" }, tags) : null,
      data.one_line_summary ? el("p", { class: "ai-summary", text: data.one_line_summary }) : null
    ]));

    // 본문: 찾은 항목만 (fact가 null이면 el이 건너뜀)
    result.appendChild(el("dl", { class: "ai-facts" }, [
      fact("지원 대상", data.target),
      fact("지원 내용", data.benefit),
      fact("신청 방법", data.method),
      fact("제출 서류", data.documents),
      fact("문의처", data.contact),
      fact("신청 전 확인할 점", data.checklist)
    ]));

    // 어려운 말 풀이 (접어 둠). AI 응답마다 풀이 키 이름이 조금씩 달라 세 가지를 차례로 봄
    if (glossary.length) {
      result.appendChild(el("details", { class: "ai-glossary" }, [
        el("summary", { text: "어려운 말 풀이 " + glossary.length + "개" }),
        el("dl", {}, glossary.map(function (g) {
          return el("div", { class: "ai-fact" }, [el("dt", { text: g.term }), el("dd", { text: g.easy || g.easy_term || g.description || "" })]);
        }))
      ]));
    }

    // 꼬리: 소리로 듣기 + 'AI 요약은 틀릴 수 있음' 안내
    result.appendChild(el("div", { class: "ai-result-foot" }, [
      ttsButton(data.tts_full_script),
      el("p", { class: "ai-fine", text: "AI가 공고문을 요약한 내용입니다. 문서에 없는 내용은 비워 두도록 했지만 틀릴 수 있으니 원문과 담당 부서에서 확인하세요." })
    ]));

    // 화면 읽기 프로그램이 결과부터 읽도록 초점을 옮기고, 결과가 보이게 부드럽게 스크롤
    result.setAttribute("tabindex", "-1");
    result.focus({ preventScroll: true });
    result.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /**
   * 분석 요청을 실행하고 결과·오류를 화면에 보여 줍니다.
   * @param {() => Promise<object>} request callApi를 부르는 함수
   */
  async function runAnalysis(request, sourceLabel) {
    if (docBusy) return;
    docBusy = true;
    setBusy(docButtons, true);
    showStatus("AI가 공고문을 읽고 있어요. 길면 1분 정도 걸릴 수 있어요…", "loading");
    try {
      const data = await request();
      showStatus("", null);
      renderAnalysis(data, sourceLabel);
    } catch (e) {
      showStatus(e.message, "error");
    } finally {
      docBusy = false;
      setBusy(docButtons, false);
    }
  }

  // 파일 분석: 고른 파일의 확장자·크기를 먼저 확인하고 서버로 보냄
  fileForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      showStatus("분석할 공고문 파일을 먼저 골라 주세요.", "error");
      fileInput.focus();
      return;
    }
    if (!/\.(pdf|hwp|hwpx)$/i.test(file.name)) {
      showStatus("PDF 또는 한글(HWP, HWPX) 파일만 분석할 수 있어요.", "error");
      return;
    }
    if (file.size > MAX_FILE) {
      showStatus("파일 용량이 너무 커요. 15MB 이하 파일만 올릴 수 있어요.", "error");
      return;
    }
    const body = new FormData();
    body.append("file", file, file.name);
    runAnalysis(function () {
      // Content-Type은 브라우저가 FormData 경계값과 함께 자동으로 붙이므로 직접 쓰지 않음
      return callApi("/api/analyze", { method: "POST", body: body });
    }, "올린 파일 · " + file.name);
  });

  // 주소 분석: http(s)로 시작하는 주소만 서버로 보냄 (실제 접속은 서버가 함)
  urlForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      showStatus("http:// 또는 https:// 로 시작하는 공고 페이지 주소를 넣어 주세요.", "error");
      urlInput.focus();
      return;
    }
    runAnalysis(function () {
      return callApi("/api/analyze-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url })
      });
    }, "공고 주소 · " + url);
  });
})();