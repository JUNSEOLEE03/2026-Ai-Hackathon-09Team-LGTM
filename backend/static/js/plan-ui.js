(function () {
  const Rules = window.WonjuRules;
  const Plan = window.WonjuPlan;
  const Cat = window.WonjuCatalog;
  const CATALOG = Cat.CATALOG;
  const DEMO_ANSWERS = Cat.DEMO_ANSWERS;
  const TODAY = Cat.TODAY;
  const VIRTUAL = CATALOG.some(function (p) { return p.sourceType === "가상"; });

  const $ = function (id) { return document.getElementById(id); };
  const slider = $("returnAge");
  const baseSel = $("baseAge");
  const topNavIntro = $("top-nav-intro");
  const topStartBtn = $("top-start-btn");
  const appFoot = $("app-foot");
  const introTopBox = $("intro-top");

  const state = {
    demo: false,
    view: "intro",
    step: 0,
    navDir: "next",
    answers: {
      livesInWonju: null,
      childMonths: null,
      returnToWork: null,
      returnTiming: null,
      singleChild: null,
      childcare: null,
      gangwon1y: null,
      birthOrder: null,
      leaveStartAge: null,
      wage: null,
      spouseLeave: null
    },
    returned: false,
    returnAge: null,
    baseAge: null,
    applied: {}
  };

  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") node.textContent = v;
      else if (k === "class") node.className = v;
      else if (k === "vars") {
        Object.keys(v).forEach(function (prop) {
          node.style.setProperty(prop, v[prop]);
        });
      } else if (k.indexOf("on") === 0) {
        node.addEventListener(k.slice(2), v);
      } else {
        node.setAttribute(k, v === true ? "" : v);
      }
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function svgEl(tag, attrs, children) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      const v = attrs[k];
      if (v == null || v === false) return;
      node.setAttribute(k, String(v));
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(c);
    });
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function won(n) {
    if (!n) return "0원";
    if (n % 10000 === 0) return (n / 10000).toLocaleString("ko-KR") + "만 원";
    if (n >= 10000) return (Math.round(n / 1000) / 10).toLocaleString("ko-KR") + "만 원";
    return n.toLocaleString("ko-KR") + "원";
  }

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 빠르고 부드러운 커스텀 스크롤 이동 (약 320ms) — 온보딩은 화면에 온보딩 카드만 단독으로 보이도록 스크롤 */
  function quickScrollTo(targetEl, exactTop) {
    if (!targetEl) return;
    const headerOffset = exactTop ? 0 : 76;
    const targetY = Math.max(0, targetEl.getBoundingClientRect().top + window.pageYOffset - headerOffset);
    if (reduceMotion) {
      window.scrollTo(0, targetY);
      return;
    }
    const startY = window.pageYOffset;
    const diff = targetY - startY;
    if (Math.abs(diff) < 8) return;
    const duration = 320;
    const startTime = performance.now();
    function stepScroll(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      window.scrollTo(0, Math.round(startY + diff * eased));
      if (t < 1) requestAnimationFrame(stepScroll);
    }
    requestAnimationFrame(stepScroll);
  }

  function countUpWon(targetNode, finalAmount, prefix, suffix) {
    const pre = prefix || "";
    const suf = suffix || "";
    const finalStr = pre + won(finalAmount) + suf;
    if (reduceMotion || !finalAmount || finalAmount <= 0) {
      targetNode.textContent = finalStr;
      return;
    }
    const duration = 380;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        const cur = Math.round((finalAmount * eased) / 10000) * 10000;
        targetNode.textContent = pre + won(cur) + suf;
        requestAnimationFrame(tick);
      } else {
        targetNode.textContent = finalStr;
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------- 온보딩 ---------- */

  const QUESTIONS = {
    livesInWonju: {
      title: "원주시에 살고 계신가요?",
      help: "원주시 자체 사업은 원주 거주가 조건입니다.",
      options: [
        { label: "네, 원주에 살아요", value: "yes" },
        { label: "아니요", sub: "전국 공통 제도만 계산합니다", value: "no" }
      ],
      get: function () { return state.answers.livesInWonju; },
      set: function (v) { state.answers.livesInWonju = v; }
    },
    childMonths: {
      title: "아이는 지금 몇 개월인가요?",
      help: "태어난 달을 0개월로 셉니다. 0~35개월까지 계산할 수 있어요.",
      type: "number",
      unit: "개월",
      min: 0,
      max: function () { return 35; },
      step: 1,
      emptyMsg: "개월 수를 입력하세요.",
      get: function () { return state.answers.childMonths; },
      set: function (n) {
        const changed = state.answers.childMonths !== n;
        state.answers.childMonths = n;
        if (!changed) return;
        if (state.returned) state.returnAge = n;
        else if (state.answers.returnTiming != null) QUESTIONS.returnTiming.set(state.answers.returnTiming);
        if (state.answers.leaveStartAge != null && state.answers.leaveStartAge > n) state.answers.leaveStartAge = n;
        state.baseAge = null;
      }
    },
    leaveStartAge: {
      title: "육아휴직은 아이 몇 개월 때 시작했나요?",
      help: "출산휴가 뒤 바로 이어서 썼다면 보통 3개월 전후입니다. 휴직 개월차에 따라 받는 금액이 달라집니다.",
      type: "number",
      unit: "개월",
      min: 0,
      max: function () { return state.answers.childMonths; },
      step: 1,
      emptyMsg: "시작한 시점을 입력하세요.",
      initial: function () { return Math.min(3, state.answers.childMonths); },
      get: function () { return state.answers.leaveStartAge; },
      set: function (n) { state.answers.leaveStartAge = n; }
    },
    wage: {
      title: "휴직 전 월 통상임금은 얼마였나요?",
      help: "세금 떼기 전 기본급과 고정 수당을 합친 금액입니다. 급여명세서에서 확인할 수 있어요. 입력한 금액은 저장하거나 보내지 않습니다.",
      type: "number",
      unit: "만 원",
      min: 1,
      max: function () { return 3000; },
      step: 10,
      emptyMsg: "금액을 입력하거나 건너뛰세요.",
      skipLabel: "잘 모르겠어요, 건너뛸게요",
      get: function () { return state.answers.wage == null ? null : Math.round(state.answers.wage / 10000); },
      set: function (n) { state.answers.wage = n == null ? null : n * 10000; }
    },
    spouseLeave: {
      title: "배우자도 아이 18개월 안에 육아휴직을 쓰나요?",
      help: "부모가 함께 휴직하면 첫 몇 달 동안 더 높은 금액을 받는 특례가 있습니다.",
      options: [
        { label: "네, 쓰거나 쓸 예정이에요", value: "yes" },
        { label: "아니요", value: "no" },
        { label: "아직 모르겠어요", sub: "특례 없이 계산해요", value: "unknown" }
      ],
      get: function () { return state.answers.spouseLeave === "unknown" ? "unknown" : state.answers.spouseLeave; },
      set: function (v) { state.answers.spouseLeave = v; }
    },
    returnToWork: {
      title: "복직할 계획이 있나요?",
      help: "복직 시점에 따라 받는 금액이 달라집니다.",
      options: [
        { label: "네, 복직할 예정이에요", value: "plan" },
        { label: "이미 복직했어요", value: "done" },
        { label: "복직 계획이 없어요", value: "no" }
      ],
      get: function () {
        if (state.answers.returnToWork === "no") return "no";
        if (state.answers.returnToWork === "yes") return state.returned ? "done" : "plan";
        return null;
      },
      set: function (v) {
        state.answers.returnToWork = v === "no" ? "no" : "yes";
        state.returned = v === "done";
        if (v === "done") state.returnAge = state.answers.childMonths;
        if (v === "no") state.returnAge = null;
      }
    },
    returnTiming: {
      title: "언제쯤 복직할 예정인가요?",
      help: "대략적인 시점이면 충분해요. 결과 화면에서 슬라이더로 바꿔 볼 수 있습니다.",
      options: [
        { label: "3개월 안에", value: 3 },
        { label: "6개월 뒤쯤", value: 6 },
        { label: "1년 뒤쯤", value: 12 },
        { label: "아직 모르겠어요", sub: "아이 12개월 기준으로 먼저 보여 드려요", value: "unknown" }
      ],
      get: function () { return state.answers.returnTiming; },
      set: function (v) {
        const age = state.answers.childMonths;
        state.answers.returnTiming = v;
        state.returnAge = v === "unknown" ? Math.max(age, 12) : Math.min(35, age + v);
      }
    },
    childcare: {
      title: "어린이집을 이용하나요?",
      help: "어린이집을 이용하면 일부 현금 지원이 바우처로 바뀝니다.",
      options: [
        { label: "아니요, 집에서 돌봐요", value: "no" },
        { label: "네, 다니고 있어요", value: "yes" }
      ],
      get: function () { return state.answers.childcare; },
      set: function (v) { state.answers.childcare = v; }
    },
    gangwon1y: {
      title: "부 또는 모가 강원도에 1년 이상 사셨나요?",
      help: "강원 육아기본수당은 신청일 기준으로 부모 중 한 명이 강원도에 1년 이상 거주해야 받습니다.",
      options: [
        { label: "네, 1년 이상 살았어요", value: "yes" },
        { label: "아니요, 1년이 안 됐어요", value: "no" }
      ],
      get: function () { return state.answers.gangwon1y; },
      set: function (v) { state.answers.gangwon1y = v; }
    },
    birthOrder: {
      title: "이 아이는 몇째인가요?",
      help: "첫만남이용권은 첫째 200만 원, 둘째 이상 300만 원이고, 원주시 출생축하금은 첫째·둘째·셋째 이상이 모두 다릅니다.",
      options: [
        { label: "첫째예요", value: "first" },
        { label: "둘째예요", value: "second" },
        { label: "셋째 이상이에요", value: "third_plus" }
      ],
      get: function () { return state.answers.birthOrder; },
      set: function (v) { state.answers.birthOrder = v; }
    },
    singleChild: {
      title: "자녀가 한 명인가요?",
      help: "지원금은 아이마다 따로 받아요. 여러 명이면 가장 어린 아이 한 명 기준으로 계산해 드립니다.",
      options: [
        { label: "네, 한 명이에요", value: "yes" },
        { label: "아니요, 여러 명이에요", sub: "가장 어린 아이 기준으로 계산해요", value: "no" }
      ],
      get: function () { return state.answers.singleChild; },
      set: function (v) {
        state.answers.singleChild = v;
        if (v === "no" && state.answers.birthOrder === "first") state.answers.birthOrder = null;
      }
    }
  };

  /* 자녀가 여러 명이면 가장 어린 아이(막내) 기준으로 묻는다 */
  function viewOf(key) {
    const q = QUESTIONS[key];
    if (state.answers.singleChild !== "no") return q;
    if (key === "childMonths") {
      return Object.assign({}, q, {
        title: "가장 어린 아이는 지금 몇 개월인가요?",
        help: "아이마다 따로 받기 때문에 가장 어린 아이 한 명 기준으로 계산해요. 태어난 달을 0개월로 셉니다. 0~35개월까지 계산할 수 있어요."
      });
    }
    if (key === "birthOrder") {
      return Object.assign({}, q, {
        title: "가장 어린 아이는 몇째인가요?",
        help: "형제자매를 모두 세어 주세요. 첫만남이용권은 둘째 이상 300만 원이고, 원주시 출생축하금은 둘째·셋째 이상이 다릅니다.",
        options: q.options.filter(function (o) { return o.value !== "first"; })
      });
    }
    return q;
  }

  function steps() {
    const list = ["livesInWonju", "singleChild", "childMonths", "returnToWork"];
    if (state.answers.returnToWork === "yes" && !state.returned) list.push("returnTiming", "leaveStartAge", "wage", "spouseLeave");
    list.push("childcare", "gangwon1y", "birthOrder");
    return list;
  }

  function animateIn(node, dirClass) {
    if (reduceMotion || !node) return;
    const cls = dirClass || "enter";
    node.classList.add(cls);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.remove(cls); });
    });
  }

  let restoring = false;

  function remember(entry) {
    if (restoring || !window.history || !history.pushState) return;
    try {
      const cur = history.state;
      if (cur && cur.view === entry.view && cur.step === entry.step) return;
      if (!cur) history.replaceState(entry, "");
      else history.pushState(entry, "");
    } catch (e) { /* file:// 등에서 막히면 무시 */ }
  }

  window.addEventListener("popstate", function (e) {
    const st = e.state;
    if (!st) return;
    restoring = true;
    try {
      if (st.view === "intro") renderIntro();
      else if (st.view === "results" && state.answers.singleChild != null) showResults(true);
      else if (st.view === "step") goStep(Math.min(st.step, steps().length - 1), "prev");
    } finally {
      restoring = false;
    }
  });

  function showView(view) {
    state.view = view;
    /* 서비스 소개(#intro-top)는 항상 맨 위에 유지! */
    $("onboard").hidden = view !== "step";
    $("results").hidden = view !== "results";
    if (topNavIntro) topNavIntro.hidden = false;
    /* 하단 안내문은 항상 표시 */
    if (topStartBtn) {
      topStartBtn.textContent = view === "results" ? "다시 진단하기" : "비서 시작하기";
    }
  }

  /* 시작 화면의 핵심 수치 카드 4개 (누르면 결과 화면의 해당 위치로 이동, 답이 없으면 예시 가구 기준) */
  function buildHero(given) {
        const pv = given || previewModel();
        const specs = pv.specs || [];
        const POS = { total: "fp-card-tl", best: "fp-card-tr", deadline: "fp-card-bl", excluded: "fp-card-br" };
        const cards = specs.map(function (sp) {
          return el("button", {
            type: "button",
            class: "float-preview-card hero-kpi " + POS[sp.key] + (sp.urgent ? " is-urgent" : ""),
            "aria-label": sp.label + ": " + sp.value + ". " + sp.sub + ". " + sp.go,
            onclick: function (e) { openFromHero(sp.key, e.currentTarget); }
          }, [
            el("span", { class: "fp-title", text: sp.label }),
            el("strong", { class: "hk-value", text: sp.value }),
            el("span", { class: "hk-sub", text: sp.sub }),
            el("span", { class: "hk-go" }, [sp.go, icon(ICONS.external, "ico-sm")])
          ]);
        });
        return el("div", { class: "hero-wrap" }, [
          el("div", { class: "hero-stage" }, cards.slice(0, 2).concat([
            el("div", { class: "stage-center", "aria-hidden": "true" }, [el("img", { src: "img/hero-iso.png", alt: "", class: "hero-iso-img" })])
          ], cards.slice(2))),
          el("p", { class: "hero-caption", text: pv.demo
            ? "예시 가구(아이 " + DEMO_ANSWERS.childMonths + "개월, 월 통상임금 " + won(DEMO_ANSWERS.wage) + ") 기준 값이에요. 카드를 누르면 예시 결과로 이동하고, 진단하기에서 우리 가족 조건으로 바꿀 수 있어요."
            : "입력하신 조건 기준 값이에요. 카드를 누르면 결과 화면의 해당 위치로 이동해요." })
        ]);
      }

  /* 결과가 바뀌면 시작 화면 카드 4개도 같은 계산 결과로 다시 그림.
     (예전에는 처음 연 순간의 '예시 가구' 숫자가 진단 뒤에도 그대로 남았음) 내용이 같으면 그대로 둠 */
  function refreshHero(m) {
    const oldHero = introTopBox && introTopBox.querySelector(".hero-wrap");
    if (!oldHero) return;
    const pv = { m: m, specs: kpiSpecs(m), demo: !!state.demo };
    const key = JSON.stringify(pv.specs) + "|" + pv.demo;
    if (ui.heroKey === key) return;
    ui.heroKey = key;
    oldHero.replaceWith(buildHero(pv));
  }

  function mountPersistentIntro() {
    if (!introTopBox || introTopBox.firstChild) return;
    const showcase = el("div", { class: "card intro-showcase" }, [
      el("h1", { class: "intro-headline", tabindex: "-1", id: "intro-heading" }, [
        "우리 가족이 받을 수 있는 육아 ",
        el("span", { class: "intro-accent", text: "혜택" }),
        ",",
        el("br"),
        "놓치지 않고 한눈에 확인하세요"
      ]),
      el("p", {
        class: "intro-subcopy",
        text: "몇 가지 질문에 답하면 받을 수 있는 제도, 이번 달 예상 금액, 복직 시점에 따른 차이와 신청 순서를 정리해 드립니다."
      }),
      el("div", { class: "intro-cta-row" }, [
        el("button", {
          type: "button",
          class: "btn-hero-primary",
          text: "우리 가족 혜택 진단하기",
          onclick: function () { goStep(0, "next", true); }
        })
      ]),

      buildHero()
    ]);

    introTopBox.appendChild(showcase);
  }

  function renderIntro() {
    mountPersistentIntro();
    const oldHero = introTopBox.querySelector(".hero-wrap");
    if (oldHero) oldHero.replaceWith(buildHero());
    showView("intro");
    remember({ view: "intro", step: -1 });
    $("progress").hidden = true;
    clear($("step"));
    quickScrollTo(introTopBox);
  }

  function goStep(i, dir, shouldScroll) {
    const list = steps();
    state.navDir = dir || (i >= state.step ? "next" : "prev");
    if (i >= list.length) {
      state.demo = false;
      showResults(true);
      return;
    }
    const wasHidden = $("onboard").hidden;
    state.step = Math.max(0, i);
    renderStep(shouldScroll || wasHidden);
  }

  function next() {
    goStep(state.step + 1, "next", false);
  }

  function renderStep(shouldScrollToOnboard) {
    mountPersistentIntro();
    showView("step");
    remember({ view: "step", step: state.step });
    const list = steps();
    const key = list[state.step];
    const q = viewOf(key);

    $("progress").hidden = false;
    $("progress-text").textContent = "질문 " + (state.step + 1) + " / " + list.length;
    const pct = Math.round(((state.step + 1) / list.length) * 100);
    $("progress-fill").style.setProperty("width", pct + "%");

    const box = $("step");
    clear(box);
    const heading = el("h1", { class: "q-title", tabindex: "-1", id: "step-heading", text: q.title });
    const card = el("div", { class: "card question-card" }, [
      el("span", { class: "q-step-badge", text: "STEP " + (state.step + 1) + " OF " + list.length }),
      heading,
      el("p", { class: "q-help", id: "step-help", text: q.help })
    ]);
    if (q.type === "number") card.appendChild(numberControl(q));
    else card.appendChild(choiceControl(q));
    box.appendChild(card);
    animateIn(card, state.navDir === "prev" ? "enter-prev" : "enter-next");

    if (shouldScrollToOnboard) {
      quickScrollTo($("onboard"), true);
    }
    heading.focus({ preventScroll: true });
  }

  function choiceControl(q) {
    const current = q.get();
    const wrap = el("div", { class: "choices", role: "group", "aria-labelledby": "step-heading", "aria-describedby": "step-help" });
    q.options.forEach(function (opt) {
      const selected = current === opt.value;
      const btn = el("button", {
        type: "button",
        class: "choice" + (selected ? " selected" : ""),
        "aria-pressed": selected ? "true" : "false",
        onclick: function () {
          q.set(opt.value);
          Array.prototype.forEach.call(wrap.children, function (b) {
            b.classList.remove("selected");
            b.setAttribute("aria-pressed", "false");
          });
          btn.classList.add("selected");
          btn.setAttribute("aria-pressed", "true");
          setTimeout(next, reduceMotion ? 0 : 200);
        }
      }, [
        el("span", { class: "choice-label", text: opt.label }),
        opt.sub ? el("span", { class: "choice-sub", text: opt.sub }) : null
      ]);
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function numberControl(q) {
    const cur = q.get();
    const init = cur != null ? cur : (q.initial ? q.initial() : null);
    const input = el("input", {
      id: "num",
      type: "number",
      min: String(q.min),
      max: String(q.max()),
      step: String(q.step),
      inputmode: "numeric",
      value: init == null ? "" : String(init),
      "aria-labelledby": "step-heading",
      "aria-describedby": "step-help num-err"
    });
    const err = el("p", { class: "error", id: "num-err", "aria-live": "polite" });

    function clearErr() {
      err.textContent = "";
      input.removeAttribute("aria-invalid");
    }

    function bump(d) {
      const n = input.value === "" ? (q.min || 0) : Number(input.value);
      const v = Math.min(q.max(), Math.max(q.min, (Number.isFinite(n) ? n : 0) + d));
      input.value = String(v);
      clearErr();
      input.focus({ preventScroll: true });
    }

    function submit() {
      const raw = input.value.trim();
      const n = Number(raw);
      const max = q.max();
      if (raw === "" || !Number.isInteger(n) || n < q.min || n > max) {
        err.textContent = raw === "" ? q.emptyMsg : q.min + "부터 " + max + " 사이의 숫자로 입력하세요.";
        input.setAttribute("aria-invalid", "true");
        input.focus({ preventScroll: true });
        return;
      }
      q.set(n);
      next();
    }

    input.addEventListener("input", clearErr);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });

    return el("div", {}, [
      el("div", { class: "number-row" }, [
        el("button", { type: "button", class: "stepper", "aria-label": q.step + q.unit + " 줄이기", text: "−", onclick: function () { bump(-q.step); } }),
        input,
        el("span", { class: "unit", text: q.unit }),
        el("button", { type: "button", class: "stepper", "aria-label": q.step + q.unit + " 늘리기", text: "+", onclick: function () { bump(q.step); } })
      ]),
      err,
      el("div", { class: "actions" }, [
        el("button", { type: "button", class: "btn-primary", text: "다음", onclick: submit }),
        q.skipLabel ? el("button", { type: "button", class: "link-btn", text: q.skipLabel, onclick: function () { q.set(null); next(); } }) : null
      ])
    ]);
  }

  /* ---------- 결과 ---------- */

  const ui = {
    tab: "curve",
    mbAge: null,
    calView: "grid",
    calKey: null,
    openTask: null,
    curveKey: null,
    curve: null,
    navReady: false
  };

  const TAG = { "해당": "ok", "확인 필요": "check", "비해당": "no", "기간 종료": "ended" };
  const EVENT_LABEL = {
    deadline: "신청 마감",
    "return": "복직",
    end: "지급 종료",
    change: "금액 변경",
    start: "지급 시작",
    tip: "바우처 안내",
    prep: "서류 준비 권장",
    dday: "복직 준비"
  };

  function icon(paths, cls) {
    return svgEl("svg", { viewBox: "0 0 24 24", class: "ico" + (cls ? " " + cls : ""), "aria-hidden": "true", focusable: "false" },
      paths.map(function (d) { return svgEl("path", { d: d }); }));
  }
  const ICONS = {
    cash: ["M3.5 7.5h17v10h-17z", "M12 10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", "M6.5 10.5v4M17.5 10.5v4"],
    voucher: ["M4 7.5h16v3a1.5 1.5 0 0 0 0 3v3H4v-3a1.5 1.5 0 0 0 0-3z", "M10 7.5v9"],
    lump: ["M4.5 10h15v9.5h-15z", "M3.5 7h17v3h-17z", "M12 7v12.5", "M12 7c-1.5-2.8-5-3-5-.8C7 7 9.5 7 12 7zm0 0c1.5-2.8 5-3 5-.8C17 7 14.5 7 12 7z"],
    external: ["M14 4.5h5.5V10", "M19.5 4.5L11 13", "M18 13.5v5H5.5V6H10"],
    check: ["M5 12.5l4.5 4.5L19 7.5"],
    spark: ["M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z", "M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"],
    cross: ["M6.5 6.5l11 11M17.5 6.5l-11 11"],
    dash: ["M6.5 12h11"],
    chevron: ["M8 10l4 4 4-4"]
  };

  /* AI 비서 아이콘: 팀이 정한 헤드셋 이미지 */
  function aiIcon() {
    return el("img", { class: "ai-ico", src: "img/ai-headset.png", alt: "", "aria-hidden": "true", width: "18", height: "18" });
  }

  function vTag(prog) {
    if (!prog) return null;
    if (prog.sourceType === "가상") return el("span", { class: "v-mark v-virtual", text: "가상 예시" });
    if (prog.verification === "공식 확인") {
      return el("span", { class: "v-mark v-official", title: "공식 자료로 확인한 정보", "aria-label": "공식 확인" }, [icon(ICONS.check, "ico-sm")]);
    }
    return el("span", { class: "v-mark v-partial", title: "일부만 공식 자료로 확인한 정보", text: "부분 확인" });
  }

  function returnLabel(v, age) {
    if (v <= age) return state.returned ? "이미 복직" : "지금 복직";
    return "아이 " + v + "개월 때 (" + (v - age) + "개월 뒤)";
  }

  function approxMonthLabel(date) {
    const p = date.split("-");
    return p[0] + "년 " + Number(p[1]) + "월경";
  }

  function dateAtAge(v) {
    return Plan.addMonths(TODAY, v - state.answers.childMonths);
  }

  function summaryText() {
    const a = state.answers;
    const retText = a.returnToWork === "no"
      ? "복직 계획 없음"
      : (state.returned ? "이미 복직" : ("생후 " + (state.returnAge == null ? Math.max(a.childMonths, 12) : state.returnAge) + "개월에 복직 예정"));
    return [
      a.livesInWonju === "yes" ? "원주시 거주" : "원주시 외 거주",
      a.singleChild === "yes" ? "자녀 1명" : "자녀 여러 명(가장 어린 아이 기준)",
      "생후 " + a.childMonths + "개월",
      retText,
      a.childcare === "yes" ? "어린이집 이용" : "가정 양육",
      a.birthOrder === "first" ? "첫째" : a.birthOrder === "second" ? "둘째" : a.birthOrder === "third_plus" ? "셋째 이상" : a.birthOrder === "second_plus" ? "둘째 이상" : null,
      a.gangwon1y === "yes" ? "강원도 1년 이상 거주" : a.gangwon1y === "no" ? "강원도 거주 1년 미만" : null
    ].filter(Boolean).join(" · ");
  }

  function showResults(shouldCountUp) {
    mountPersistentIntro();
    showView("results");
    remember({ view: "results", step: -2 });
    const age = state.answers.childMonths;
    slider.min = String(age);
    slider.max = "35";
    slider.value = String(state.returnAge == null ? Math.max(age, 12) : state.returnAge);
    $("slider-min-label").textContent = "아이 " + age + "개월 (지금)";
    $("slider-max-label").textContent = "아이 35개월";
    if (state.baseAge == null || state.baseAge < age) state.baseAge = Math.max(age, Math.min(35, 12));
    ui.mbAge = null;
    ui.calKey = null;
    ui.openTask = null;
    renderResults(Boolean(shouldCountUp));
    setupSectionNav();
    const r = $("results");
    animateIn(r, "enter");
    quickScrollTo(r);
    r.focus({ preventScroll: true });
  }

  function currentReturnAge() {
    if (state.answers.returnToWork !== "yes") return Infinity;
    if (state.returned) return state.answers.childMonths;
    return Number(slider.value);
  }

  function programOf(id) {
    return CATALOG.find(function (p) { return p.id === id; });
  }

  function leaveProgram() {
    return CATALOG.find(function (p) { return p.timeline && p.timeline.leavePay; });
  }

  /* 한 번 계산한 결과를 모든 섹션이 같이 씁니다. */
  function buildModel() {
    const answers = state.answers;
    const age = answers.childMonths;
    const horizon = 36 - age;
    const simOn = answers.returnToWork === "yes" && !state.returned;
    const returnAge = currentReturnAge();
    if (simOn) state.returnAge = returnAge;
    const opts = { today: TODAY, horizon: horizon };
    const sched = Plan.monthlySchedule(CATALOG, answers, Object.assign({ returnAge: returnAge }, opts));
    const cmp = simOn ? Plan.compareReturn(CATALOG, answers, state.baseAge, returnAge, opts) : null;

    const results = CATALOG.map(function (p) {
      const r = Rules.judgeProgram(p, answers, TODAY);
      const phase = p.timeline && p.timeline.phase;
      if (state.returned && phase === "before_return" && Plan.toGroup(r.status) === "해당") {
        return Object.assign({}, r, {
          status: "조건 불일치",
          reasons: ["이미 복직해서 휴직 중에 받는 지원은 지금 신청 대상이 아닙니다. 휴직 기간에 신청하지 못했다면 해당 기관에 소급 가능 여부를 문의하세요."]
        });
      }
      return r;
    });
    const groupOf = {};
    results.forEach(function (r) { groupOf[r.programId] = Plan.toGroup(r.status); });

    const evsAll = Plan.events(CATALOG, answers, { today: TODAY, returnAge: returnAge });
    const evs = evsAll.filter(function (e) { return !(e.type === "deadline" && state.applied[e.programId]); })
      .concat(simOn ? returnPrepEvents(answers, returnAge) : []);
    /* 복직 준비 일정은 날짜(일)까지 있으므로 날짜순으로 다시 정렬 (같은 날짜는 원래 순서 유지) */
    evs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    state.events = evs;

    const eligible = results.filter(function (r) { return groupOf[r.programId] === "해당"; }).map(function (r) { return r.programId; });
    const todoIds = eligible.filter(function (id) { return !state.applied[id]; });
    const excluded = Plan.summarize(CATALOG, answers, TODAY, { returnAge: returnAge }).excluded.filter(function (e) {
      const p = programOf(e.id);
      return !(state.returned && p && p.timeline && p.timeline.phase === "before_return");
    });

    const totals = {};
    sched.months.forEach(function (m) {
      m.items.forEach(function (it) { totals[it.id] = (totals[it.id] || 0) + it.amount; });
    });
    sched.lumps.forEach(function (l) { totals[l.id] = (totals[l.id] || 0) + l.amount; });

    return {
      answers: answers, age: age, horizon: horizon, simOn: simOn, returnAge: returnAge,
      sched: sched, cmp: cmp, results: results, groupOf: groupOf,
      evsAll: evsAll, evs: evs, eligible: eligible, todoIds: todoIds,
      excluded: excluded, totals: totals,
      curve: simOn ? getCurve(answers, horizon) : null
    };
  }

  /* ---------- 복직 D-Day 역산 준비 일정 (규칙으로 계산) ----------
   * 복직 시뮬레이터에서 고른 복직 달의 1일을 D-Day로 보고, 그 전에 해야 할 행정 일정을 거꾸로 계산합니다.
   * 날짜는 매번 같은 규칙으로 계산하며 AI가 만들지 않습니다. (AI 비서는 이 목록을 설명만 함)
   * 권장 시점이 이미 지났으면 '지금 바로'로 이번 달에 넣습니다. */
  function dayShift(dateStr, days) {
    const p = dateStr.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }

  function monthsBetween(a, b) {
    const x = a.split("-").map(Number), y = b.split("-").map(Number);
    return (y[0] - x[0]) * 12 + (y[1] - x[1]);
  }

  function dayLabel(date) {
    const p = date.split("-");
    return p[0] + "년 " + Number(p[1]) + "월 " + Number(p[2]) + "일경";
  }

  /* when(answers, 복직 때 아이 개월 수): 이 일정이 필요한 가정인지 */
  const RETURN_PREP = [
    {
      d: -90, url: "https://www.childcare.go.kr",
      when: function (a) { return a.childcare !== "yes"; },
      title: function () { return "어린이집 입소 대기 신청"; },
      detail: function () { return "인기 어린이집은 대기가 길어 복직 3개월 전에는 입소 대기를 걸어 두는 것을 권장해요. 아이사랑(임신육아종합포털)에서 여러 곳을 함께 신청할 수 있어요."; }
    },
    {
      d: -30, url: "https://www.bokjiro.go.kr",
      when: function (a) { return a.childcare !== "yes"; },
      title: function (age) { return age < 24 ? "부모급여 → 보육료 바우처 전환 신청" : "영유아 보육료(바우처) 신청"; },
      detail: function (age) {
        return age < 24
          ? "어린이집에 다니기 시작하면 부모급여 일부가 보육료 바우처로 바뀌어요. 복지로나 행정복지센터에서 보육료를 신청하고 국민행복카드를 준비하세요."
          : "어린이집을 이용하려면 보육료(바우처)를 신청해야 해요. 어린이집을 다니면 가정양육수당은 함께 받을 수 없어요.";
      }
    },
    {
      d: -30, url: null,
      when: function () { return !!leaveProgram(); },
      title: function () { return "회사에 복직일 확인·통보"; },
      detail: function () { return "휴직을 연장하려면 보통 종료 예정일 30일 전까지 회사에 신청해야 해요. 인사팀과 복직일, 근무 형태(단축근무 등)를 미리 정해 두세요. 회사 규정을 꼭 확인하세요."; }
    },
    {
      d: -14, url: null,
      when: function (a) { return a.childcare !== "yes"; },
      title: function () { return "어린이집 적응 기간 시작"; },
      detail: function () { return "처음 등원하면 보통 1~2주 적응 기간이 필요해요. 복직 2주 전부터 짧게 등원해 보는 것을 권장해요."; }
    },
    {
      d: 0, url: "https://www.work24.go.kr",
      when: function (a) { return !!leaveProgram() && !!a.wage; },
      title: function () { return "육아휴직급여 신청 기한 확인"; },
      detail: function () { return "육아휴직급여는 휴직이 끝난 뒤 12개월 안에 고용24에서 신청해야 해요. 아직 신청하지 않은 달이 있는지 확인하세요."; }
    }
  ];

  function returnPrepEvents(answers, returnAge) {
    const age = answers.childMonths;
    if (returnAge == null || !isFinite(returnAge) || age == null || returnAge <= age) return [];
    const rDate = dateAtAge(returnAge);
    const out = [];
    RETURN_PREP.forEach(function (it) {
      if (it.when && !it.when(answers, returnAge)) return;
      let date = dayShift(rDate, it.d);
      const late = date < TODAY;
      if (late) date = TODAY;
      const offset = Math.max(0, monthsBetween(TODAY, date));
      const tag = it.d < 0 ? "복직 D" + it.d : it.d === 0 ? "복직 당일" : "복직 D+" + it.d;
      out.push({
        offset: offset,
        ageMonths: age + offset,
        date: date,
        type: "dday",
        programId: null,
        name: null,
        dday: it.d,
        url: it.url,
        title: tag + " · " + it.title(returnAge) + (late ? " (지금 바로)" : " (" + dayLabel(date) + ")"),
        detail: (late ? "권장 시점이 이미 지났어요. 지금 바로 챙기세요. " : "") + it.detail(returnAge),
        urgent: false
      });
    });
    return out;
  }

  /* 복직 준비 일정 카드 (AI 비서 안에서 씀) */
  function renderPrepCard(m, box) {
    clear(box);
    if (!m || !m.simOn) {
      box.appendChild(el("p", { class: "empty", text: state.returned ? "이미 복직해서 복직 준비 일정은 만들지 않아요." : "복직 예정으로 답하면 복직 시점에 맞춰 준비 일정을 만들어 드려요." }));
      return;
    }
    const list = m.evs.filter(function (e) { return e.type === "dday"; });
    if (!list.length) {
      box.appendChild(el("p", { class: "empty", text: "지금 고른 복직 시점 기준으로 따로 챙길 준비 일정이 없어요." }));
      return;
    }
    box.appendChild(el("ul", { class: "cal-events" }, list.map(function (e) {
      return el("li", { class: "cev cev-dday" }, [
        el("span", { class: "tag cev-tag", text: EVENT_LABEL.dday }),
        el("p", { class: "cev-title", text: e.title }),
        el("p", { class: "muted", text: e.detail })
      ]);
    })));
  }

  /* AI 답의 **굵게** 표시를 실제 굵은 글씨로 (글자는 그대로 textContent로만 넣음) */
  function mdBold(text) {
    return String(text || "").split(/\*\*(.+?)\*\*/g).map(function (part, i) {
      return i % 2 ? el("strong", { text: part }) : part;
    }).filter(function (x) { return x !== ""; });
  }

  /* 계산된 복직 준비 일정을 서버 AI(/api/explain-schedule)가 쉬운 말로 설명. 실패하면 일정 목록만 보여 줌 */
  function explainPrepWithAi() {
    const m = ui.lastModel;
    const items = (m && m.evs ? m.evs : []).filter(function (e) { return e.type === "dday"; });
    addUser("복직 준비 일정을 설명해 줘", false);
    if (!items.length) {
      addBot("지금은 설명할 복직 준비 일정이 없어요.", { note: "복직 예정으로 답하면 고른 복직 시점에 맞춰 준비 일정을 만들어 드려요." });
      setTimeout(scrollLog, 0);
      return;
    }
    let holder = null;
    addBot("AI가 복직 준비 일정을 설명하고 있어요…", {
      render: function (x, box) { holder = box; renderPrepCard(ui.lastModel, box); },
      note: "일정과 날짜는 규칙으로 계산했고, AI는 이 일정만 보고 설명해요. 새 일정이나 금액을 만들지 않도록 했어요."
    });
    const titleEl = holder && holder.parentNode ? holder.parentNode.querySelector(".msg-title") : null;
    fetch("/api/explain-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: summaryText(),
        items: items.map(function (e) { return { date: e.date, title: e.title, detail: e.detail }; })
      })
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (!data || data.status !== "success" || !data.reply) throw new Error("ai");
      if (titleEl) titleEl.textContent = "AI 비서가 복직 준비 일정을 설명해 드릴게요.";
      holder.insertBefore(el("p", {}, mdBold(data.reply)), holder.firstChild);
    }).catch(function () {
      if (titleEl) titleEl.textContent = "복직 준비 일정이에요. (AI 설명은 지금 불러오지 못했어요)";
    }).then(function () {
      setTimeout(scrollLog, 0);
    });
  }

  function resultOf(m, id) {
    return m.results.find(function (r) { return r.programId === id; });
  }

  function deadlineOf(m, id) {
    return m.evsAll.find(function (e) { return e.programId === id && e.type === "deadline"; });
  }

  /* 복직 시점별 35개월 합계: 답이 바뀔 때만 다시 계산합니다. */
  function getCurve(answers, horizon) {
    const key = JSON.stringify(answers) + "|" + state.returned;
    if (ui.curveKey === key && ui.curve) return ui.curve;
    const pts = [];
    for (let r = answers.childMonths; r <= 35; r += 1) {
      const s = Plan.monthlySchedule(CATALOG, answers, { today: TODAY, horizon: horizon, returnAge: r });
      pts.push({ age: r, cash: s.cashTotal, voucher: s.voucherTotal });
    }
    ui.curveKey = key;
    ui.curve = pts;
    return pts;
  }

  function renderResults(animateNumbers) {
    const focusId = document.activeElement && document.activeElement.id;
    const m = buildModel();
    ui.lastModel = m;
    refreshHero(m);
    $("summary-text").textContent = summaryText();
    $("demo-note").hidden = !state.demo;
    $("multi-note").hidden = state.answers.singleChild !== "no";
    renderOverview(m, animateNumbers);
    renderSimulation(m);
    renderMonthBreakdown(m);
    renderCalendar(m);
    refreshChat(m);
    if (focusId && focusId !== "returnAge" && focusId !== "returnPick" && focusId !== "baseAge") {
      const again = document.getElementById(focusId);
      if (again && again !== document.activeElement) again.focus({ preventScroll: true });
    }
  }

  /* ---------- 공통 표현 ---------- */

  function amountText(r) {
    const prog = programOf(r.programId);
    const lp = prog && prog.timeline && prog.timeline.leavePay;
    if (lp) {
      return "현금 · 월 · 통상임금의 " + Math.round(lp.rate * 100) + "% (휴직 개월차별 상한 " + lp.caps.map(function (c) { return won(c.cap); }).join(" → ") + ", 하한 " + won(lp.floor) + ")";
    }
    const table = prog && prog.timeline && prog.timeline.amountByAge;
    if (!table) return r.amountLine;
    return prog.supportKind + " · " + prog.payUnit + " · " + table.map(function (row) {
      return row.from + "~" + (row.to - 1) + "개월 " + won(row.amount);
    }).join(", ");
  }

  function shortAmount(prog) {
    const lp = prog.timeline && prog.timeline.leavePay;
    if (lp) return "통상임금의 " + Math.round(lp.rate * 100) + "% (상한 있음)";
    const table = prog.timeline && prog.timeline.amountByAge;
    if (table) return "월 " + table.map(function (row) { return won(row.amount); }).join(" → ");
    if (prog.amount != null) return (prog.payUnit === "일시" ? "한 번 " : "월 ") + won(prog.amount);
    return "금액 정보 없음";
  }

  function kindOfProg(prog) {
    if (prog.payUnit === "일시") return "lump";
    if (state.answers.childcare === "yes" && prog.timeline && (prog.timeline.voucherWhenChildcare || prog.timeline.childcareVoucherByAge)) return "voucher";
    return "cash";
  }

  function periodText(prog, withDates) {
    const r = prog.rules || {};
    if (r.maxMonthsExclusive == null) return "기간 정보 없음 · 기관 확인";
    let text = "아이 " + (r.minMonths || 0) + "~" + (r.maxMonthsExclusive - 1) + "개월";
    const phase = prog.timeline && prog.timeline.phase;
    if (phase === "before_return") text += ", 휴직 중";
    if (phase === "after_return") text += ", 복직 후";
    if (withDates) {
      const age = state.answers.childMonths;
      const from = Math.max(r.minMonths || 0, age);
      const to = r.maxMonthsExclusive - 1;
      if (to < age) text += " (기간 지남)";
      else text += " (" + approxMonthLabel(dateAtAge(from)) + "~" + approxMonthLabel(dateAtAge(to)) + ")";
    }
    return text;
  }

  function ruleConditionsText(prog) {
    if (!prog || !prog.rules) return "규칙 정보 없음";
    const r = prog.rules;
    const parts = [];
    parts.push(r.requiresWonju ? "원주시 거주" : "거주지 무관");
    if (r.minMonths != null && r.maxMonthsExclusive != null) parts.push("아이 " + r.minMonths + "~" + (r.maxMonthsExclusive - 1) + "개월");
    if (r.requiresReturn) parts.push("복직 예정 또는 복직");
    if (r.requiresChildcare) parts.push("어린이집 이용");
    return parts.join(", ");
  }

  function officialLink(prog, label, cls) {
    if (!prog.apply || !prog.apply.url) return null;
    return el("a", {
      class: cls || "btn-primary-sm",
      href: prog.apply.url,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": prog.name + " " + (label || "공식 사이트로 이동") + " (새 창)"
    }, [label || "공식 사이트로 이동", icon(ICONS.external, "ico-sm")]);
  }

  function goToTask(id) {
    ui.openTask = id;
    openChat(null);
    askChat("신청 순서 알려줘", { intent: "apply_order", slots: {} });
  }

  /* ---------- A. 한눈에 보기 ---------- */

  /* 한 달치 지급 항목을 표/목록용 행으로 펼칩니다. 현금+바우처 묶음은 두 줄로 나눕니다. */
  function payRows(mm, lumps) {
    const rows = [];
    mm.items.forEach(function (it) {
      if (it.kind === "split") {
        if (it.cash) rows.push({ id: it.id, name: it.name, kind: "cash", label: "현금", amount: it.cash });
        if (it.voucher) rows.push({ id: it.id, name: it.name, kind: "voucher", label: "보육료 바우처", amount: it.voucher });
      } else {
        rows.push({ id: it.id, name: it.name, kind: it.kind === "voucher" ? "voucher" : "cash", label: it.kind === "voucher" ? "바우처" : (it.deferred ? "현금 (나중에 받는 몫)" : "현금"), amount: it.amount });
      }
    });
    (lumps || []).forEach(function (l) { rows.push({ id: l.id, name: l.name, kind: "lump", label: "일시금", amount: l.amount }); });
    return rows;
  }

  function payRowEl(r) {
    const prog = programOf(r.id);
    return el("li", { class: "pay-row" }, [
      el("span", { class: "pay-ico pay-ico-" + r.kind }, [icon(ICONS[r.kind])]),
      el("span", { class: "pay-name" }, [r.name, prog ? vTag(prog) : null]),
      el("span", { class: "pay-kind", text: r.label }),
      el("strong", { class: "pay-amt", text: won(r.amount) })
    ]);
  }

  function srcText(prog) {
    if (!prog) return "";
    if (prog.sourceType === "가상") return "가상 예시";
    return prog.verification || "확인 필요";
  }

  /* ---------- 핵심 수치 카드 4개 (누르면 해당 위치로 이동) ---------- */

  function goTo(secId, targetSel) {
    const sec = $(secId);
    if (!sec) return;
    quickScrollTo(sec);
    const target = targetSel ? document.querySelector(targetSel) : sec;
    if (target) {
      target.classList.remove("is-flash");
      void target.offsetWidth;
      target.classList.add("is-flash");
      setTimeout(function () { target.classList.remove("is-flash"); }, 1200);
    }
  }

  function bestReturn(m) {
    if (!m.simOn || !m.curve || !m.curve.length) return null;
    return m.curve.reduce(function (b, p) { return p.cash > b.cash ? p : b; }, m.curve[0]);
  }

  function nextDeadline(m) {
    const list = m.evs.filter(function (e) { return e.type === "deadline"; });
    list.sort(function (a, b) { return a.offset - b.offset; });
    return list[0] || null;
  }

  /* 카드 4개의 내용(핵심 수치 + 바로가기). 시작 화면 카드가 이 내용을 씁니다. */
  function kpiSpecs(m) {
    const out = [];
    const total = m.sched.cashTotal + m.sched.lumpTotal;
    const parts = ["현금 " + won(m.sched.cashTotal)];
    if (m.sched.lumpTotal) parts.push("일시금 " + won(m.sched.lumpTotal));
    out.push({ key: "total", label: "총 예상 수령액", value: won(total), sub: "아이 35개월까지 · " + parts.join(" · "), go: "월별 명세서 보기" });

    const best = bestReturn(m);
    const flat = !!best && m.curve.every(function (p) { return p.cash === best.cash; });
    if (best && flat) {
      out.push({ key: "best", label: "최적 복직 추천 시점", value: "차이 없음", sub: "복직 시점을 옮겨도 받는 지원금 합계가 같아요", go: "복직 시뮬레이션 보기" });
    } else if (best) {
      const diff = best.cash - m.sched.cashTotal;
      out.push({
        key: "best", label: "최적 복직 추천 시점", value: "아이 " + best.age + "개월",
        sub: approxMonthLabel(dateAtAge(best.age)) + " · " + (diff > 0 ? "지금 고른 시점보다 현금 " + won(diff) + " 더" : "지금 고른 시점이 가장 많이 받아요"),
        go: "Top 3 비교 보기"
      });
    } else {
      out.push({
        key: "best", label: "최적 복직 추천 시점", value: state.returned ? "이미 복직" : "복직 계획 없음",
        sub: state.returned ? "복직 시점 비교는 하지 않아요" : "복직 예정으로 바꾸면 비교해 드려요", go: "복직 시뮬레이션 보기"
      });
    }

    const dl = nextDeadline(m);
    if (dl) {
      out.push({ key: "deadline", label: "다가오는 신청 마감", value: dl.offset <= 0 ? "이번 달" : dl.offset + "개월 뒤", sub: dl.name + " · " + approxMonthLabel(dl.date), urgent: !!dl.urgent, go: "일정에서 보기" });
    } else {
      out.push({ key: "deadline", label: "다가오는 신청 마감", value: "임박한 마감 없음", sub: "신청하지 않은 제도 중 정해진 마감이 없어요", go: "일정 보기" });
    }

    const ex = m.excluded;
    out.push({
      key: "excluded", label: "보류·제외된 혜택", value: ex.length + "건",
      sub: ex.length ? ex.slice(0, 2).map(function (e) { return e.name; }).join(", ") + (ex.length > 2 ? " 외 " + (ex.length - 2) + "건" : "") : "합계에서 빠진 제도가 없어요",
      go: "AI 비서에게 이유 묻기"
    });
    return out;
  }

  /* 카드를 눌렀을 때: 언제나 지금 화면의 모델(ui.lastModel)로 움직입니다. */
  function runKpi(key, opener) {
    const m = ui.lastModel;
    if (!m) return;
    if (key === "total") {
      ui.mbAge = m.age;
      renderMonthBreakdown(m);
      goTo("mb-card", "#mb-card");
    } else if (key === "best") {
      goTo("sec-sim", m.simOn ? "#top3" : null);
    } else if (key === "deadline") {
      const dl = nextDeadline(m);
      if (!dl) { goTo("sec-events"); return; }
      ui.calView = "grid";
      ui.calKey = monthKey(dl.date);
      renderCalendar(m);
      goTo("sec-events", "#cal-detail");
    } else if (key === "excluded") {
      openChat(opener);
      askChat("합계에서 뺀 제도는 왜 빠졌어요?");
    }
  }

  /* 시작 화면에서 보여줄 모델: 입력한 답이 있으면 그것, 없으면 예시 가구 */
  function previewModel() {
    if (state.answers.childMonths != null) { const m0 = buildModel(); return { m: m0, specs: kpiSpecs(m0), demo: false }; }
    const keep = { answers: Object.assign({}, state.answers), returnAge: state.returnAge, events: state.events };
    Object.assign(state.answers, DEMO_ANSWERS);
    let m, specs;
    try { m = buildModel(); specs = kpiSpecs(m); } finally {
      state.answers = keep.answers;
      state.returnAge = keep.returnAge;
      state.events = keep.events;
    }
    return { m: m, specs: specs, demo: true };
  }

  function openFromHero(key, opener) {
    if (state.answers.childMonths == null) {
      Object.assign(state.answers, DEMO_ANSWERS);
      state.returnAge = null;
      state.baseAge = null;
      state.demo = true;
    }
    showResults(false);
    runKpi(key, opener);
  }

  /* 복직 시점 Top 3 테마 (모두 계산값만 사용)
   *   1 실수령 극대화형: 아이 35개월까지 현금 합계가 가장 큰 시점 (같으면 더 이른 시점)
   *   2 경력·수익 균형형: 최대 합계의 90% 이상을 받으면서 가장 일찍 복직하는 시점
   *   3 집중 돌봄형: 아이 24개월(만 2세)까지 집에서 돌보는 시점 (이미 지났거나 겹치면 가장 늦은 시점) */
  function top3Themes(m) {
    const pts = m.curve;
    const max = pts.reduce(function (b, p) { return p.cash > b.cash ? p : b; }, pts[0]);
    const used = {};
    used[max.age] = true;
    let bal = null;
    pts.forEach(function (p) { if (!bal && !used[p.age] && p.cash >= max.cash * 0.9) bal = p; });
    if (!bal) pts.forEach(function (p) { if (!bal && !used[p.age]) bal = p; });
    if (bal) used[bal.age] = true;
    const target = m.age < 24 ? 24 : 35;
    let care = pts.find(function (p) { return p.age === target && !used[p.age]; }) || null;
    for (let i = pts.length - 1; !care && i >= 0; i -= 1) { if (!used[pts[i].age]) care = pts[i]; }
    return [
      { theme: "실수령 극대화형", p: max },
      bal ? { theme: "경력·수익 균형형", p: bal } : null,
      care ? { theme: "집중 돌봄형", p: care } : null
    ].filter(Boolean);
  }

  /* 테마 카드에 붙일 근거 (계산값): 금액 차이, 복직 시기 차이, 휴직 급여 개월, 특례, 집에서 돌보는 기간, 3월 신학기 */
  function themeFacts(m, t, max) {
    const pts = m.curve;
    const facts = [];
    if (t.p.age === max.age) {
      const gain = max.cash - pts[0].cash;
      facts.push(gain > 0 ? "바로 복직보다 현금 +" + won(gain) : "가장 많이 받는 시점");
    } else {
      facts.push(t.p.cash === max.cash ? "최대와 같은 금액" : "최대보다 현금 " + won(max.cash - t.p.cash) + " 적게");
      const gap = max.age - t.p.age;
      facts.push(gap > 0 ? gap + "개월 일찍 복직" : (-gap) + "개월 더 돌봄");
    }
    const s = Plan.monthlySchedule(CATALOG, m.answers, { today: TODAY, horizon: m.horizon, returnAge: t.p.age });
    const ls = leaveStats(s);
    if (ls && ls.count) facts.push("휴직 급여 " + ls.count + "개월");
    const lp = leaveProgram();
    const start = m.answers.leaveStartAge == null ? 0 : m.answers.leaveStartAge;
    if (lp && lp.timeline.leavePay.special && m.answers.wage && m.answers.spouseLeave === "yes" && start < lp.timeline.leavePay.special.withinChildMonths) facts.push("부모 함께 휴직 특례 반영");
    facts.push("집에서 " + (t.p.age - m.age) + "개월 돌봄");
    const mo = Number(dateAtAge(t.p.age).slice(5, 7));
    if (mo === 2 || mo === 3) facts.push("3월 신학기 어린이집 입소 시기");
    return facts;
  }

  function renderTop3(m) {
    const box = $("top3-list");
    clear(box);
    if (!m.simOn || !m.curve) return;
    if (m.curve.every(function (p) { return p.cash === m.curve[0].cash; })) {
      box.appendChild(el("li", { class: "top3-flat", text: "복직 시점을 옮겨도 받는 지원금 합계가 같아서 순위를 매기지 않았어요." }));
      return;
    }
    const themes = top3Themes(m);
    const max = themes[0].p;
    const baseRow = m.curve.find(function (p) { return p.age === state.baseAge; });
    themes.forEach(function (t, i) {
      const p = t.p;
      /* 강조는 지금 고른 복직 시점과 같은 카드 하나뿐입니다 (1순위 고정 강조 없음) */
      const isSel = p.age === m.returnAge;
      let diffText = null;
      if (baseRow) {
        const d = p.cash - baseRow.cash;
        diffText = d === 0 ? "비교 기준과 같음" : (d > 0 ? "+" : "−") + won(Math.abs(d));
      }
      box.appendChild(el("li", {}, [el("button", {
        type: "button",
        class: "top3-card" + (isSel ? " is-selected" : ""),
        "aria-pressed": isSel ? "true" : "false",
        "aria-label": (i + 1) + "순위 " + t.theme + ", 아이 " + p.age + "개월 복직, 현금 약 " + won(p.cash) + (isSel ? ", 선택됨" : ", 이 시점 보기"),
        onclick: function () { slider.value = String(p.age); renderResults(false); }
      }, [
        el("span", { class: "top3-top" }, [
          el("span", { class: "top3-badge", text: t.theme }),
          el("span", { class: "top3-state" }, isSel ? [icon(ICONS.check, "ico-sm"), "선택됨"] : ["이 시점 보기"])
        ]),
        el("strong", { class: "top3-age", text: "아이 " + p.age + "개월 복직" }),
        el("span", { class: "top3-when", text: approxMonthLabel(dateAtAge(p.age)) + " 예정" }),
        el("span", { class: "top3-when", text: themeFacts(m, t, max).join(" · ") }),
        el("span", { class: "top3-bottom" }, [
          el("span", { class: "top3-cap", text: "35개월까지 현금 합계" }),
          el("span", { class: "top3-row" }, [
            el("span", { class: "top3-cash", text: "약 " + won(p.cash) }),
            diffText ? el("span", { class: "top3-diff", text: diffText }) : null
          ])
        ])
      ])]));
    });
    /* 고른 복직 시점 기준 D-Day 준비 일정이 일정에 들어갔음을 알려 줌 (두 기능이 이어지는 지점) */
    const prep = m.evs.filter(function (e) { return e.type === "dday"; });
    if (prep.length) {
      box.appendChild(el("li", { class: "top3-flat" }, [
        "아이 " + m.returnAge + "개월 복직 기준 준비 일정 " + prep.length + "건(어린이집 대기·보육료 전환 등)을 일정에 넣었어요. ",
        el("button", { type: "button", class: "btn-ghost-sm", text: "일정에서 보기", onclick: function () { ui.calView = "grid"; ui.calKey = monthKey(prep[0].date); renderCalendar(ui.lastModel); goTo("sec-events", "#cal-detail"); } })
      ]));
    }
  }

  function renderOverview(m, animateNumbers) {
    const m0 = m.sched.months[0];
    const box = $("ov-card");
    clear(box);
    const big = el("p", { class: "ov-big", text: won(m0.cash) });
    if (animateNumbers) countUpWon(big, m0.cash, "", "");
    const sub = ["아이 35개월까지 현금 약 " + won(m.sched.cashTotal)];
    if (m.sched.lumpTotal) sub.push("일시금 " + won(m.sched.lumpTotal) + " 별도");
    if (m0.voucher) sub.push("바우처 " + won(m0.voucher) + "은 따로 받아요");
    box.appendChild(el("div", { class: "ov-top" }, [
      el("p", { class: "ov-label", text: "이번 달 받을 수 있는 금액" }),
      big,
      el("p", { class: "ov-sub", text: sub.join(" · ") })
    ]));

    const rows = payRows(m0, m.sched.lumps);
    box.appendChild(el("h3", { class: "ov-list-title", text: "이번 달 지급 내역" }));
    box.appendChild(rows.length
      ? el("ul", { class: "pay-list" }, rows.map(payRowEl))
      : el("p", { class: "empty", text: "이번 달에 받는 금액이 없어요." }));

    const acts = [];
    if (m.todoIds.length) {
      acts.push(el("button", { type: "button", class: "ov-ask", onclick: function (e) { openChat(e.currentTarget); askChat("신청 순서 알려줘"); } }, [
        "아직 신청하지 않은 제도 " + m.todoIds.length + "개, 신청 순서 보기"
      ]));
    }
    if (m.excluded.length) {
      acts.push(el("button", { type: "button", class: "ov-ask", onclick: function (e) { openChat(e.currentTarget); askChat("합계에서 뺀 제도는 왜 빠졌어요?"); } }, [
        "합계에서 뺀 제도 " + m.excluded.length + "개, 이유 보기"
      ]));
    }
    if (acts.length) box.appendChild(el("div", { class: "ov-acts" }, [el("span", { class: "ov-acts-lead" }, [aiIcon(), "AI 비서에게 물어보기"])].concat(acts)));
  }

  /* ---------- B. 복직 시뮬레이션 ---------- */

  function leaveBasis(answers, returnAge) {
    const prog = leaveProgram();
    if (!prog || state.returned) return "";
    if (!answers.wage) return "휴직 중 급여는 월 통상임금을 입력하지 않아 계산에서 뺐습니다. 위의 '답 바꾸기'에서 통상임금을 입력하면 함께 계산합니다.";
    const lp = prog.timeline.leavePay;
    const start = answers.leaveStartAge == null ? 0 : answers.leaveStartAge;
    const spouse = answers.spouseLeave === "yes";
    const max = spouse && lp.maxMonthsWithSpouse ? lp.maxMonthsWithSpouse : lp.maxMonths;
    const leaveEnd = start + max;
    let text = "휴직 중 급여는 월 통상임금 " + won(answers.wage) + ", 아이 " + start + "개월에 휴직 시작, 최대 " + max + "개월로 계산했습니다" + (spouse ? " (배우자 휴직 특례 반영)" : "") + ".";
    if (returnAge > leaveEnd) text += " 복직 시점이 휴직 급여 기간(아이 " + leaveEnd + "개월)보다 늦어서, 그 뒤 달은 급여 없이 쉬는 것으로 계산됩니다.";
    text += " 일반 육아휴직 기준이며, 한부모 근로자는 첫 3개월 월 상한이 300만 원으로 올라가는 특례가 있어요(계산에는 넣지 않았습니다).";
    return text;
  }

  function leaveStats(sched) {
    const prog = leaveProgram();
    if (!prog) return null;
    const months = sched.months.filter(function (mm) {
      return mm.items.some(function (it) { return it.id === prog.id && !it.deferred && it.amount > 0; });
    });
    return { count: months.length, last: months.length ? months[months.length - 1].ageMonths : null };
  }

  function renderSimulation(m) {
    const age = m.age;
    $("sim-on").hidden = !m.simOn;
    $("sim-off").hidden = m.simOn;
    $("sim-off").textContent = state.returned
      ? "이미 복직해서 복직 시점 비교는 하지 않습니다. 지금부터 받을 금액은 한눈에 보기와 일정에서 확인하세요."
      : "복직 계획이 없으면 복직 시점 비교를 하지 않습니다. 계획이 생기면 '답 바꾸기'에서 복직 예정으로 바꿔 보세요.";
    if (!m.simOn) return;
    renderTop3(m);

    const ra = m.returnAge;
    $("returnAge-out").textContent = returnLabel(ra, age);
    slider.setAttribute("aria-valuetext", "아이 " + ra + "개월, " + approxMonthLabel(dateAtAge(ra)));

    const pick = $("returnPick");
    clear(pick);
    for (let v = age; v <= 35; v += 1) {
      pick.appendChild(el("option", { value: String(v), text: approxMonthLabel(dateAtAge(v)) + " · 아이 " + v + "개월" }));
    }
    pick.value = String(ra);

    clear(baseSel);
    for (let v = age; v <= 35; v += 1) baseSel.appendChild(el("option", { value: String(v), text: returnLabel(v, age) }));
    baseSel.value = String(state.baseAge);

    $("sim-total").textContent = "약 " + won(m.sched.cashTotal);
    const diff = $("sim-diff");
    diff.className = "ctl-diff";
    if (ra === state.baseAge) {
      diff.textContent = "비교 기준(A)과 같은 시점입니다.";
    } else {
      const d = m.cmp.cashDiff;
      if (d === 0) diff.textContent = "비교 기준(A)과 현금 합계가 같습니다.";
      else {
        diff.textContent = (d > 0 ? "+" : "−") + won(Math.abs(d)) + ", 비교 기준(A)보다 " + (d > 0 ? "더 받습니다" : "덜 받습니다");
        diff.classList.add(d > 0 ? "plus" : "minus");
      }
    }

    renderCurve(m);
    renderBars(m.sched, ra);
    renderTable(m.sched);
    renderScenarios(m);

    $("leave-basis").textContent = leaveBasis(m.answers, ra) || "휴직 중 급여 제도가 없어 복직 시점은 복직 후 지원의 시작 시점에만 영향을 줍니다.";
    $("sim-note").textContent = "월급은 계산에 넣지 않았습니다. 복직을 늦추면 받는 지원금은 늘 수 있지만, 그동안 받지 못하는 월급은 이 합계에 빠져 있습니다.";
    showTab(ui.tab, false);
  }

  function niceMax(v) {
    if (v <= 0) return 10000;
    const step = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / step;
    const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(function (x) { return n <= x; });
    return nice * step;
  }

  function manWon(n) {
    return (Math.round(n / 10000)).toLocaleString("ko-KR") + "만";
  }

  function renderCurve(m) {
    const pts = m.curve;
    const box = $("curve");
    clear(box);
    const narrow = (box.clientWidth || 760) < 560;
    const W = Math.max(320, Math.min(760, box.clientWidth || 760)), H = narrow ? 240 : 280, L = narrow ? 48 : 64, R = narrow ? 14 : 20, T = 28, B = 36;
    const minAge = pts[0].age, maxAge = pts[pts.length - 1].age;
    const top = niceMax(Math.max.apply(null, pts.map(function (p) { return p.cash; })) * 1.08);
    const xs = function (a) { return maxAge === minAge ? (L + (W - L - R) / 2) : L + (a - minAge) / (maxAge - minAge) * (W - L - R); };
    const ys = function (v) { return T + (1 - v / top) * (H - T - B); };

    const best = pts.reduce(function (b, p) { return p.cash > b.cash ? p : b; }, pts[0]);
    const cur = pts.find(function (p) { return p.age === m.returnAge; }) || pts[0];
    const base = pts.find(function (p) { return p.age === state.baseAge; }) || pts[0];

    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "curve-svg", role: "img", "aria-labelledby": "curve-title curve-desc" });
    svg.appendChild(svgEl("title", { id: "curve-title" }, [document.createTextNode("복직 시점별 아이 35개월까지 현금 합계")]));
    svg.appendChild(svgEl("desc", { id: "curve-desc" }, [document.createTextNode(
      "아이 " + minAge + "개월에 복직하면 " + won(pts[0].cash) + ", 35개월에 복직하면 " + won(pts[pts.length - 1].cash) + ". 합계가 가장 큰 시점은 아이 " + best.age + "개월로 " + won(best.cash) + ". 지금 고른 시점(아이 " + cur.age + "개월)은 " + won(cur.cash) + ".")]));

    for (let i = 0; i <= 4; i += 1) {
      const v = top / 4 * i;
      const y = ys(v);
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y, y2: y, class: "c-grid" }));
      const t = svgEl("text", { x: L - 10, y: y + 4, class: "c-ylabel", "text-anchor": "end" });
      t.textContent = manWon(v);
      svg.appendChild(t);
    }
    pts.forEach(function (p) {
      const every = narrow ? 12 : 6;
      const nearEnd = p.age !== maxAge && maxAge - p.age < every / 2;
      if (p.age === minAge || p.age === maxAge || (p.age % every === 0 && !nearEnd && p.age - minAge >= every / 2)) {
        const t = svgEl("text", { x: xs(p.age), y: H - 12, class: "c-xlabel", "text-anchor": "middle" });
        t.textContent = narrow ? String(p.age) : p.age + "개월";
        svg.appendChild(t);
      }
    });

    const line = pts.map(function (p, i) { return (i ? "L" : "M") + xs(p.age).toFixed(1) + " " + ys(p.cash).toFixed(1); }).join(" ");
    const area = line + " L" + xs(maxAge).toFixed(1) + " " + ys(0) + " L" + xs(minAge).toFixed(1) + " " + ys(0) + " Z";
    svg.appendChild(svgEl("path", { d: area, class: "c-area" }));
    svg.appendChild(svgEl("path", { d: line, class: "c-line" }));

    pts.forEach(function (p) {
      const c = svgEl("circle", { cx: xs(p.age), cy: ys(p.cash), r: 3, class: "c-dot" });
      const tt = svgEl("title");
      tt.textContent = "아이 " + p.age + "개월에 복직: " + won(p.cash);
      c.appendChild(tt);
      svg.appendChild(c);
    });

    if (base.age !== cur.age) {
      svg.appendChild(svgEl("circle", { cx: xs(base.age), cy: ys(base.cash), r: 7, class: "c-base" }));
      const tb = svgEl("text", { x: xs(base.age), y: ys(base.cash) - 14, class: "c-tag c-tag-a", "text-anchor": "middle" });
      tb.textContent = "A";
      svg.appendChild(tb);
    }
    svg.appendChild(svgEl("line", { x1: xs(cur.age), x2: xs(cur.age), y1: T - 6, y2: ys(0), class: "c-guide" }));
    svg.appendChild(svgEl("circle", { cx: xs(cur.age), cy: ys(cur.cash), r: 8, class: "c-cur" }));
    const anchor = xs(cur.age) > W - 140 ? "end" : xs(cur.age) < L + 80 ? "start" : "middle";
    const tc = svgEl("text", { x: xs(cur.age) + (anchor === "end" ? -10 : anchor === "start" ? 10 : 0), y: T - 10, class: "c-tag c-tag-b", "text-anchor": anchor });
    tc.textContent = "B " + manWon(cur.cash) + " 원";
    svg.appendChild(tc);

    box.appendChild(svg);
    $("curve-cap").textContent = "가로는 복직 시점, 세로는 그때 복직하면 아이 35개월까지 받는 현금 합계입니다. 이 조건에서는 아이 " + best.age + "개월(" + approxMonthLabel(dateAtAge(best.age)) + ")에 복직할 때 합계가 가장 큽니다(" + won(best.cash) + ").";
  }

  function renderBars(sched, returnAge) {
    const bars = $("bars");
    const axis = $("bars-axis");
    clear(bars);
    clear(axis);
    const max = Math.max.apply(null, sched.months.map(function (mm) { return mm.cash + mm.voucher; }).concat([1]));
    sched.months.forEach(function (mm) {
      const after = mm.ageMonths >= returnAge;
      const label = mm.ageMonths + "개월 (" + approxMonthLabel(mm.date) + "): 현금 " + won(mm.cash) + (mm.voucher ? ", 바우처 " + won(mm.voucher) : "") + (after ? ", 복직 후" : ", 복직 전");
      bars.appendChild(el("div", { class: "bar" + (after ? " after" : "") + (mm.ageMonths === returnAge ? " return-marker" : ""), title: label }, [
        mm.voucher ? el("div", { class: "voucher", vars: { "--h-voucher": Math.round(mm.voucher / max * 150) + "px" } }) : null,
        el("div", { class: "cash", vars: { "--h-cash": Math.round(mm.cash / max * 150) + "px" } })
      ]));
      axis.appendChild(el("span", { text: mm.offset === 0 || mm.ageMonths === returnAge || mm.ageMonths % 6 === 0 ? String(mm.ageMonths) : "" }));
    });
    bars.setAttribute("aria-label", "개월별 금액 막대그래프. 아이 " + sched.months[0].ageMonths + "개월부터 35개월까지 현금 합계 " + won(sched.cashTotal) + ". 같은 값을 표 탭에서 볼 수 있습니다.");
    if (!$("legend")) {
      axis.insertAdjacentElement("afterend", el("div", { class: "legend", id: "legend" }, [
        el("span", {}, [el("i", { class: "sw-before" }), "복직 전 현금"]),
        el("span", {}, [el("i", { class: "sw-after" }), "복직 후 현금"]),
        el("span", {}, [el("i", { class: "sw-voucher" }), "바우처"])
      ]));
    }
  }

  function renderTable(sched) {
    const box = $("month-table");
    clear(box);
    const progs = [];
    const seen = {};
    sched.months.forEach(function (mm) {
      mm.items.forEach(function (it) {
        if (!seen[it.id]) { seen[it.id] = true; const p = programOf(it.id); progs.push({ id: it.id, name: p ? p.name : it.name }); }
      });
    });
    const head = [el("th", { scope: "col", text: "시점" }), el("th", { scope: "col", text: "현금 합계" }), el("th", { scope: "col", text: "바우처" })]
      .concat(progs.map(function (p) { return el("th", { scope: "col", text: p.name }); }));
    const tbody = el("tbody");
    sched.months.forEach(function (mm) {
      const cells = [
        el("th", { scope: "row", text: "아이 " + mm.ageMonths + "개월 (" + approxMonthLabel(mm.date) + ")" }),
        el("td", { text: won(mm.cash) }),
        el("td", { text: won(mm.voucher) })
      ];
      progs.forEach(function (p) {
        const sum = mm.items.filter(function (it) { return it.id === p.id; }).reduce(function (s, x) { return s + x.amount; }, 0);
        cells.push(el("td", { text: sum ? won(sum) : "−" }));
      });
      tbody.appendChild(el("tr", { class: mm.ageMonths >= sched.returnAge ? "is-after" : "" }, cells));
    });
    box.appendChild(el("table", { class: "data-table" }, [
      el("caption", { class: "sr-only", text: "개월별, 제도별 받는 금액" }),
      el("thead", {}, [el("tr", {}, head)]),
      tbody
    ]));
  }

  function scenarioRows(sched, ra, age) {
    const ls = leaveStats(sched);
    const lp = leaveProgram();
    let leaveText = "해당 없음";
    if (lp && !state.answers.wage) leaveText = "통상임금 미입력으로 계산 안 함";
    else if (ls && ls.count) leaveText = ls.count + "개월, 아이 " + ls.last + "개월까지";
    else if (ls) leaveText = "받는 달 없음";
    return [
      ["복직 달", approxMonthLabel(dateAtAge(ra))],
      ["35개월까지 현금", "약 " + won(sched.cashTotal)],
      ["바우처 합계", won(sched.voucherTotal)],
      ["휴직 중 급여", leaveText]
    ];
  }

  function fillDl(dl, rows) {
    clear(dl);
    rows.forEach(function (r) {
      dl.appendChild(el("div", { class: "scn-row" }, [el("dt", { text: r[0] }), el("dd", { text: r[1] })]));
    });
  }

  function renderScenarios(m) {
    fillDl($("scn-a"), scenarioRows(m.cmp.a, state.baseAge, m.age));
    fillDl($("scn-b"), scenarioRows(m.cmp.b, m.returnAge, m.age));
    $("scn-b-pick").textContent = returnLabel(m.returnAge, m.age);
    const gap = $("scn-gap");
    clear(gap);
    const d = m.cmp.cashDiff;
    gap.className = "scn-gap" + (d > 0 ? " plus" : d < 0 ? " minus" : "");
    gap.appendChild(el("span", { class: "scn-gap-label", text: "B − A" }));
    gap.appendChild(el("strong", { text: d === 0 ? "차이 없음" : (d > 0 ? "+" : "−") + won(Math.abs(d)) }));
    if (m.cmp.voucherDiff) gap.appendChild(el("span", { class: "scn-gap-sub", text: "바우처 " + (m.cmp.voucherDiff > 0 ? "+" : "−") + won(Math.abs(m.cmp.voucherDiff)) }));
  }

  const TABS = ["curve", "bars", "table"];
  function showTab(name, focus) {
    ui.tab = name;
    TABS.forEach(function (t) {
      const tab = $("tab-" + t);
      const on = t === name;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      $("panel-" + t).hidden = !on;
      if (on && focus) tab.focus();
    });
    if (name === "curve" && ui.lastModel && ui.lastModel.simOn) renderCurve(ui.lastModel);
  }

  /* ---------- D. 신청 순서 ---------- */

  function appliedBox(prog, where, pfx) {
    const id = "applied-" + (pfx || "") + where + "-" + prog.id;
    return el("label", { class: "applied", for: id }, [
      el("input", {
        type: "checkbox", id: id, checked: state.applied[prog.id] ? true : null,
        onchange: function (e) {
          state.applied[prog.id] = e.target.checked;
          ui.openTask = prog.id;
          renderResults(false);
        }
      }),
      el("span", { text: where === "done" ? "신청 표시 해제하려면 체크를 푸세요" : "신청을 마쳤어요" })
    ]);
  }

  function renderChecklist(m, box, pfx) {
    pfx = pfx || "";
    clear(box);
    const done = m.eligible.length - m.todoIds.length;
    const pct = m.eligible.length ? Math.round(done / m.eligible.length * 100) : 0;
    box.appendChild(el("div", { class: "chk-progress" }, [
      el("p", { class: "chk-progress-text" }, [el("strong", { text: m.eligible.length ? done + " / " + m.eligible.length + "개" : "해당 제도 없음" }), " 신청 표시함"]),
      el("div", { class: "r-meter", "aria-hidden": "true" }, [el("span", { class: "r-meter-fill", vars: { "--p": String(pct / 100) } })])
    ]));

    if (!m.eligible.length) {
      box.appendChild(el("p", { class: "empty", text: "지금 조건으로 신청할 제도가 없어요. '왜 확인 필요예요?'라고 물어보세요." }));
    }

    const groups = Plan.applyOrder(m.eligible, CATALOG, m.evs, m.age);
    let nowId = null;
    groups.forEach(function (g) { g.ids.forEach(function (id) { if (!nowId && !state.applied[id]) nowId = id; }); });
    const openId = ui.openTask || nowId;

    groups.forEach(function (g, gi) {
      const list = el("ol", { class: "tasks" });
      g.ids.forEach(function (id) {
        const prog = programOf(id);
        const isDone = !!state.applied[id];
        const isNow = id === nowId;
        const st = isDone ? "done" : isNow ? "now" : "wait";
        const d = m.evs.find(function (e) { return e.programId === id && e.type === "deadline"; });
        const open = id === openId;
        const bodyId = pfx + "task-body-" + id;
        const docs = prog.documents && prog.documents.length
          ? el("ul", { class: "doc-list" }, prog.documents.map(function (x) { return el("li", { text: x }); }))
          : el("p", { class: "muted", text: "서류 목록 준비 중입니다. 신청 전에 기관에 확인하세요." });
        const a = prog.apply;
        list.appendChild(el("li", { class: "task task-" + st + (open ? " is-open" : ""), id: pfx + "task-" + id }, [
          el("button", {
            type: "button", class: "task-toggle", "aria-expanded": open ? "true" : "false", "aria-controls": bodyId,
            onclick: function () {
              ui.openTask = open ? "__none__" : id;
              renderResults(false);
              const again = document.querySelector("#" + pfx + "task-" + id + " .task-toggle");
              if (again) again.focus({ preventScroll: true });
            }
          }, [
            el("span", { class: "task-mark", "aria-hidden": "true" }, [isDone ? icon(ICONS.check, "ico-sm") : null]),
            el("span", { class: "task-main" }, [
              el("span", { class: "task-name" }, [prog.name, vTag(prog)]),
              d ? el("span", { class: "tag " + (d.urgent ? "urgent" : "check"), text: (d.urgent ? "마감 임박 " : "마감 ") + approxMonthLabel(d.date) }) : null,
              el("span", { class: "task-state", text: isDone ? "신청 표시함" : isNow ? "지금 할 일" : "대기" })
            ]),
            icon(ICONS.chevron, "task-chev")
          ]),
          el("div", { class: "task-body", id: bodyId, hidden: !open }, [
            el("div", { class: "task-col" }, [el("p", { class: "task-col-title", text: "준비할 서류" }), docs]),
            el("div", { class: "task-col" }, [
              el("p", { class: "task-col-title", text: "신청 경로" }),
              a ? el("p", { text: a.where }) : el("p", { class: "muted", text: "신청 방법 정보 없음 · 기관 확인" }),
              a ? el("p", { class: "muted", text: a.channel + ", " + prog.agency }) : null,
              a && a.url ? officialLink(prog, "공식 사이트로 이동", "btn-primary-sm") : el("p", { class: "muted", text: "온라인 신청이 없어 창구에 방문해야 합니다." })
            ]),
            el("div", { class: "task-col task-col-done" }, [
              el("p", { class: "task-col-title", text: "신청 완료 기록" }),
              el("p", { class: "muted", text: "신청을 마쳤다면 체크하세요. 이 화면에만 기록되며 기관에 제출되지 않습니다." }),
              appliedBox(prog, "todo", pfx)
            ])
          ])
        ]));
      });
      box.appendChild(el("div", { class: "step-group" }, [
        el("h3", { class: "step-title" }, [el("span", { class: "step-no", text: String(gi + 1) }), g.title]),
        g.note ? el("p", { class: "step-note", text: g.note }) : null,
        list
      ]));
    });

    const doneList = m.eligible.filter(function (id) { return state.applied[id]; });
    if (doneList.length) {
      box.appendChild(el("div", { class: "sub-block" }, [
        el("h3", { text: "신청 완료 표시한 제도 " + doneList.length + "개" }),
        el("p", { class: "muted", text: "체크를 풀면 다시 신청할 목록과 마감 일정에 들어갑니다." }),
        el("ul", { class: "done-list" }, doneList.map(function (id) {
          const prog = programOf(id);
          return el("li", {}, [el("span", { class: "done-name" }, [prog.name, vTag(prog)]), appliedBox(prog, "done", pfx)]);
        }))
      ]));
    }

    const soon = Plan.upcoming(m.eligible, m.evs);
    if (soon.length) {
      box.appendChild(el("div", { class: "sub-block" }, [
        el("h3", { text: "앞으로 대상이 되는 제도" }),
        el("p", { class: "muted", text: "지금은 신청할 수 없지만, 시점이 되면 미리 신청해야 받습니다." }),
        el("ul", { class: "soon-list" }, soon.map(function (e) {
          const prog = programOf(e.programId);
          return el("li", {}, [
            el("span", { class: "done-name" }, [prog.name, vTag(prog)]),
            el("span", { class: "muted", text: "아이 " + e.ageMonths + "개월(" + approxMonthLabel(e.date) + ")부터" + (prog.apply ? ", " + prog.apply.channel : "") })
          ]);
        }))
      ]));
    }

    box.appendChild(el("div", { class: "chk-foot" }, [
      el("button", { type: "button", class: "btn-ghost-sm", text: "달력 앱에 넣기 (.ics)", onclick: downloadICS })
    ]));
  }

  /* ---------- E. 일정 ---------- */

  function monthKey(date) { return date.slice(0, 7); }

  function calendarItems(m) {
    const byKey = {};
    m.evs.forEach(function (e) {
      const k = monthKey(e.date);
      (byKey[k] = byKey[k] || []).push(e);
    });
    m.evs.filter(function (e) { return e.type === "deadline" && e.offset >= 1; }).forEach(function (e) {
      const date = Plan.addMonths(TODAY, e.offset - 1);
      const k = monthKey(e.offset - 1 === 0 ? TODAY : date);
      (byKey[k] = byKey[k] || []).push({
        type: "prep", offset: e.offset - 1, ageMonths: e.ageMonths - 1, date: e.offset - 1 === 0 ? TODAY : date,
        programId: e.programId, name: e.name, title: e.name + " 서류 미리 준비하기",
        detail: "다음 달이 신청 마감이라 서류를 미리 챙겨 두면 좋습니다. 계산된 일정이 아니라 권장 일정이며, 달력 파일에는 넣지 않습니다."
      });
    });
    return byKey;
  }

  function eventAction(m, e) {
    if (e.type === "dday") {
      return el("div", { class: "msg-acts" }, [
        e.url ? el("a", { class: "btn-ghost-sm", href: e.url, target: "_blank", rel: "noopener noreferrer", "aria-label": e.title + " 공식 사이트 (새 창)" }, ["공식 사이트", icon(ICONS.external, "ico-sm")]) : null,
        el("button", { type: "button", class: "btn-ghost-sm", onclick: function (ev) { openChat(ev.currentTarget); explainPrepWithAi(); } }, [aiIcon(), "AI 비서에게 설명 듣기"])
      ]);
    }
    if ((e.type === "deadline" || e.type === "prep") && m.eligible.indexOf(e.programId) >= 0) {
      return el("button", { type: "button", class: "btn-ghost-sm", text: "AI 비서에서 신청 순서 보기", onclick: function () { goToTask(e.programId); } });
    }
    if (e.type === "start" && e.programId && m.eligible.indexOf(e.programId) < 0) {
      return el("p", { class: "muted", text: "해야 할 일: 지급 시작 전에 미리 신청해 두세요." });
    }
    if (e.type === "return" && m.simOn) {
      return el("button", { type: "button", class: "btn-ghost-sm", text: "복직 시뮬레이션에서 바꿔 보기", onclick: function () { quickScrollTo($("sec-sim")); slider.focus({ preventScroll: true }); } });
    }
    return null;
  }

  function renderCalendar(m) {
    const items = calendarItems(m);
    const urgent = m.evs.filter(function (e) { return e.type === "deadline" && e.urgent; });
    const alert = $("cal-alert");
    alert.hidden = !urgent.length;
    alert.textContent = urgent.length ? "마감 임박: " + urgent.map(function (e) { return e.name + " 신청 마감 " + approxMonthLabel(e.date); }).join(", ") : "";

    $("ics").hidden = !m.evs.length;
    $("cal-view-grid").setAttribute("aria-pressed", ui.calView === "grid" ? "true" : "false");
    $("cal-view-list").setAttribute("aria-pressed", ui.calView === "list" ? "true" : "false");
    $("cal").hidden = ui.calView !== "grid";
    $("events").hidden = ui.calView !== "list";
    renderEvents(m.evs);

    const keys = [];
    for (let i = 0; i < m.horizon; i += 1) keys.push(monthKey(i === 0 ? TODAY : Plan.addMonths(TODAY, i)));
    if (!ui.calKey || keys.indexOf(ui.calKey) < 0) ui.calKey = keys[0];

    const months = $("cal-months");
    clear(months);
    const years = {};
    keys.forEach(function (k) { years[k.slice(0, 4)] = true; });
    Object.keys(years).forEach(function (y) {
      const grid = el("div", { class: "cal-grid" });
      keys.filter(function (k) { return k.slice(0, 4) === y; }).forEach(function (k) {
        const mo = Number(k.slice(5, 7));
        const list = items[k] || [];
        const types = {};
        list.forEach(function (e) { types[e.type === "deadline" && e.urgent ? "urgent" : e.type === "dday" ? "return" : e.type] = true; });
        const age = m.age + keys.indexOf(k);
        grid.appendChild(el("button", {
          type: "button",
          class: "cal-cell" + (k === keys[0] ? " is-now" : "") + (list.length ? " has-ev" : ""),
          "aria-pressed": k === ui.calKey ? "true" : "false",
          "aria-label": y + "년 " + mo + "월, 아이 " + age + "개월, 일정 " + list.length + "건" + (k === keys[0] ? ", 이번 달" : ""),
          onclick: function () {
            ui.calKey = k;
            renderCalendar(m);
            const again = document.querySelector(".cal-cell[aria-pressed='true']");
            if (again) again.focus({ preventScroll: true });
          }
        }, [
          el("span", { class: "cal-m", text: mo + "월" }),
          el("span", { class: "cal-age", text: age + "개월" }),
          list.length ? el("span", { class: "cal-dots" }, Object.keys(types).map(function (t) { return el("i", { class: "dot dot-" + t }); }).concat([el("span", { class: "cal-n", text: list.length + "건" })])) : null
        ]));
      });
      months.appendChild(el("div", { class: "cal-year" }, [el("h3", { class: "cal-y", text: y + "년" }), grid]));
    });
    months.appendChild(el("p", { class: "cal-legend" }, [
      ["urgent", "마감 임박"], ["deadline", "신청 마감"], ["prep", "서류 준비 권장"], ["start", "지급 시작"], ["change", "금액 변경"], ["end", "지급 종료"], ["return", "복직"], ["tip", "바우처 안내"]
    ].map(function (l) { return el("span", {}, [el("i", { class: "dot dot-" + l[0] }), l[1]]); })));

    const detail = $("cal-detail");
    clear(detail);
    const k = ui.calKey;
    const idx = keys.indexOf(k);
    const list = (items[k] || []).slice().sort(function (a, b) { return a.offset - b.offset; });
    detail.appendChild(el("div", { class: "cal-detail-head" }, [
      el("h3", { text: k.slice(0, 4) + "년 " + Number(k.slice(5, 7)) + "월경" }),
      el("p", { class: "muted", text: "아이 " + (m.age + idx) + "개월 무렵" + (idx === 0 ? ", 이번 달" : "") })
    ]));
    if (!list.length) {
      detail.appendChild(el("p", { class: "empty", text: "이 달에는 챙길 일정이 없습니다." }));
      return;
    }
    detail.appendChild(el("ul", { class: "cal-events" }, list.map(function (e) {
      const prog = e.programId ? programOf(e.programId) : null;
      return el("li", { class: "cev cev-" + e.type + (e.urgent ? " is-urgent" : "") }, [
        el("span", { class: "tag cev-tag", text: e.urgent ? "마감 임박" : EVENT_LABEL[e.type] }),
        el("p", { class: "cev-title", text: e.title }),
        prog ? el("p", { class: "cev-prog" }, [prog.name, vTag(prog)]) : null,
        e.detail ? el("p", { class: "muted", text: e.detail }) : null,
        eventAction(m, e)
      ]);
    })));
  }

  function renderEvents(evs) {
    const box = $("events");
    clear(box);
    if (!evs.length) {
      box.appendChild(el("li", { class: "empty", text: "아이 35개월까지 따로 챙길 일정이 없습니다." }));
      return;
    }
    evs.forEach(function (e) {
      const prog = e.programId ? programOf(e.programId) : null;
      box.appendChild(el("li", { class: "ev ev-" + e.type + (e.urgent ? " urgent" : "") }, [
        el("div", { class: "ev-when" }, [
          el("span", { class: "ev-date", text: e.offset === 0 ? "이번 달" : approxMonthLabel(e.date) }),
          el("span", { class: "ev-age", text: "아이 " + e.ageMonths + "개월 무렵" })
        ]),
        el("div", { class: "ev-body" }, [
          el("span", { class: "tag ev-tag", text: e.urgent ? "마감 임박" : EVENT_LABEL[e.type] }),
          el("strong", { text: e.title }),
          prog ? vTag(prog) : null,
          e.detail ? el("p", { class: "help", text: e.detail }) : null
        ])
      ]));
    });
  }

  function downloadICS() {
    const evs = (state.events || []).filter(function (e) { return e.offset > 0 || e.type === "deadline"; });
    const text = Plan.toICS(evs, {
      stamp: TODAY,
      calendarName: "육아 혜택 챙길 일",
      footer: VIRTUAL ? "(가상 예시 일정입니다. 실제 기한은 기관에 확인하세요.)" : "(예상 일정입니다. 실제 기한은 기관에 확인하세요.)"
    });
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "육아혜택-챙길일.ics" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    $("ics-help").textContent = "달력 파일에 일정 " + evs.length + "건을 담아 내려받았습니다. 파일을 열면 달력 앱에 추가됩니다.";
  }

  /* ---------- 제도별 판정 ---------- */

  function renderEligibility(m, box, filter) {
    const f = filter || {};
    clear(box);
    const ids = f.programIds && f.programIds.length ? f.programIds : null;
    const results = ids ? m.results.filter(function (r) { return ids.indexOf(r.programId) >= 0; }) : m.results;
    const grouped = Plan.groupResults(results);
    let shown = 0;
    Plan.GROUPS.forEach(function (g) {
      if (f.group && g !== f.group) return;
      const list = grouped[g];
      if ((ids || f.group) && !list.length) return;
      const section = el("div", { class: "elig-group" }, [
        el("h3", { class: "elig-title" }, [el("span", { class: "tag " + TAG[g], text: g }), el("span", { class: "elig-count", text: list.length + "개" })])
      ]);
      if (!list.length) section.appendChild(el("p", { class: "muted", text: "이 분류에 해당하는 제도가 없어요." }));
      list.forEach(function (r) {
        shown += 1;
        const prog = programOf(r.programId);
        const ev = el("ul", { class: "evidence" });
        r.reasons.forEach(function (t) { ev.appendChild(el("li", { text: "판정 사유: " + t })); });
        ev.appendChild(el("li", { text: "자격 요건: " + ruleConditionsText(prog) }));
        ev.appendChild(el("li", { text: "입력한 조건: " + summaryText() }));
        ev.appendChild(el("li", { text: "데이터 상태: " + (r.sourceType === "가상" ? "가상 예시 데이터 (공식 자료로 확인하지 않음)" : r.sourceType + ", 확인일 " + r.confirmedOn) }));
        if (prog.confirmNote) ev.appendChild(el("li", { text: "추가 확인: " + prog.confirmNote }));
        if (prog.overlapUnverified) ev.appendChild(el("li", { text: "추가 확인: 다른 제도와 함께 받을 수 있는지 확인되지 않았습니다." }));
        (r.evidence || []).forEach(function (e) { ev.appendChild(el("li", { text: e.topic + ": " + e.location + ", " + e.text })); });

        section.appendChild(el("div", { class: "elig-row" }, [
          el("div", { class: "elig-main" }, [
            el("p", { class: "elig-name" }, [r.name, vTag(prog), g === "해당" && state.applied[prog.id] ? el("span", { class: "tag ok", text: "신청 표시함" }) : null]),
            el("p", { class: "muted", text: amountText(r) }),
            g !== "해당" ? el("p", { class: "elig-reason", text: r.reasons.join(" ") }) : null,
            g === "확인 필요" && !prog.confirmNote ? el("p", { class: "elig-reason", text: "아직 공식 자료로 확인하지 못했어요. 담당 기관에 확인이 필요해요." }) : null
          ]),
          el("details", { class: "elig-why", open: ids ? true : null }, [el("summary", { text: "근거 보기" }), ev])
        ]));
      });
      box.appendChild(section);
    });
    if (!shown && (ids || f.group)) box.appendChild(el("p", { class: "empty", text: f.group ? "지금 조건에서는 '" + f.group + "'인 제도가 없어요." : "해당 제도의 판정 결과가 없어요." }));
  }

  let resizeTimer = null;
  window.addEventListener("resize", function () {
    if (state.view !== "results") return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (ui.curve && !$("sim-on").hidden) renderResults(false); }, 150);
  });

  /* ---------- 결과 화면 섹션 메뉴 ---------- */

  function setupSectionNav() {
    if (ui.navReady) return;
    ui.navReady = true;
    const links = Array.prototype.slice.call(document.querySelectorAll(".r-nav-link[data-sec]"));
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        const id = a.getAttribute("href").slice(1);
        const target = $(id);
        if (!target) return;
        e.preventDefault();
        quickScrollTo(target);
      });
    });
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) {
          if (l.getAttribute("data-sec") === en.target.id) l.setAttribute("aria-current", "true");
          else l.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    links.forEach(function (l) {
      const t = $(l.getAttribute("data-sec"));
      if (t) io.observe(t);
    });
  }

  /* ---------- B-2. 월별 지급 내역 (나란히 비교를 대신함) ---------- */

  function clampAge(m, age) {
    const first = m.sched.months[0].ageMonths;
    const last = m.sched.months[m.sched.months.length - 1].ageMonths;
    if (age == null || !isFinite(age)) return first;
    return Math.max(first, Math.min(last, age));
  }

  /* 합계에서 뺀 제도: 이유 + 받으려면 무엇이 필요한지 */
  function rescueText(m, e) {
    const prog = programOf(e.id), r = resultOf(m, e.id);
    if (!prog || !r) return "";
    if (prog.replacedBy && /엇갈려/.test(e.reason)) {
      const o = programOf(prog.replacedBy);
      return o ? "담당 기관(원주시 보육아동과)에 " + o.name + "과 함께 받을 수 있는지 확인하세요. 함께 받는다고 확인되면 합계에 더해져요." : "";
    }
    if (prog.amountPolicy === "wage" && !m.answers.wage) return "'답 바꾸기'에서 월 통상임금을 입력하면 합계에 들어가요.";
    if (r.status === "조건 불일치") {
      const labels = (r.failed || []).map(function (f) { return f.label; });
      if (state.returned && prog.timeline && prog.timeline.phase === "before_return") return "휴직 중에 신청하지 못했다면 해당 기관에 소급이 되는지 문의해 보세요.";
      if (labels.indexOf("보육 시설") >= 0) return "어린이집 이용 여부가 바뀌면 다시 판정해요.";
      if (labels.indexOf("복직") >= 0) return "복직 예정으로 바뀌면 다시 판정해요.";
      if (labels.indexOf("연령") >= 0 && prog.rules) return "이 제도는 아이 " + prog.rules.minMonths + "개월 이상 " + prog.rules.maxMonthsExclusive + "개월 미만일 때 받아요.";
      if (labels.indexOf("거주") >= 0) return "거주 조건이 충족되면 다시 판정해요.";
      return "";
    }
    if (r.status === "보류") return "'답 바꾸기'에서 빠진 답을 채우면 다시 판정해요.";
    if (r.status === "확인 필요") {
      if (prog.lateCheck && m.answers.childMonths >= prog.lateCheck.fromMonths) return "담당 기관에 지금도 신청되는지 확인하세요. 가능하다고 확인되면 받을 수 있어요.";
      return "공식 사이트나 담당 기관에서 조건을 확인한 뒤 신청하세요. 확인이 끝나면 합계에 넣을 수 있어요.";
    }
    return "";
  }

  function exLi(m, e) {
    const tip = rescueText(m, e);
    return el("li", {}, [el("strong", { text: e.name }), " " + e.reason, tip ? el("span", { class: "ex-rescue" }, [el("b", { text: "받으려면 " }), tip]) : null]);
  }

  function renderMonthBreakdown(m) {
    const sel = $("mb-month");
    ui.mbAge = clampAge(m, ui.mbAge);
    clear(sel);
    m.sched.months.forEach(function (mm) {
      sel.appendChild(el("option", { value: String(mm.ageMonths), text: "아이 " + mm.ageMonths + "개월 · " + approxMonthLabel(mm.date) }));
    });
    sel.value = String(ui.mbAge);
    const first = m.sched.months[0].ageMonths;
    const last = m.sched.months[m.sched.months.length - 1].ageMonths;
    $("mb-prev").disabled = ui.mbAge <= first;
    $("mb-next").disabled = ui.mbAge >= last;
    renderBreakdownInto(m, ui.mbAge, $("mb-body"), null);
  }

  function renderBreakdownInto(m, age, box, onlyIds) {
    clear(box);
    const a = clampAge(m, age);
    const mm = m.sched.months.find(function (x) { return x.ageMonths === a; }) || m.sched.months[0];
    let rows = payRows(mm, mm.offset === 0 ? m.sched.lumps : []);
    const filtered = !!(onlyIds && onlyIds.length);
    if (filtered) rows = rows.filter(function (r) { return onlyIds.indexOf(r.id) >= 0; });
    const phase = m.simOn ? (mm.ageMonths >= m.returnAge ? "복직 후" : "휴직 중") : null;
    box.appendChild(el("p", { class: "mb-when" }, [
      el("strong", { text: "아이 " + mm.ageMonths + "개월 (" + approxMonthLabel(mm.date) + ")" }),
      phase ? " · " + phase : null
    ]));

    if (!rows.length) {
      box.appendChild(el("p", { class: "empty", text: filtered ? "고른 제도는 이 달에 받는 금액이 없어요." : "이 달에 받는 금액이 없어요." }));
    } else {
      const tbody = el("tbody", {}, rows.map(function (r) {
        const prog = programOf(r.id);
        return el("tr", {}, [
          el("th", { scope: "row", "data-label": "지원금" }, [el("span", { class: "mb-name" }, [el("span", { class: "pay-ico pay-ico-" + r.kind }, [icon(ICONS[r.kind], "ico-sm")]), r.name])]),
          el("td", { "data-label": "지급 방식", text: r.label }),
          el("td", { "data-label": "이달 금액", class: "num" }, [el("strong", { text: won(r.amount) })]),
          el("td", { "data-label": "근거" }, [prog && prog.verification === "공식 확인" && prog.sourceType !== "가상" ? el("span", { class: "mb-src" }, [vTag(prog), "공식 확인"]) : el("span", { class: "mb-src muted", text: srcText(prog) })])
        ]);
      }));
      const lumpSum = rows.filter(function (r) { return r.kind === "lump"; }).reduce(function (s, r) { return s + r.amount; }, 0);
      const cashSum = filtered ? rows.filter(function (r) { return r.kind === "cash"; }).reduce(function (s, r) { return s + r.amount; }, 0) : mm.cash;
      const vSum = filtered ? rows.filter(function (r) { return r.kind === "voucher"; }).reduce(function (s, r) { return s + r.amount; }, 0) : mm.voucher;
      const foot = [el("tr", {}, [el("th", { scope: "row", colspan: "2", text: filtered ? "고른 제도의 현금" : "현금 합계" }), el("td", { class: "num", colspan: "2" }, [el("strong", { text: won(cashSum) })])])];
      if (vSum) foot.push(el("tr", {}, [el("th", { scope: "row", colspan: "2", text: "바우처 합계 (현금과 따로)" }), el("td", { class: "num", colspan: "2", text: won(vSum) })]));
      if (lumpSum) foot.push(el("tr", {}, [el("th", { scope: "row", colspan: "2", text: "일시금 (한 번만, 별도)" }), el("td", { class: "num", colspan: "2", text: won(lumpSum) })]));
      box.appendChild(el("div", { class: "table-scroll" }, [el("table", { class: "data-table mb-table" }, [
        el("caption", { class: "sr-only", text: "아이 " + mm.ageMonths + "개월에 받는 지원금 내역" }),
        el("thead", {}, [el("tr", {}, ["지원금", "지급 방식", "이달 금액", "근거"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
        tbody,
        el("tfoot", {}, foot)
      ])]));
      if (filtered) box.appendChild(el("p", { class: "muted", text: "이 달 전체 현금 합계는 " + won(mm.cash) + "이에요." }));
    }
    if (!filtered && m.excluded.length) {
      box.appendChild(el("div", { class: "mb-ex" }, [
        el("p", { class: "mb-ex-title", text: "합계에서 뺀 제도 " + m.excluded.length + "개" }),
        el("ul", {}, m.excluded.map(function (e) { return exLi(m, e); }))
      ]));
    }
  }

  /* ---------- AI 비서 (챗봇) ----------
   * 질문 이해: WonjuChat.parseIntent (지금은 규칙 기반, 나중에 Bedrock으로 교체)
   * 금액·판정: 언제나 규칙 엔진(buildModel / Plan.*) 결과만 씁니다. */

  const Chat = window.WonjuChat;
  const CHAT_PROGRAMS = CATALOG.map(function (p) { return { id: p.id, name: p.name }; });
  const CHIPS = ["이달 신청할 제도 보여줘", "신청 순서 알려줘", "왜 확인 필요예요?", "공고문 AI 분석"];
  const MORE_CHIPS = ["복직 준비 일정 보여줘", "12개월에 복직하면 얼마예요?", "둘째 낳으면 얼마 더 받아요?", "다음 전환 시기가 언제예요?", "부모급여랑 아동수당 비교해줘"];
  const chat = { open: false, opener: null, live: [], seq: 0, toastTimer: null };
  const FLASH = { "sec-overview": ".ov-big", "sec-sim": "#sim-total", "sec-events": "#cal-detail" };

  function chipButtons(list, cls) {
    return list.map(function (t) {
      return el("button", { type: "button", class: cls || "chat-chip", text: t, onclick: function (e) { openChat(e.currentTarget); askChat(t); } });
    });
  }

  function updateChatHeader(m) {
    const conds = $("chat-conds");
    clear(conds);
    if (!m) return;
    const a = state.answers;
    conds.appendChild(el("span", { class: "chat-cond", text: a.livesInWonju === "yes" ? "원주시 거주" : "원주시 외 거주" }));
    conds.appendChild(el("span", { class: "chat-cond", text: "생후 " + a.childMonths + "개월" }));
    conds.appendChild(el("span", { class: "chat-cond chat-cond-key", text: a.wage ? "월급 " + won(Number(a.wage)) : "월급 미입력" }));
    $("chat-live").textContent = "이달 받을 수 있는 금액 " + won(m.sched.months[0].cash) + " · 아이 35개월까지 현금 약 " + won(m.sched.cashTotal) + (m.simOn ? " · 아이 " + m.returnAge + "개월 복직 기준" : "");
  }

  function refreshChat(m) {
    updateChatHeader(m);
    chat.live.forEach(function (c) { c.render(m, c.box, c.pfx); });
  }

  function trapFocus(e) {
    if (e.key === "Escape") { e.preventDefault(); closeChat(false); return; }
    if (e.key !== "Tab") return;
    const nodes = Array.prototype.slice.call($("chat-dialog").querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, summary, [tabindex]:not([tabindex='-1'])"))
      .filter(function (n) { return n.offsetParent !== null; });
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openChat(opener) {
    if (state.view !== "results" || !ui.lastModel) return;
    if (!chat.open) chat.opener = opener || document.activeElement;
    chat.open = true;
    $("chat-layer").hidden = false;
    $("chat-pill").hidden = true;
    document.documentElement.classList.add("chat-open");
    updateChatHeader(ui.lastModel);
    if (!$("chat-log").firstChild) greet();
    setTimeout(function () { $("chat-input").focus({ preventScroll: true }); }, 0);
  }

  function closeChat(minimize) {
    if (!chat.open) return;
    chat.open = false;
    $("chat-layer").hidden = true;
    $("chat-pill").hidden = !minimize;
    document.documentElement.classList.remove("chat-open");
    if (!minimize && chat.opener && document.body.contains(chat.opener)) chat.opener.focus({ preventScroll: true });
  }

  function viewInPage(secId) {
    closeChat(true);
    const sec = $(secId);
    if (!sec) return;
    quickScrollTo(sec);
    const target = FLASH[secId] ? document.querySelector(FLASH[secId]) : sec;
    if (target) {
      target.classList.remove("is-flash");
      void target.offsetWidth;
      target.classList.add("is-flash");
      setTimeout(function () { target.classList.remove("is-flash"); }, 1200);
    }
  }

  function showToast(text) {
    const t = $("chat-toast");
    t.textContent = text;
    t.classList.add("is-on");
    clearTimeout(chat.toastTimer);
    chat.toastTimer = setTimeout(function () { t.classList.remove("is-on"); t.textContent = ""; }, 3000);
  }

  function scrollLog() {
    const log = $("chat-log");
    log.scrollTop = log.scrollHeight;
  }

  function addUser(text, masked) {
    $("chat-log").appendChild(el("div", { class: "msg msg-user" }, [
      el("p", { class: "bubble", text: text }),
      masked ? el("p", { class: "msg-mask", text: "민감한 개인정보를 자동으로 가렸어요" }) : null
    ]));
  }

  /* opts: { render(m, box, pfx), live, page } */
  function addBot(title, opts) {
    const o = opts || {};
    chat.seq += 1;
    const pfx = "c" + chat.seq + "-";
    const box = el("div", { class: "msg-card" });
    const acts = [];
    if (o.page) acts.push(el("button", { type: "button", class: "msg-act", onclick: function () { if (o.beforePage) o.beforePage(); viewInPage(o.page); } }, ["본문에서 보기", icon(ICONS.external, "ico-sm")]));
    (o.extra || []).forEach(function (x) { acts.push(x); });
    $("chat-log").appendChild(el("div", { class: "msg msg-bot" }, [
      el("p", { class: "msg-kicker" }, [aiIcon(), "AI 비서"]),
      el("p", { class: "msg-title", text: title }),
      o.render ? box : null,
      o.note ? el("p", { class: "msg-note", text: o.note }) : null,
      acts.length ? el("div", { class: "msg-acts" }, acts) : null
    ]));
    if (o.render) {
      o.render(ui.lastModel, box, pfx);
      if (o.live) chat.live.push({ render: o.render, box: box, pfx: pfx });
    }
  }

  function greet() {
    addBot("안녕하세요. 입력하신 우리 집 조건으로 계산한 결과를 바탕으로 답해 드릴게요.", {
      note: "금액과 판정은 규칙 엔진이 계산해요. 아래처럼 물어보세요.",
      render: function (m, box) { clear(box); box.appendChild(el("div", { class: "chat-suggest" }, chipButtons(MORE_CHIPS, "chat-chip"))); }
    });
  }

  function askChat(raw, preset) {
    const masked = Chat.maskSensitive(raw);
    const text = masked.text.trim();
    if (!text) return;
    if (masked.found.length) showToast("민감한 개인정보(" + masked.found.join(", ") + ")를 자동으로 가렸어요");
    addUser(text, masked.found.length > 0);
    const parsed = preset || Chat.parseIntent(text, { programs: CHAT_PROGRAMS });
    runIntent(parsed, text);
    setTimeout(scrollLog, 0);
  }

  /* 신청할 제도 카드 (예전 '지금 신청할 수 있는 혜택' 디자인) */
  function renderBenefitCards(m, box) {
    clear(box);
    const m0 = m.sched.months[0];
    if (!m.eligible.length) {
      box.appendChild(el("p", { class: "empty", text: "지금 조건으로 바로 신청할 수 있는 제도가 없어요." }));
      return;
    }
    box.appendChild(el("div", { class: "benefit-grid" }, m.eligible.map(function (id) {
      const prog = programOf(id);
      const kind = kindOfProg(prog);
      const item = m0.items.find(function (it) { return it.id === id; });
      const lump = m.sched.lumps.find(function (l) { return l.id === id; });
      const now = item ? "이번 달 " + won(item.amount) + (item.kind === "voucher" ? " (바우처)" : item.kind === "split" ? " (현금 " + won(item.cash) + " + 바우처 " + won(item.voucher) + ")" : "")
        : lump ? "한 번 " + won(lump.amount)
        : (prog.nowText || "이번 달 지급 없음");
      const d = deadlineOf(m, id);
      return el("div", { class: "benefit" }, [
        el("span", { class: "benefit-ico benefit-ico-" + kind }, [icon(ICONS[kind])]),
        el("div", { class: "benefit-body" }, [
          el("p", { class: "benefit-name" }, [prog.name, vTag(prog)]),
          el("p", { class: "benefit-amount", text: now }),
          el("p", { class: "benefit-meta", text: [shortAmount(prog), periodText(prog, false), d ? approxMonthLabel(d.date) + "까지 신청" : null, prog.apply && prog.apply.channel !== "방문 필수" ? "방문 없이 신청 가능" : null].filter(Boolean).join(" · ") }),
          el("div", { class: "benefit-acts" }, [
            el("span", { class: "tag " + (state.applied[id] ? "ok" : "check"), text: state.applied[id] ? "신청 표시함" : "미신청" }),
            officialLink(prog, "공식 사이트", "btn-primary-sm")
          ])
        ])
      ]);
    })));
  }

  function renderSimulateCard(m, box, asked) {
    clear(box);
    if (!m.simOn) {
      box.appendChild(el("p", { class: "empty", text: state.returned ? "이미 복직해서 복직 시점 비교는 하지 않아요." : "복직 계획이 없으면 복직 시점 비교를 하지 않아요. '답 바꾸기'에서 복직 예정으로 바꿔 보세요." }));
      return;
    }
    const pts = m.curve;
    const best = pts.reduce(function (b, p) { return p.cash > b.cash ? p : b; }, pts[0]);
    const pick = {};
    [pts[0].age, 12, 18, 24, best.age, m.returnAge].forEach(function (a) { if (a >= pts[0].age && a <= 35) pick[a] = true; });
    const ages = Object.keys(pick).map(Number).sort(function (x, y) { return x - y; });
    const max = Math.max.apply(null, pts.map(function (p) { return p.cash; }).concat([1]));
    box.appendChild(el("ul", { class: "sim-mini" }, ages.map(function (a) {
      const p = pts.find(function (x) { return x.age === a; });
      const tags = [];
      if (a === best.age) tags.push(el("span", { class: "sim-best", text: "현금 합계 최대" }));
      if (a === m.returnAge) tags.push(el("span", { class: "sim-cur", text: "지금 고른 시점" }));
      return el("li", { class: a === best.age ? "is-best" : "" }, [
        el("span", { class: "sim-mini-label" }, ["아이 " + a + "개월 복직"].concat(tags)),
        el("span", { class: "hbar-track" }, [el("span", { class: "hbar-fill hbar-cash", vars: { "--s": String(Math.max(0.02, p.cash / max)) } })]),
        el("strong", { text: "약 " + won(p.cash) })
      ]);
    })));
    if (asked != null && (asked < pts[0].age || asked > 35)) {
      box.appendChild(el("p", { class: "muted", text: "아이 " + pts[0].age + "개월부터 35개월 사이에서 고를 수 있어요." }));
    }
  }

  /* ---------- 공고문 AI 분석 (예전 ai-assist.js 기능을 AI 비서 안으로) ----------
   * 파일(PDF·HWP·HWPX, 15MB 이하) → POST /api/analyze, 공고 주소 → POST /api/analyze-url
   * 결과: 제목·태그·한 줄 요약·대상·혜택·방법·서류·문의처·확인할 점·어려운 말 풀이·소리로 듣기
   * 서버·AI가 준 글은 모두 textContent로만 넣습니다. */
  const DOC_MAX = 15 * 1024 * 1024;
  const DOC_TIMEOUT = 90000;
  const TTS_LABEL = "소리로 듣기";

  /* 서버를 부르고 JSON을 돌려줌. 실패하면 사용자에게 보여 줄 문장으로 Error를 던짐 */
  function callAiApi(url, options) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, DOC_TIMEOUT);
    return fetch(url, Object.assign({}, options, { signal: ctrl ? ctrl.signal : undefined }))
      .catch(function (e) {
        throw new Error(e && e.name === "AbortError"
          ? "AI 응답이 너무 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요."
          : "AI 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.");
      })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!data) throw new Error("서버 응답을 읽지 못했어요. (HTTP " + res.status + ")");
          if (data.status === "error") throw new Error([data.user_message, data.suggestion].filter(Boolean).join(" "));
          if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "요청을 처리하지 못했어요. (HTTP " + res.status + ")");
          return data;
        });
      })
      .then(function (data) { clearTimeout(timer); return data; }, function (e) { clearTimeout(timer); throw e; });
  }

  /* 결과 한 줄 "제목: 내용" (판정 근거 목록과 같은 evidence 모양). 비어 있으면 그리지 않음 */
  function docFact(label, value) {
    if (!value || (Array.isArray(value) && !value.length)) return null;
    return el("li", {}, [el("strong", { text: label + ": " }), Array.isArray(value) ? value.map(String).join(" / ") : String(value)]);
  }

  /* 브라우저 음성 합성으로 요약 읽기. 지원하지 않으면 버튼을 만들지 않음 */
  function ttsButton(script) {
    if (!script || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return null;
    const btn = el("button", { type: "button", class: "msg-act", text: TTS_LABEL });
    btn.addEventListener("click", function () {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.textContent = TTS_LABEL;
        return;
      }
      const u = new SpeechSynthesisUtterance(script);
      u.lang = "ko-KR";
      u.rate = 0.95;
      u.onend = u.onerror = function () { btn.textContent = TTS_LABEL; };
      window.speechSynthesis.speak(u);
      btn.textContent = "듣기 멈추기";
    });
    return btn;
  }

  function renderDocResult(box, data, sourceLabel) {
    clear(box);
    const tags = (data.tags || []).map(function (t) { return el("span", { class: "chat-cond", text: t }); });
    const glossary = (data.glossary || []).filter(function (g) { return g && g.term; });
    box.appendChild(el("p", { class: "muted", text: sourceLabel }));
    box.appendChild(el("p", { class: "msg-sum" }, [el("strong", { text: data.title || "제목을 찾지 못한 공고" })]));
    if (tags.length) box.appendChild(el("div", { class: "chat-conds" }, tags));
    if (data.one_line_summary) box.appendChild(el("p", { text: data.one_line_summary }));
    box.appendChild(el("ul", { class: "evidence" }, [
      docFact("지원 대상", data.target),
      docFact("지원 내용", data.benefit),
      docFact("신청 방법", data.method),
      docFact("제출 서류", data.documents),
      docFact("문의처", data.contact),
      docFact("신청 전 확인할 점", data.checklist)
    ]));
    if (glossary.length) {
      box.appendChild(el("details", { class: "elig-why" }, [
        el("summary", { text: "어려운 말 풀이 " + glossary.length + "개" }),
        el("ul", { class: "evidence" }, glossary.map(function (g) {
          return el("li", {}, [el("strong", { text: g.term + ": " }), g.easy || g.easy_term || g.description || ""]);
        }))
      ]));
    }
    const tts = ttsButton(data.tts_full_script);
    if (tts) box.appendChild(el("div", { class: "msg-acts" }, [tts]));
    box.appendChild(el("p", { class: "muted", text: "AI가 공고문을 요약한 내용이에요. 틀릴 수 있으니 원문과 담당 부서에서 확인하세요." }));
  }

  /* 공고문 AI 분석 입력 카드. preUrl이 있으면 바로 그 주소를 분석 */
  function renderDocForm(box, preUrl) {
    clear(box);
    const status = el("p", { class: "msg-note", role: "status", hidden: true });
    const result = el("div", { class: "msg-sub", hidden: true });
    const fileIn = el("input", { type: "file", accept: ".pdf,.hwp,.hwpx,application/pdf", "aria-label": "공고문 파일" });
    const urlIn = el("input", { type: "url", inputmode: "url", placeholder: "https://www.wonju.go.kr/...", "aria-label": "공고 페이지 주소", value: preUrl || null });
    const fileBtn = el("button", { type: "button", class: "msg-act", text: "파일 분석" });
    const urlBtn = el("button", { type: "button", class: "msg-act", text: "주소로 분석" });
    let busy = false;

    function show(text, kind) {
      status.hidden = !text;
      status.textContent = text || "";
      status.className = "msg-note"; // 진행·오류 모두 기존 안내 글 모양 (문장으로 구분)
    }
    function run(request, label) {
      if (busy) return;
      busy = true;
      fileBtn.disabled = urlBtn.disabled = true;
      show("AI가 공고문을 읽고 있어요. 길면 1분 정도 걸릴 수 있어요…", "loading");
      request().then(function (data) {
        show("", null);
        result.hidden = false;
        renderDocResult(result, data, label);
        setTimeout(scrollLog, 0);
      }).catch(function (e) {
        show(e.message, "error");
      }).then(function () {
        busy = false;
        fileBtn.disabled = urlBtn.disabled = false;
      });
    }
    function goUrl() {
      const u = urlIn.value.trim();
      if (!/^https?:\/\/\S+$/i.test(u)) {
        show("http:// 또는 https:// 로 시작하는 공고 페이지 주소를 넣어 주세요.", "error");
        urlIn.focus();
        return;
      }
      run(function () {
        return callAiApi("/api/analyze-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) });
      }, "공고 주소 · " + u);
    }

    fileBtn.addEventListener("click", function () {
      const f = fileIn.files && fileIn.files[0];
      if (!f) { show("분석할 공고문 파일을 먼저 골라 주세요.", "error"); fileIn.focus(); return; }
      if (!/\.(pdf|hwp|hwpx)$/i.test(f.name)) { show("PDF 또는 한글(HWP, HWPX) 파일만 분석할 수 있어요.", "error"); return; }
      if (f.size > DOC_MAX) { show("파일 용량이 너무 커요. 15MB 이하 파일만 올릴 수 있어요.", "error"); return; }
      const body = new FormData();
      body.append("file", f, f.name);
      run(function () { return callAiApi("/api/analyze", { method: "POST", body: body }); }, "올린 파일 · " + f.name);
    });
    urlBtn.addEventListener("click", goUrl);
    urlIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); goUrl(); } });

    box.appendChild(el("p", { class: "muted", text: "시청·행정복지센터 공고문(PDF, HWP, HWPX, 15MB 이하)을 올리거나 공고 페이지 주소를 넣으면 대상, 혜택, 신청 방법, 서류를 쉽게 정리해요. 개인 서류가 아닌 공고문만 올려 주세요." }));
    /* 입력칸은 AI 비서 입력창(chat-form)과 같은 모양, 버튼은 카드의 msg-act 버튼 */
    box.appendChild(el("div", { class: "side-chips" }, [
      el("div", { class: "chat-form" }, [fileIn, fileBtn]),
      el("div", { class: "chat-form" }, [urlIn, urlBtn])
    ]));
    box.appendChild(status);
    box.appendChild(result);
    if (preUrl) goUrl();
  }

  function nextBirthOrder(o) { return !o || o === "first" ? "second" : "third_plus"; }
  const ORDER_LABEL = { first: "첫째", second: "둘째", third_plus: "셋째 이상", second_plus: "둘째 이상" };

  function renderSecondChildCard(m, box) {
    clear(box);
    const cur = state.answers.birthOrder || "first";
    const nxt = nextBirthOrder(cur);
    const opts = { today: TODAY, horizon: 36 };
    function totals(order) {
      const s = Plan.monthlySchedule(CATALOG, Object.assign({}, state.answers, { childMonths: 0, birthOrder: order, returnToWork: "no" }), opts);
      const t = {};
      s.months.forEach(function (mm) { mm.items.forEach(function (it) { t[it.id] = (t[it.id] || 0) + it.amount; }); });
      s.lumps.forEach(function (l) { t[l.id] = (t[l.id] || 0) + l.amount; });
      return t;
    }
    const a = totals(cur), b = totals(nxt);
    const rows = CATALOG.filter(function (p) { return (b[p.id] || 0) !== (a[p.id] || 0); });
    if (!rows.length) {
      box.appendChild(el("p", { class: "empty", text: "지금 조건에서는 출생 순서에 따라 달라지는 금액이 없어요." }));
      return;
    }
    let sum = 0;
    box.appendChild(el("ul", { class: "pay-list" }, rows.map(function (p) {
      const d = (b[p.id] || 0) - (a[p.id] || 0);
      sum += d;
      return el("li", { class: "pay-row" }, [
        el("span", { class: "pay-ico pay-ico-" + kindOfProg(p) }, [icon(ICONS[kindOfProg(p)])]),
        el("span", { class: "pay-name" }, [p.name, vTag(p)]),
        el("span", { class: "pay-kind", text: ORDER_LABEL[cur] + " " + won(a[p.id] || 0) + " → " + ORDER_LABEL[nxt] + " " + won(b[p.id] || 0) }),
        el("strong", { class: "pay-amt pay-plus", text: (d > 0 ? "+" : "−") + won(Math.abs(d)) })
      ]);
    })));
    box.appendChild(el("p", { class: "msg-sum" }, [ORDER_LABEL[nxt] + "라서 더 받는 금액 ", el("strong", { text: (sum >= 0 ? "+" : "−") + won(Math.abs(sum)) })]));
  }

  function renderCalendarCard(m, box) {
    clear(box);
    const list = m.evs.filter(function (e) { return e.type !== "tip"; }).slice(0, 5);
    if (!list.length) {
      box.appendChild(el("p", { class: "empty", text: "아이 35개월까지 따로 챙길 일정이 없어요." }));
      return;
    }
    box.appendChild(el("ul", { class: "cal-events" }, list.map(function (e) {
      const prog = e.programId ? programOf(e.programId) : null;
      return el("li", { class: "cev cev-" + e.type + (e.urgent ? " is-urgent" : "") }, [
        el("span", { class: "tag cev-tag", text: e.urgent ? "마감 임박" : EVENT_LABEL[e.type] }),
        el("p", { class: "cev-title", text: (e.offset === 0 ? "이번 달" : approxMonthLabel(e.date)) + " · 아이 " + e.ageMonths + "개월 · " + e.title }),
        prog ? el("p", { class: "cev-prog" }, [prog.name, vTag(prog)]) : null,
        e.detail ? el("p", { class: "muted", text: e.detail }) : null
      ]);
    })));
  }

  /* 규칙으로 이해하지 못한 질문은 서버 AI(/api/chat, Bedrock)에게 물어봅니다.
     금액·판정의 기준은 언제나 화면의 규칙 엔진이고, 서버 AI 답은 참고로 보여 줍니다.
     서버가 꺼져 있거나 실패하면 예전처럼 예시 질문을 보여 줍니다. */
  function fallbackChips(box) {
    clear(box);
    box.appendChild(el("p", { class: "muted", text: "아직 이 질문은 이해하지 못했어요. 추측해서 답하지 않을게요. 이런 걸 물어볼 수 있어요." }));
    box.appendChild(el("div", { class: "chat-suggest" }, chipButtons(CHIPS.concat(MORE_CHIPS), "chat-chip")));
  }

  /* 서버 AI 답을 카드에 그림. 새 스타일 없이 AI 비서 카드에 이미 있는 모양만 씀
     (목록 doc-list, 소제목 mb-ex-title, 합계 줄 msg-sum, 안내 muted)
     순서: 답변 문장 → 해당하는 혜택 → 확인이 필요한 혜택 → AI 기준 합계와 화면 계산 비교 → AI가 이해한 조건 → 안내 */
  function aiList(title, items, lineOf) {
    if (!items || !items.length) return null;
    return el("div", { class: "msg-sub" }, [
      el("p", { class: "mb-ex-title", text: title }),
      el("ul", { class: "doc-list" }, items.map(function (x) { return el("li", { text: lineOf(x) }); }))
    ]);
  }

  function renderAiAnswer(box, data) {
    clear(box);
    box.appendChild(el("p", {}, mdBold(data.reply)));
    [
      aiList("해당하는 혜택", data.matched, function (x) { return x.title + (x.amount_text ? " · " + x.amount_text : ""); }),
      aiList("확인이 필요한 혜택", data.check, function (x) { return x.title + (x.reason ? " · " + x.reason : ""); })
    ].forEach(function (n) { if (n) box.appendChild(n); });

    if (data.source !== "screen" && (data.total_monthly || data.total_once)) {
      box.appendChild(el("p", { class: "msg-sum" }, [
        "AI 기준 합계 ",
        el("strong", { text: "매월 " + won(Number(data.total_monthly) || 0) }),
        data.total_once ? " · 일시금 " + won(Number(data.total_once)) : null
      ]));
    }
    const m = ui.lastModel;
    if (m && m.sched && m.sched.months.length) {
      const cash0 = m.sched.months[0].cash;
      box.appendChild(el("p", { class: "msg-sum" }, [
        "화면 계산 ",
        el("strong", { text: "이번 달 현금 " + won(cash0) }),
        m.sched.lumpTotal ? " · 일시금 " + won(m.sched.lumpTotal) : null
      ]));
      if (data.source !== "screen" && (Number(data.total_monthly) || 0) !== cash0) {
        box.appendChild(el("p", { class: "muted", text: "두 금액이 달라요. 서버 AI는 별도 혜택 목록으로 계산하고, 화면은 복직 시점·어린이집·출생 순서까지 반영해 계산해요. 금액은 화면 계산을 기준으로 보세요." }));
      }
    }
    const pf = data.extracted_profile;
    if (pf) {
      const bits = [
        pf.child_months != null ? "생후 " + pf.child_months + "개월" : null,
        pf.work_status || null,
        pf.income_level && pf.income_level !== "모름" ? "소득 " + pf.income_level : null,
        pf.region || null
      ].filter(Boolean);
      if (bits.length) box.appendChild(el("p", { class: "muted", text: "AI가 이해한 조건: " + bits.join(" · ") }));
    }
    box.appendChild(el("p", { class: "muted", text: data.disclaimer || "정확한 지급 여부는 담당 부서에서 확인해 주세요." }));
  }

  /* 화면이 규칙 엔진으로 계산한 금액과 혜택 목록 (서버 AI는 이 숫자로만 답함 → 화면과 AI 금액 일치) */
  function screenFacts() {
    const m = ui.lastModel;
    if (!m || !m.sched || !m.sched.months.length) return null;
    const m0 = m.sched.months[0];
    return {
      child_months: m.age,
      return_age: m.simOn ? m.returnAge : null,
      this_month_cash: m0.cash,
      this_month_voucher: m0.voucher || 0,
      lump_total: m.sched.lumpTotal || 0,
      cash_total_35: m.sched.cashTotal,
      matched: payRows(m0, m.sched.lumps).map(function (r) { return { title: r.name, amount_text: r.label + " " + won(r.amount) }; }),
      check: (m.excluded || []).map(function (e) { return { title: e.name, reason: e.reason }; })
    };
  }

  function askServerAi(text) {
    let holder = null;
    addBot("서버 AI에게 물어보고 있어요…", {
      render: function (x, box) {
        holder = box;
        clear(box);
        box.appendChild(el("p", { class: "muted", text: "AI가 답을 정리하고 있어요. 잠시만 기다려 주세요." }));
      },
      note: "규칙으로 바로 답하지 못한 질문이라 서버 AI(Bedrock)에게 보냈어요. 우리 집 조건 요약, 화면에서 계산한 금액과 질문만 보내고, 서버에 저장하지 않아요."
    });
    if (!holder) return;
    const titleEl = holder.parentNode ? holder.parentNode.querySelector(".msg-title") : null;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 60000);
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "우리 가족 상황: " + summaryText() + "\n질문: " + text, screen: screenFacts() }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (!data || data.status !== "success" || !data.reply) throw new Error("ai");
      if (titleEl) titleEl.textContent = "서버 AI의 답변이에요.";
      renderAiAnswer(holder, data);
    }).catch(function () {
      if (titleEl) titleEl.textContent = "이 질문은 아직 답하지 못했어요.";
      fallbackChips(holder);
    }).then(function () {
      clearTimeout(timer);
      setTimeout(scrollLog, 0);
    });
  }

  function runIntent(p, rawText) {
    const s = p.slots || {};
    const m = ui.lastModel;
    switch (p.intent) {
      case "apply_list":
        addBot("우리 집 조건으로 지금 신청할 수 있는 제도예요.", { render: renderBenefitCards, live: true });
        break;
      case "apply_order":
        addBot("이 순서대로 하나씩 신청하면 돼요. 신청을 마치면 체크해 두세요. 체크는 이 화면에만 남아요.", { render: renderChecklist, live: true });
        break;
      case "eligibility": {
        const names = (s.programIds || []).map(function (id) { return programOf(id).name; });
        if (s.excluded) {
          addBot("합계에서 뺀 제도와 그 이유예요.", {
            render: function (mm, box) {
              clear(box);
              if (!mm.excluded.length) { box.appendChild(el("p", { class: "empty", text: "지금 합계에서 뺀 제도가 없어요." })); return; }
              box.appendChild(el("div", { class: "mb-ex" }, [
                el("ul", {}, mm.excluded.map(function (e) { return exLi(mm, e); }))
              ]));
              const sub = el("div", { class: "msg-sub" });
              box.appendChild(sub);
              renderEligibility(mm, sub, { programIds: mm.excluded.map(function (e) { return e.id; }) });
            },
            live: true
          });
          break;
        }
        const title = names.length ? names.join(", ") + " 판정 결과와 근거예요."
          : s.group === "확인 필요" ? "확인이 더 필요한 제도와 그 이유예요. 이 제도들은 금액을 합계에 넣지 않았어요."
          : "제도별 판정 결과와 근거예요.";
        addBot(title, { render: function (mm, box) { renderEligibility(mm, box, s); }, live: true });
        break;
      }
      case "compare": {
        const age = clampAge(m, s.month == null ? m.age : s.month);
        const names = (s.programIds || []).map(function (id) { return programOf(id).name; });
        addBot("아이 " + age + "개월에 " + (names.length ? names.join(", ") + "에서 " : "") + "받는 지원금 내역이에요.", {
          render: function (mm, box) { renderBreakdownInto(mm, age, box, s.programIds); },
          live: true,
          page: m.simOn ? "sec-sim" : "sec-overview",
          beforePage: function () { if (m.simOn) { ui.mbAge = age; renderMonthBreakdown(ui.lastModel); } }
        });
        break;
      }
      case "simulate": {
        let note = "월급은 합계에 넣지 않았어요. 복직을 늦추면 지원금은 늘 수 있지만 그동안 받지 못하는 월급은 빠져 있어요.";
        if (s.returnAge != null && m.simOn && s.returnAge >= m.age && s.returnAge <= 35) {
          slider.value = String(s.returnAge);
          renderResults(false);
        }
        const mm = ui.lastModel;
        addBot(mm.simOn ? "복직 시점별로 아이 35개월까지 받는 현금이에요." + (s.returnAge != null && mm.returnAge === s.returnAge ? " 시뮬레이션도 아이 " + s.returnAge + "개월 복직으로 바꿔 뒀어요." : "") : "복직 시점 비교를 할 수 없어요.", {
          render: function (x, box) { renderSimulateCard(ui.lastModel, box, s.returnAge); },
          note: mm.simOn ? note : null,
          page: mm.simOn ? "sec-sim" : null
        });
        break;
      }
      case "second_child": {
        const cur = state.answers.birthOrder || "first";
        addBot(ORDER_LABEL[nextBirthOrder(cur)] + "가 태어나면 출생 순서 때문에 달라지는 금액이에요.", {
          render: renderSecondChildCard,
          note: "새로 태어난 아이(생후 0개월) 기준으로, 출생 순서만 바꿔 계산했어요. 부모급여, 아동수당처럼 출생 순서와 상관없는 제도는 같은 기준으로 받아요. 확인되지 않은 다자녀 혜택은 넣지 않았어요."
        });
        break;
      }
      case "set_wage": {
        const before = { cash0: m.sched.months[0].cash, total: m.sched.cashTotal, wage: state.answers.wage };
        state.answers.wage = s.wage;
        renderResults(false);
        const after = ui.lastModel;
        const d = after.sched.cashTotal - before.total;
        addBot("월급을 " + won(s.wage) + "으로 바꿔서 다시 계산했어요.", {
          render: function (x, box) {
            clear(box);
            box.appendChild(el("table", { class: "data-table wage-table" }, [
              el("thead", {}, [el("tr", {}, ["", "바꾸기 전", "바꾼 뒤"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
              el("tbody", {}, [
                el("tr", {}, [el("th", { scope: "row", text: "월급" }), el("td", { text: before.wage ? won(Number(before.wage)) : "미입력" }), el("td", { text: won(s.wage) })]),
                el("tr", {}, [el("th", { scope: "row", text: "이번 달 현금" }), el("td", { text: won(before.cash0) }), el("td", { text: won(after.sched.months[0].cash) })]),
                el("tr", {}, [el("th", { scope: "row", text: "35개월까지 현금" }), el("td", { text: "약 " + won(before.total) }), el("td", {}, [el("strong", { text: "약 " + won(after.sched.cashTotal) })])])
              ])
            ]));
            box.appendChild(el("p", { class: "msg-sum" }, d === 0 ? ["합계가 달라지지 않았어요."] : ["차이 ", el("strong", { class: d > 0 ? "pay-plus" : "", text: (d > 0 ? "+" : "−") + won(Math.abs(d)) })]));
          },
          note: "월급은 육아휴직급여 계산에만 쓰여요." + (d === 0 ? " 지금 조건(휴직 기간, 복직 시점)에서는 금액이 바뀌지 않았어요." : " 휴직급여에는 개월별 상한이 있어요."),
          page: "sec-overview"
        });
        break;
      }
      case "analyze_doc":
        addBot(s.url ? "이 공고 주소를 AI로 분석할게요." : "공고문을 올리거나 주소를 넣으면 AI가 쉽게 정리해 드려요.", {
          render: function (x, box) { renderDocForm(box, s.url); },
          note: "올린 파일은 글자만 읽은 뒤 서버에 저장하지 않아요. AI 요약은 문서에 없는 내용은 비워 두도록 했지만 틀릴 수 있어요."
        });
        break;
      case "return_prep":
        addBot(m.simOn ? "아이 " + m.returnAge + "개월 복직 기준으로 거꾸로 계산한 준비 일정이에요." : "복직 준비 일정을 만들 수 없어요.", {
          render: renderPrepCard,
          live: true,
          page: m.simOn ? "sec-events" : null,
          extra: m.simOn ? [el("button", { type: "button", class: "msg-act", onclick: function () { explainPrepWithAi(); } }, [aiIcon(), "AI 설명 듣기"])] : []
        });
        break;
      case "calendar":
        addBot("앞으로 챙길 일정이에요. 금액이 바뀌거나 신청 마감인 달을 모았어요.", {
          render: renderCalendarCard,
          live: true,
          page: "sec-events",
          extra: [el("button", { type: "button", class: "msg-act", onclick: downloadICS }, ["달력 앱에 넣기 (.ics)"])]
        });
        break;
      default:
        askServerAi(rawText || "");
    }
  }

  /* ---------- 연결 ---------- */



  /* 월별 지급 내역 */
  $("mb-month").addEventListener("change", function (e) { ui.mbAge = Number(e.target.value); renderMonthBreakdown(ui.lastModel); });
  $("mb-prev").addEventListener("click", function () { ui.mbAge -= 1; renderMonthBreakdown(ui.lastModel); });
  $("mb-next").addEventListener("click", function () { ui.mbAge += 1; renderMonthBreakdown(ui.lastModel); });

  /* AI 비서 */
  $("nav-ai").addEventListener("click", function (e) { openChat(e.currentTarget); });
  $("chat-pill").addEventListener("click", function (e) { openChat(e.currentTarget); });
  $("chat-close").addEventListener("click", function () { closeChat(false); });
  $("chat-scrim").addEventListener("click", function () { closeChat(false); });
  $("chat-layer").addEventListener("keydown", trapFocus);
  $("chat-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const inp = $("chat-input");
    const v = inp.value;
    inp.value = "";
    askChat(v);
  });
  $("side-chat-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const inp = $("side-chat-input");
    const v = inp.value.trim();
    if (!v) { openChat(inp); return; }
    inp.value = "";
    openChat(inp);
    askChat(v);
  });
  chipButtons(CHIPS, "side-chip").forEach(function (b) { $("side-chips").appendChild(b); });
  chipButtons(CHIPS, "chat-chip").forEach(function (b) { $("chat-chips").appendChild(b); });

  $("prev").addEventListener("click", function () {
    if (state.step === 0) renderIntro();
    else goStep(state.step - 1, "prev", false);
  });
  $("edit").addEventListener("click", function () {
    goStep(0, "prev", true);
  });
  $("ics").addEventListener("click", downloadICS);
  slider.addEventListener("input", function () { renderResults(false); });
  baseSel.addEventListener("change", function () {
    state.baseAge = Number(baseSel.value);
    renderResults(false);
  });
  $("returnPick").addEventListener("change", function (e) {
    slider.value = e.target.value;
    renderResults(false);
  });
  TABS.forEach(function (t, i) {
    const tab = $("tab-" + t);
    tab.addEventListener("click", function () { showTab(t, false); });
    tab.addEventListener("keydown", function (e) {
      let n = null;
      if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
      else if (e.key === "ArrowLeft") n = (i + TABS.length - 1) % TABS.length;
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = TABS.length - 1;
      if (n == null) return;
      e.preventDefault();
      showTab(TABS[n], true);
    });
  });
  $("cal-view-grid").addEventListener("click", function () { ui.calView = "grid"; renderResults(false); });
  $("cal-view-list").addEventListener("click", function () { ui.calView = "list"; renderResults(false); });

  if (topStartBtn) {
    topStartBtn.addEventListener("click", function () {
      goStep(0, "next", true);
    });
  }
  if ($("nav-intro-link")) {
    $("nav-intro-link").addEventListener("click", function (e) {
      e.preventDefault();
      quickScrollTo(introTopBox);
    });
  }
  if ($("nav-back-top")) {
    $("nav-back-top").addEventListener("click", function (e) {
      e.preventDefault();
      quickScrollTo(introTopBox);
    });
  }
  if ($("nav-diag-link")) {
    $("nav-diag-link").addEventListener("click", function (e) {
      e.preventDefault();
      goStep(state.step || 0, "next", true);
    });
  }

  mountPersistentIntro();
  showView("intro");
  remember({ view: "intro", step: -1 });
})();
