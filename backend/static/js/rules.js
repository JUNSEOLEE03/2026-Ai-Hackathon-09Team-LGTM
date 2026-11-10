(function (root, factory) {
  const data = typeof require !== "undefined" ? require("./data.js") : root.WonjuData;
  const api = factory(data);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (data) {
  const EXPECTED_SUM_ALLOWED = false;

  function formatWon(amount) {
    return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatAmount(program) {
    if (program.amountPolicy === "unavailable") return "산출 불가";
    if (program.amountPolicy === "in_kind") return program.inKindLabel + " · 원화로 환산하지 않음";
    return program.supportKind + " · " + program.payUnit + " · " + program.amountKind + " · " + formatWon(program.amount) + "원";
  }

  function normalizeAnswers(raw) {
    const src = raw || {};
    let months = src.childMonths;
    if (months === "" || months == null) months = null;
    else {
      months = Number(months);
      if (!Number.isInteger(months)) months = null;
    }
    return {
      livesInWonju: src.livesInWonju == null || src.livesInWonju === "" ? null : src.livesInWonju,
      childMonths: months,
      returnToWork: src.returnToWork || null,
      returnTiming: src.returnTiming || null,
      singleChild: src.singleChild || null,
      childcare: src.childcare || null,
      gangwon1y: src.gangwon1y || null,
      birthOrder: src.birthOrder || null
    };
  }

  function topic(program, name) {
    return (program.evidence || []).find(function (item) { return item.topic === name; }) || null;
  }

  function judgeProgram(program, rawAnswers, today) {
    const answers = normalizeAnswers(rawAnswers);
    const day = today || data.TODAY;
    const rules = program.rules;
    const failed = [];
    const missing = [];

    if (program.periodEndVerified && program.periodEnd && program.periodEnd < day) {
      const period = topic(program, "기간");
      return base(program, "신청 기간 종료", {
        reasons: ["신청 종료일 " + program.periodEnd + "이 기준일 " + day + "보다 앞에 있고, 종료일이 확정되어 있습니다."],
        evidenceRefs: period ? [period] : []
      });
    }

    if (rules.requiresWonju && answers.livesInWonju === "no") {
      const ref = topic(program, "거주");
      failed.push({ label: "거주", detail: "원주 거주가 아닙니다.", location: ref && ref.location, text: ref && ref.text });
    }
    if (rules.minMonths != null && answers.childMonths != null) {
      if (answers.childMonths < rules.minMonths || answers.childMonths >= rules.maxMonthsExclusive) {
        const ref = topic(program, "연령");
        failed.push({
          label: "연령",
          detail: "입력 " + answers.childMonths + "개월은 " + rules.minMonths + "개월 이상 " + rules.maxMonthsExclusive + "개월 미만이 아닙니다.",
          location: ref && ref.location,
          text: ref && ref.text
        });
      }
    }
    if (rules.requiresReturn && answers.returnToWork && answers.returnToWork !== "yes") {
      const ref = topic(program, "복직");
      failed.push({ label: "복직", detail: "복직 예정이 아닙니다.", location: ref && ref.location, text: ref && ref.text });
    }
    if (rules.requiresChildcare && answers.childcare === "no") {
      const ref = topic(program, "보육");
      failed.push({ label: "보육 시설", detail: "보육 시설을 이용하지 않는 것으로 답했습니다.", location: ref && ref.location, text: ref && ref.text });
    }
    if (rules.forbidsChildcare && answers.childcare === "yes") {
      const ref = topic(program, "보육");
      failed.push({ label: "보육 시설", detail: "어린이집 등 보육 시설을 이용 중이면 받을 수 없는 제도입니다.", location: ref && ref.location, text: ref && ref.text });
    }
    if (rules.requiresGangwon1y && answers.gangwon1y === "no") {
      const ref = topic(program, "거주");
      failed.push({ label: "거주", detail: "부 또는 모가 강원도에 1년 이상 거주하지 않았습니다.", location: ref && ref.location, text: ref && ref.text });
    }
    if (failed.length) {
      return base(program, "조건 불일치", {
        reasons: failed.map(function (item) { return item.detail; }),
        failed: failed
      });
    }

    if (rules.requiresWonju && answers.livesInWonju == null) missing.push("원주 거주 여부");
    if (rules.minMonths != null && answers.childMonths == null) missing.push("자녀 개월 수");
    if (rules.requiresReturn && !answers.returnToWork) missing.push("복직 예정 여부");
    if ((rules.requiresChildcare || rules.forbidsChildcare) && answers.childcare == null) missing.push("보육 시설 이용 여부");
    if (rules.requiresGangwon1y && answers.gangwon1y == null) missing.push("강원도 1년 이상 거주 여부");
    if (rules.requiresBirthOrder && answers.birthOrder == null) missing.push("출생 순서(첫째/둘째/셋째 이상)");
    if (missing.length) {
      return base(program, "보류", {
        missing: missing,
        reasons: missing.map(function (item) { return item + "이 아직 없습니다. 탈락이 아니라, 답을 보완하면 다시 판정합니다."; })
      });
    }

    const checks = [];
    const checkRefs = [];
    if (!program.periodEndVerified) {
      checks.push("신청 종료일을 검증할 수 없어 신청 기간 종료로 보지 않습니다.");
      const ref = topic(program, "기간");
      if (ref) checkRefs.push(ref);
    }
    if (program.overlapUnverified) {
      checks.push("다른 제도와 중복 가능 여부가 확인되지 않았습니다.");
      const ref = topic(program, "중복");
      if (ref) checkRefs.push(ref);
    }
    if (program.needsCheck) {
      checks.push(program.needsCheck);
    }
    if (program.lateCheck && answers.childMonths != null && answers.childMonths >= program.lateCheck.fromMonths) {
      checks.push(program.lateCheck.text);
    }
    if (checks.length) {
      return base(program, "확인 필요", { reasons: checks, evidenceRefs: checkRefs });
    }

    return base(program, "조건 일치", {
      reasons: [program.sourceType === "가상" ? "근거가 있는 가상 규칙은 모두 맞습니다. 수급 확정이 아니며 기관 확인이 필요합니다." : "입력한 상황이 공식 자료의 조건과 맞습니다. 수급 확정이 아니며 기관 확인이 필요합니다."]
    });
  }

  function base(program, status, extra) {
    const d1Label = status === "조건 일치" ? "확인한 조건상 신청 후보 (기관 확인 필요)" : "조건부 후보";
    return Object.assign({
      programId: program.id,
      name: program.name,
      status: status,
      d1Label: d1Label,
      reasons: [],
      missing: [],
      failed: [],
      evidenceRefs: [],
      amountLine: formatAmount(program),
      supportKind: program.supportKind,
      payUnit: program.payUnit,
      amount: program.amount,
      amountPolicy: program.amountPolicy,
      sourceType: program.sourceType,
      verification: program.verification,
      confirmedOn: program.confirmedOn,
      evidence: program.evidence,
      documents: program.documents,
      confirmNote: program.confirmNote || null,
      method: program.method,
      office: program.office,
      virtualPath: program.virtualPath,
      periodStart: program.periodStart,
      periodEnd: program.periodEnd,
      periodEndVerified: program.periodEndVerified
    }, extra || {});
  }

  function judgeAll(rawAnswers, today) {
    return data.PROGRAMS.map(function (program) {
      return judgeProgram(program, rawAnswers, today);
    });
  }

  function amountLines(results) {
    return results.map(function (item) {
      return item.name + ": " + item.amountLine;
    });
  }

  return {
    EXPECTED_SUM_ALLOWED: EXPECTED_SUM_ALLOWED,
    formatAmount: formatAmount,
    normalizeAnswers: normalizeAnswers,
    judgeProgram: judgeProgram,
    judgeAll: judgeAll,
    amountLines: amountLines
  };
});
