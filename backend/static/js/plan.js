(function (root, factory) {
  const rules = typeof require !== "undefined" ? require("./rules.js") : root.WonjuRules;
  const api = factory(rules);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (rules) {
  const GROUPS = ["해당", "확인 필요", "비해당", "기간 종료"];

  const GROUP_OF_STATUS = {
    "조건 일치": "해당",
    "보류": "확인 필요",
    "확인 필요": "확인 필요",
    "조건 불일치": "비해당",
    "신청 기간 종료": "기간 종료"
  };

  function toGroup(status) {
    return GROUP_OF_STATUS[status] || "확인 필요";
  }

  function groupResults(results) {
    const out = {};
    GROUPS.forEach(function (g) { out[g] = []; });
    results.forEach(function (r) { out[toGroup(r.status)].push(r); });
    return out;
  }

  function addMonths(day, n) {
    const parts = day.split("-").map(Number);
    const total = parts[0] * 12 + (parts[1] - 1) + n;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    return y + "-" + String(m).padStart(2, "0") + "-01";
  }

  function capFor(caps, n) {
    const row = (caps || []).find(function (c) { return n >= c.fromMonth && n <= c.toMonth; });
    return row ? row.cap : null;
  }

  function rateFor(lp, n) {
    const row = (lp.rates || []).find(function (r) { return n >= r.fromMonth && n <= r.toMonth; });
    return row ? row.rate : lp.rate;
  }

  function leaveInfo(program, age, ctx) {
    const lp = program.timeline && program.timeline.leavePay;
    if (!lp) return null;
    const raw = ctx.raw || {};
    const wage = Number(raw.wage);
    if (!raw.wage || !Number.isFinite(wage) || wage <= 0) return { missingWage: true, amount: 0 };
    const start = raw.leaveStartAge == null ? 0 : Number(raw.leaveStartAge);
    const n = age - start + 1;
    const spouse = raw.spouseLeave === "yes";
    const maxMonths = spouse && lp.maxMonthsWithSpouse ? lp.maxMonthsWithSpouse : lp.maxMonths;
    if (n < 1 || n > maxMonths) return { leaveMonth: n, amount: 0 };
    let monthly;
    let special = false;
    const sp = lp.special;
    if (spouse && sp && age < sp.withinChildMonths && capFor(sp.caps, n) != null) {
      monthly = Math.min(Math.round(wage * sp.rate), capFor(sp.caps, n));
      special = true;
    } else {
      const cap = capFor(lp.caps, n);
      monthly = Math.round(wage * rateFor(lp, n));
      if (cap != null) monthly = Math.min(monthly, cap);
      if (lp.floor) monthly = Math.max(monthly, lp.floor);
    }
    const deferred = Math.round(monthly * (lp.deferredRatio || 0));
    return { leaveMonth: n, monthly: monthly, amount: monthly - deferred, deferred: deferred, special: special };
  }

  function amountAtAge(program, age, ctx) {
    if (program.timeline && program.timeline.leavePay) {
      const info = leaveInfo(program, age, ctx || {});
      return info ? info.amount : 0;
    }
    const byOrder = program.timeline && program.timeline.amountByOrder;
    if (byOrder) {
      const order = ctx && ctx.raw && ctx.raw.birthOrder;
      if (order === "first") return byOrder.first;
      if (order === "second") return byOrder.second != null ? byOrder.second : byOrder.secondPlus;
      if (order === "third_plus") return byOrder.thirdPlus != null ? byOrder.thirdPlus : byOrder.secondPlus;
      if (order === "second_plus") return byOrder.secondPlus != null ? byOrder.secondPlus : byOrder.second;
      return program.amount;
    }
    const table = program.timeline && program.timeline.amountByAge;
    if (!table) return program.amount;
    const row = table.find(function (r) { return age >= r.from && age < r.to; });
    return row ? row.amount : 0;
  }

  // 어린이집을 이용하면 지원금이 보육료 바우처로 먼저 나가고, 남는 차액만 현금으로 받는 제도.
  function splitFor(program, age, amount) {
    const bands = program.timeline.childcareVoucherByAge || [];
    const row = bands.find(function (r) { return age >= r.from && age < r.to; });
    const voucher = Math.min(amount, row ? row.voucher : 0);
    return { cash: amount - voucher, voucher: voucher };
  }

  function phaseOf(program) {
    if (program.timeline && program.timeline.phase) return program.timeline.phase;
    return program.rules && program.rules.requiresReturn ? "after_return" : "any";
  }

  function inPhase(program, age, returnAge) {
    const phase = phaseOf(program);
    if (phase === "before_return") return age < returnAge;
    if (phase === "after_return") return age >= returnAge;
    return true;
  }

  function kindOf(program, answers, raw) {
    if (program.amountPolicy === "wage") {
      const w = Number(raw && raw.wage);
      return raw && raw.wage && Number.isFinite(w) && w > 0 ? "cash" : "excluded";
    }
    if (program.amountPolicy !== "fixed") return "excluded";
    if (program.supportKind === "현금") {
      if (program.timeline && program.timeline.childcareVoucherByAge && answers.childcare === "yes") return "split";
      if (program.timeline && program.timeline.voucherWhenChildcare && answers.childcare === "yes") return "voucher";
      return "cash";
    }
    if (program.supportKind === "바우처") return "voucher";
    return "excluded";
  }

  function excludeReason(program, result) {
    if (program.excludeNote && toGroup(result.status) !== "확인 필요") return program.excludeNote;
    if (toGroup(result.status) === "확인 필요") {
      const why = (result.reasons || []).join(" ");
      return (why ? why + " " : "") + "그래서 합계에서 뺐습니다.";
    }
    if (program.amountPolicy === "wage") return "월 통상임금을 입력하지 않아 휴직 중 급여를 계산하지 않았습니다. 입력하면 합계에 들어갑니다.";
    if (program.amountPolicy === "unavailable") return "금액을 산출할 수 없어 합계에서 뺐습니다.";
    if (program.amountPolicy === "in_kind") return "현물 지원이라 원화로 합산하지 않습니다.";
    return "합계 기준에 맞지 않아 뺐습니다.";
  }

  // 같은 성격의 수당이 겹치면 지원액이 더 큰 쪽만 인정한다 (program.replacedBy = 다른 제도 id)
  function supersededBy(program, programs, rawAnswers, day, age, ctx) {
    if (!program.replacedBy) return null;
    const other = programs.find(function (x) { return x.id === program.replacedBy; });
    if (!other) return null;
    if (toGroup(rules.judgeProgram(other, rawAnswers, day).status) !== "해당") return null;
    const a = amountAtAge(other, age, ctx) || 0;
    const mine = amountAtAge(program, age, ctx) || 0;
    return a >= mine && a > 0 ? other : null;
  }

  function summarize(programs, rawAnswers, today, options) {
    const answers = rules.normalizeAnswers(rawAnswers);
    const returnAge = options && options.returnAge != null ? options.returnAge : Infinity;
    const out = { monthlyCash: 0, monthlyVoucher: 0, lumpSum: 0, included: [], excluded: [] };
    programs.forEach(function (program) {
      const result = rules.judgeProgram(program, rawAnswers, today);
      const group = toGroup(result.status);
      if (group === "비해당" || group === "기간 종료") return;
      if (group === "확인 필요") {
        out.excluded.push({ id: program.id, name: program.name, reason: excludeReason(program, result) });
        return;
      }
      const kind = kindOf(program, answers, rawAnswers);
      if (kind === "excluded") {
        out.excluded.push({ id: program.id, name: program.name, reason: excludeReason(program, result) });
        return;
      }
      const age = answers.childMonths == null ? 0 : answers.childMonths;
      if (program.payUnit !== "일시" && !inPhase(program, age, returnAge)) return;
      const sup = supersededBy(program, programs, rawAnswers, today, age, { raw: rawAnswers, returnAge: returnAge });
      if (sup) {
        out.excluded.push({ id: program.id, name: program.name, reason: sup.name + "와 함께 받을 수 있는지 자료가 엇갈려, 확실한 " + sup.name + "만 합계에 넣고 이 제도는 뺐습니다." });
        return;
      }
      const amount = amountAtAge(program, age, { raw: rawAnswers, returnAge: returnAge });
      if (!amount && program.payUnit !== "일시") return;
      if (kind === "split" && program.payUnit !== "일시") {
        const parts = splitFor(program, age, amount);
        out.monthlyCash += parts.cash;
        out.monthlyVoucher += parts.voucher;
        out.included.push({ id: program.id, name: program.name, kind: "split", amount: amount, cash: parts.cash, voucher: parts.voucher });
        return;
      }
      if (program.payUnit === "일시") out.lumpSum += amount;
      else if (kind === "voucher") out.monthlyVoucher += amount;
      else out.monthlyCash += amount;
      out.included.push({ id: program.id, name: program.name, kind: program.payUnit === "일시" ? "lump" : kind, amount: amount });
    });
    return out;
  }

  function monthlySchedule(programs, rawAnswers, options) {
    const opts = options || {};
    const base = rules.normalizeAnswers(rawAnswers);
    const today = opts.today;
    const startAge = base.childMonths == null ? 0 : base.childMonths;
    const horizon = opts.horizon || Math.max(1, 36 - startAge);
    const returnAge = opts.returnAge == null ? Infinity : opts.returnAge;
    const months = [];
    const lumps = [];
    const deferredById = {};
    let cashTotal = 0;
    let voucherTotal = 0;

    for (let i = 0; i < horizon; i += 1) {
      const age = startAge + i;
      const day = i === 0 && today ? today : addMonths(today || "2026-11-01", i);
      const answers = Object.assign({}, rawAnswers, {
        childMonths: age,
        returnToWork: returnAge === Infinity ? (rawAnswers.returnToWork || "no") : "yes"
      });
      const row = { offset: i, ageMonths: age, date: day, cash: 0, voucher: 0, items: [] };
      programs.forEach(function (program) {
        const result = rules.judgeProgram(program, answers, day);
        if (toGroup(result.status) !== "해당") return;
        if (!inPhase(program, age, returnAge)) return;
        if (supersededBy(program, programs, answers, day, age, { raw: rawAnswers, returnAge: returnAge })) return;
        const kind = kindOf(program, base, rawAnswers);
        if (kind === "excluded") return;
        const ctx = { raw: rawAnswers, returnAge: returnAge };
        if (program.payUnit === "일시") {
          if (i === 0) {
            const amount = amountAtAge(program, age, ctx);
            lumps.push({ id: program.id, name: program.name, amount: amount });
          }
          return;
        }
        const amount = amountAtAge(program, age, ctx);
        const info = leaveInfo(program, age, ctx);
        if (info && info.deferred) {
          const d = deferredById[program.id] || { id: program.id, name: program.name, amount: 0 };
          d.amount += info.deferred;
          deferredById[program.id] = d;
        }
        if (!amount) return;
        if (kind === "split") {
          const parts = splitFor(program, age, amount);
          row.cash += parts.cash;
          row.voucher += parts.voucher;
          row.items.push({ id: program.id, name: program.name, kind: "split", amount: amount, cash: parts.cash, voucher: parts.voucher });
          return;
        }
        if (kind === "voucher") row.voucher += amount;
        else row.cash += amount;
        row.items.push({ id: program.id, name: program.name, kind: kind, amount: amount });
      });
      months.push(row);
    }
    const deferredAfter = opts.deferredAfterMonths == null ? 6 : opts.deferredAfterMonths;
    Object.keys(deferredById).forEach(function (id) {
      const d = deferredById[id];
      const payAge = returnAge === Infinity ? null : returnAge + deferredAfter;
      const row = payAge == null ? null : months.find(function (m) { return m.ageMonths === payAge; });
      if (row) {
        row.cash += d.amount;
        row.items.push({ id: id, name: d.name + " 사후지급분", kind: "cash", amount: d.amount, deferred: true });
      }
      d.payAge = payAge;
      d.inHorizon = !!row;
    });
    months.forEach(function (row) {
      cashTotal += row.cash;
      voucherTotal += row.voucher;
    });
    const lumpTotal = lumps.reduce(function (s, l) { return s + l.amount; }, 0);
    return { returnAge: returnAge, horizon: horizon, months: months, lumps: lumps, deferred: Object.keys(deferredById).map(function (k) { return deferredById[k]; }), cashTotal: cashTotal, voucherTotal: voucherTotal, lumpTotal: lumpTotal };
  }

  function compareReturn(programs, rawAnswers, ageA, ageB, options) {
    const a = monthlySchedule(programs, rawAnswers, Object.assign({}, options, { returnAge: ageA }));
    const b = monthlySchedule(programs, rawAnswers, Object.assign({}, options, { returnAge: ageB }));
    return { a: a, b: b, cashDiff: b.cashTotal - a.cashTotal, voucherDiff: b.voucherTotal - a.voucherTotal };
  }

  const EVENT_ORDER = { deadline: 0, "return": 1, end: 2, change: 3, start: 4, tip: 5 };

  function events(programs, rawAnswers, options) {
    const opts = options || {};
    const today = opts.today || "2026-11-01";
    const base = rules.normalizeAnswers(rawAnswers);
    const startAge = base.childMonths == null ? 0 : base.childMonths;
    const returnAge = opts.returnAge == null ? Infinity : opts.returnAge;
    const sched = monthlySchedule(programs, rawAnswers, { today: today, returnAge: returnAge, horizon: opts.horizon });
    const list = [];

    function push(offset, type, program, title, detail) {
      list.push({
        offset: offset,
        ageMonths: startAge + offset,
        date: offset === 0 ? today : addMonths(today, offset),
        type: type,
        programId: program ? program.id : null,
        name: program ? program.name : null,
        title: title,
        detail: detail || "",
        urgent: (type === "deadline") && offset <= 2
      });
    }

    function byId(row) {
      const map = {};
      row.items.forEach(function (it) { if (!it.deferred) map[it.id] = it; });
      return map;
    }

    let prev = byId(sched.months[0]);
    for (let i = 1; i < sched.months.length; i += 1) {
      const cur = byId(sched.months[i]);
      Object.keys(prev).forEach(function (id) {
        const p = programs.find(function (x) { return x.id === id; });
        if (!cur[id]) push(i, "end", p, p.name + " 지급이 끝납니다", "마지막 지급은 아이 " + (startAge + i - 1) + "개월 무렵입니다.");
        else if (cur[id].amount !== prev[id].amount) push(i, "change", p, p.name + " 금액이 바뀝니다", "월 " + prev[id].amount.toLocaleString("ko-KR") + "원에서 " + cur[id].amount.toLocaleString("ko-KR") + "원으로");
      });
      Object.keys(cur).forEach(function (id) {
        const p = programs.find(function (x) { return x.id === id; });
        if (!prev[id]) push(i, "start", p, p.name + " 지급이 시작됩니다", "월 " + cur[id].amount.toLocaleString("ko-KR") + "원. 미리 신청해 두어야 받습니다.");
      });
      sched.months[i].items.forEach(function (it) {
        if (it.deferred) {
          const p = programs.find(function (x) { return x.id === it.id; });
          push(i, "start", p, it.name + "이 들어옵니다", "복직 후 계속 일한 경우에 지급됩니다. 금액 " + it.amount.toLocaleString("ko-KR") + "원.");
        }
      });
      prev = cur;
    }

    if (returnAge !== Infinity && returnAge > startAge && returnAge - startAge < sched.months.length) {
      push(returnAge - startAge, "return", null, "복직 예정", "복직하면 휴직 중 급여가 끝나고, 복직 후 받는 지원이 시작될 수 있습니다.");
    }

    programs.forEach(function (program) {
      const result = rules.judgeProgram(program, rawAnswers, today);
      if (toGroup(result.status) !== "해당") return;
      if (program.payUnit === "일시" && program.rules && program.rules.maxMonthsExclusive != null) {
        const last = program.rules.maxMonthsExclusive - 1;
        if (last >= startAge) push(last - startAge, "deadline", program, program.name + (program.lumpDeadlineText ? " 사용기한 주의" : " 신청 마감"), program.lumpDeadlineText || ("아이 " + program.rules.maxMonthsExclusive + "개월이 되기 전에 신청해야 합니다."));
      }
      (program.deadlines || []).forEach(function (d) {
        if (startAge < d.beforeAgeMonths) push(Math.max(0, d.beforeAgeMonths - 1 - startAge), "deadline", program, d.title || program.name + " 신청 기한", d.text);
      });
      if (program.timeline && (program.timeline.voucherWhenChildcare || program.timeline.childcareVoucherByAge)) {
        if (base.childcare === "yes") push(0, "tip", program, program.name + "은 지금 바우처로 받습니다", "어린이집을 이용하는 동안은 현금 대신 보육료 바우처로 지급됩니다.");
        else push(0, "tip", program, "어린이집을 보내기 시작하면 " + program.name + "이 바우처로 바뀝니다", "보내기 시작하는 달에 현금이 줄어드는 것처럼 보일 수 있습니다.");
      }
    });

    list.sort(function (a, b) { return a.offset - b.offset || EVENT_ORDER[a.type] - EVENT_ORDER[b.type]; });
    const merged = [];
    list.forEach(function (e) {
      const prevChange = e.type === "change" && merged.slice().reverse().find(function (m) { return m.type === "change" && m.programId === e.programId; });
      if (prevChange && prevChange.lastOffset === e.offset - 1) {
        prevChange.lastOffset = e.offset;
        prevChange.title = e.name + " 금액이 몇 달에 걸쳐 바뀝니다";
        prevChange.detail = prevChange.detail.replace(/원으로$/, "원") + " → " + e.detail.replace(/^월 [0-9,]+원에서 /, "");
        return;
      }
      if (e.type === "change") e.lastOffset = e.offset;
      merged.push(e);
    });
    return merged;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function icsEscape(t) {
    return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  function utf8Length(ch) {
    const c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  function foldLine(line) {
    const out = [];
    let cur = "";
    let bytes = 0;
    Array.from(line).forEach(function (ch) {
      const n = utf8Length(ch);
      const limit = out.length ? 74 : 75;
      if (bytes + n > limit) {
        out.push(cur);
        cur = "";
        bytes = 0;
      }
      cur += ch;
      bytes += n;
    });
    out.push(cur);
    return out.join("\r\n ");
  }

  function toICS(list, options) {
    const opts = options || {};
    const stamp = (opts.stamp || "2026-11-08").replace(/-/g, "") + "T000000Z";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//wonju-benefit-assistant//KO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsEscape(opts.calendarName || "육아 혜택 챙길 일")
    ];
    list.forEach(function (ev, idx) {
      const d = ev.date.replace(/-/g, "");
      const parts = ev.date.split("-").map(Number);
      const nextDay = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
      const end = nextDay.getUTCFullYear() + pad(nextDay.getUTCMonth() + 1) + pad(nextDay.getUTCDate());
      lines.push(
        "BEGIN:VEVENT",
        "UID:" + d + "-" + idx + "-" + (ev.programId || "x") + "@wonju-benefit",
        "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + d,
        "DTEND;VALUE=DATE:" + end,
        "SUMMARY:" + icsEscape(ev.title),
        "DESCRIPTION:" + icsEscape(ev.detail + (opts.footer ? " " + opts.footer : ""))
      );
      if (ev.type === "deadline") {
        lines.push("BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(ev.title + " 일주일 전"), "END:VALARM");
      }
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }

  function applyOrder(eligibleIds, programs, eventList, childMonths) {
    const used = {};
    const groups = [];
    const progOf = function (id) { return programs.find(function (p) { return p.id === id; }); };
    function take(title, note, ids) {
      const items = ids.filter(function (id) { return !used[id]; });
      if (!items.length) return;
      items.forEach(function (id) { used[id] = true; });
      groups.push({ title: title, note: note, ids: items });
    }
    const urgent = eventList.filter(function (e) { return e.urgent && e.programId && eligibleIds.indexOf(e.programId) >= 0; })
      .map(function (e) { return e.programId; });
    take("마감이 가까운 것부터", "두 달 안에 신청 기한이 끝납니다. 가장 먼저 신청하세요.", urgent.filter(function (v, i, a) { return a.indexOf(v) === i; }));
    const bundles = {};
    eligibleIds.forEach(function (id) {
      const p = progOf(id);
      const b = p && p.apply && p.apply.bundle;
      const until = p && p.apply && p.apply.bundleUntilAgeMonths;
      if (b && (until == null || childMonths == null || childMonths < until)) (bundles[b] = bundles[b] || []).push(id);
    });
    Object.keys(bundles).forEach(function (b) {
      const first = progOf(bundles[b][0]);
      take("한 번에 신청: " + b, first.apply.bundleNote || "", bundles[b]);
    });
    take("온라인으로 따로 신청", "기관 누리집에서 본인 인증 후 신청합니다.", eligibleIds.filter(function (id) {
      const p = progOf(id);
      return p && p.apply && p.apply.channel !== "방문 필수";
    }));
    take("직접 방문해야 하는 것", "평일 운영 시간에 방문해야 합니다. 서류를 미리 챙기세요.", eligibleIds.slice());
    return groups;
  }

  function upcoming(eligibleIds, eventList) {
    const seen = {};
    return eventList.filter(function (e) {
      if (e.type !== "start" || !e.programId || eligibleIds.indexOf(e.programId) >= 0 || seen[e.programId]) return false;
      if (/사후지급/.test(e.title)) return false;
      seen[e.programId] = true;
      return true;
    });
  }

  const REQUIRED_FIELDS = ["id", "name", "agency", "supportKind", "payUnit", "amountPolicy", "sourceType", "verification", "confirmedOn", "rules", "evidence"];

  function validateCatalog(programs) {
    const problems = [];
    const ids = {};
    programs.forEach(function (p, idx) {
      const label = (p && p.id) || "#" + idx;
      REQUIRED_FIELDS.forEach(function (f) {
        if (p[f] == null || p[f] === "") problems.push(label + ": " + f + " 없음");
      });
      if (ids[p.id]) problems.push(label + ": id 중복");
      ids[p.id] = true;
      if (p.amountPolicy === "wage" && !(p.timeline && p.timeline.leavePay && (p.timeline.leavePay.rate || p.timeline.leavePay.rates))) {
        problems.push(label + ": 임금 기반인데 leavePay 규칙이 없음");
      }
      if (p.amountPolicy === "fixed" && p.amount == null && !(p.timeline && (p.timeline.amountByAge || p.timeline.amountByOrder))) {
        problems.push(label + ": 정액인데 금액이 없음");
      }
      if (p.sourceType !== "가상" && p.apply && p.apply.url && !/^https:\/\//.test(p.apply.url)) {
        problems.push(label + ": 신청 주소는 https로 시작해야 함");
      }
      if (!p.apply || !p.apply.channel) problems.push(label + ": 신청 방법(apply.channel) 없음");
      if (p.sourceType !== "가상") {
        const hasUrl = (p.evidence || []).some(function (e) { return /^https:\/\//.test(e.location || ""); });
        if (!hasUrl) problems.push(label + ": 공식 근거 URL 없음");
      }
      const table = p.timeline && p.timeline.amountByAge;
      if (table) {
        table.forEach(function (r) {
          if (!(r.from < r.to)) problems.push(label + ": 개월 구간 " + r.from + "~" + r.to + " 오류");
        });
      }
    });
    return problems;
  }

  return {
    GROUPS: GROUPS,
    toGroup: toGroup,
    groupResults: groupResults,
    summarize: summarize,
    monthlySchedule: monthlySchedule,
    compareReturn: compareReturn,
    validateCatalog: validateCatalog,
    addMonths: addMonths,
    leaveInfo: leaveInfo,
    events: events,
    toICS: toICS,
    applyOrder: applyOrder,
    upcoming: upcoming
  };
});
