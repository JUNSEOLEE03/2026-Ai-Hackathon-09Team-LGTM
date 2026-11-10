(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuLedger = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createSession() {
    return {
      documents: [],
      d1Files: [],
      d2: [],
      d3: [],
      receipts: [],
      guideConfirmed: {},
      guideStopped: false
    };
  }

  function addDocument(session, parsed, meta) {
    const existing = session.documents.find(function (doc) {
      return doc.hash === meta.hash && !doc.invalidated;
    });
    if (existing) {
      return {
        ok: false,
        code: "duplicate",
        message: "같은 파일(내용 해시)이 이미 있습니다. 새 항목을 만들지 않습니다.",
        existingId: existing.id
      };
    }
    const doc = Object.assign({}, parsed, {
      id: meta.id,
      fileName: meta.fileName,
      hash: meta.hash,
      confirmed: {},
      registered: false,
      invalidated: false
    });
    session.documents.push(doc);
    return { ok: true, doc: doc };
  }

  function confirmField(session, docId, fieldId, checked) {
    const doc = session.documents.find(function (item) { return item.id === docId; });
    if (!doc || doc.invalidated) return { ok: false };
    if (checked) doc.confirmed[fieldId] = true;
    else delete doc.confirmed[fieldId];
    return { ok: true, doc: doc };
  }

  function confirmedFields(doc) {
    return doc.fields.filter(function (field) { return doc.confirmed[field.id]; });
  }

  function sourceTypeOf(doc) {
    return doc.synthetic ? "합성 문서" : "사용자 업로드 파일";
  }

  function registerDocument(session, docId, programs) {
    const doc = session.documents.find(function (item) { return item.id === docId; });
    if (!doc) return { ok: false, message: "문서를 찾지 못했습니다." };
    if (doc.invalidated) return { ok: false, message: "근거가 무효화된 문서입니다." };
    const fields = confirmedFields(doc);
    if (!fields.length) return { ok: false, message: "확인한 항목이 없습니다. 초안은 등록되지 않습니다." };
    if (doc.hold) return { ok: false, message: doc.hold };
    if (doc.blockedReason || doc.docType === "unknown" || doc.docType === "unverified") {
      return { ok: false, message: doc.blockedReason || "확인 필요 / 근거 미확인" };
    }

    if (doc.docType === "notice") {
      const nameField = fields.find(function (field) { return field.key === "제도명"; });
      if (!nameField) return { ok: false, message: "제도명 문장을 원문에서 확인해야 연결할 수 있습니다." };
      const matches = (programs || []).filter(function (program) { return program.name === nameField.value; });
      if (matches.length !== 1) {
        return { ok: false, message: "알려진 가상 제도와 정확히 맞지 않아 자동으로 합치지 않습니다." };
      }
      const record = {
        id: "d1-" + doc.id,
        docId: doc.id,
        programId: matches[0].id,
        programName: matches[0].name,
        fields: fields,
        evidenceStatus: "사용자 확인",
        active: true,
        sourceType: sourceTypeOf(doc),
        verification: "사용자 확인",
        hash: doc.hash,
        fileName: doc.fileName,
        printedPage: doc.printedPage,
        pdfPage: doc.pdfPage,
        countsAsApplication: false,
        countsAsSelection: false
      };
      session.d1Files = session.d1Files.filter(function (item) { return item.docId !== doc.id; }).concat(record);
      doc.registered = true;
      return { ok: true, area: "D1", record: record };
    }

    if (doc.docType === "receipt") {
      const statusField = fields.find(function (field) { return field.key === "접수 상태 문장"; });
      if (!statusField || statusField.value.indexOf("접수가 완료") === -1) {
        return { ok: false, message: "접수 상태 문장을 원문에서 확인해야 등록할 수 있습니다." };
      }
      const nameField = fields.find(function (field) { return field.key === "제도명"; }) || doc.fields.find(function (field) { return field.key === "제도명"; });
      const dateField = fields.find(function (field) { return field.key === "신청일"; });
      const methodField = fields.find(function (field) { return field.key === "신청 방법"; });
      const record = {
        id: "d2-" + doc.id,
        docId: doc.id,
        programName: nameField ? nameField.value : "확인 필요",
        appliedOn: dateField ? dateField.value : null,
        method: methodField ? methodField.value : null,
        sentence: statusField.sentence,
        evidenceStatus: "사용자 확인",
        active: true,
        label: "신청함",
        sourceType: sourceTypeOf(doc),
        verification: "사용자 확인",
        hash: doc.hash,
        fileName: doc.fileName,
        printedPage: statusField.printedPage,
        pdfPage: statusField.pdfPage,
        countsAsSelection: false,
        countsAsReceipt: false
      };
      session.d2 = session.d2.filter(function (item) { return item.docId !== doc.id; }).concat(record);
      doc.registered = true;
      return { ok: true, area: "D2", record: record };
    }

    if (doc.docType === "selection") {
      const statusField = fields.find(function (field) { return field.key === "선정 상태 문장"; });
      if (!statusField || statusField.value.indexOf("선정되었습니다") === -1) {
        return { ok: false, message: "선정 상태 문장을 원문에서 확인해야 등록할 수 있습니다." };
      }
      const nameField = fields.find(function (field) { return field.key === "제도명"; }) || doc.fields.find(function (field) { return field.key === "제도명"; });
      const amountField = doc.fields.find(function (field) { return field.key === "지급 예정 금액"; });
      const unitField = doc.fields.find(function (field) { return field.key === "지급 예정 단위"; });
      const record = {
        id: "d3-" + doc.id,
        docId: doc.id,
        programName: nameField ? nameField.value : "확인 필요",
        sentence: statusField.sentence,
        plannedAmount: amountField ? Number(String(amountField.value).replace(/[^\d]/g, "")) : null,
        plannedUnit: unitField ? unitField.value : null,
        evidenceStatus: "사용자 확인",
        active: true,
        label: "선정됨 (입금 확인 아님)",
        sourceType: sourceTypeOf(doc),
        verification: "사용자 확인",
        hash: doc.hash,
        fileName: doc.fileName,
        printedPage: statusField.printedPage,
        pdfPage: statusField.pdfPage,
        countsAsReceipt: false
      };
      session.d3 = session.d3.filter(function (item) { return item.docId !== doc.id; }).concat(record);
      doc.registered = true;
      return { ok: true, area: "D3", record: record };
    }

    return { ok: false, message: "확인 필요 / 근거 미확인" };
  }

  function invalidateDocument(session, docId) {
    const doc = session.documents.find(function (item) { return item.id === docId; });
    if (!doc) return { ok: false };
    doc.invalidated = true;
    [session.d1Files, session.d2, session.d3].forEach(function (list) {
      list.forEach(function (item) {
        if (item.docId === docId) {
          item.active = false;
          item.evidenceStatus = "확인 필요 / 근거 무효";
          item.label = item.label ? "확인 필요 / 근거 무효" : item.label;
        }
      });
    });
    return { ok: true, receiptsKept: session.receipts.length };
  }

  function recomputeDuplicates(receipts) {
    receipts.forEach(function (item) { item.excludedDuplicate = false; });
    const groups = new Map();
    receipts.forEach(function (item) {
      if (item.status === "cancelled" || item.kind !== "현금" || item.adjustmentOf || item.amount == null) return;
      const key = item.programName + "|" + item.periodKey;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    groups.forEach(function (items) {
      if (items.length > 1) items.slice(1).forEach(function (item) { item.excludedDuplicate = true; });
    });
  }

  function addReceipt(session, draft) {
    const record = {
      id: draft.id,
      programName: draft.programName,
      kind: draft.kind,
      amount: draft.kind === "현금" && draft.amount !== "" && draft.amount != null ? Number(draft.amount) : null,
      date: draft.date,
      periodKey: draft.periodKey,
      status: "active",
      adjustmentOf: draft.adjustmentOf || null,
      source: "사용자 직접 기록",
      excludedDuplicate: false
    };
    if (record.kind === "현금" && draft.amount !== "" && draft.amount != null && Number.isNaN(record.amount)) {
      return { ok: false, message: "현금 금액은 숫자만 입력합니다. 비우면 금액 미입력입니다." };
    }
    session.receipts.push(record);
    recomputeDuplicates(session.receipts);
    return {
      ok: true,
      record: record,
      warning: record.excludedDuplicate ? "같은 제도의 같은 지급 회차입니다. 자동으로 합산하지 않습니다." : null
    };
  }

  function updateReceipt(session, id, patch) {
    const record = session.receipts.find(function (item) { return item.id === id; });
    if (!record) return { ok: false };
    if (patch.amount !== undefined) {
      record.amount = patch.amount === "" || patch.amount == null ? null : Number(patch.amount);
    }
    if (patch.date) record.date = patch.date;
    if (patch.periodKey) record.periodKey = patch.periodKey;
    if (patch.kind) record.kind = patch.kind;
    record.status = "active";
    recomputeDuplicates(session.receipts);
    return { ok: true, record: record };
  }

  function cancelReceipt(session, id) {
    const record = session.receipts.find(function (item) { return item.id === id; });
    if (!record) return { ok: false };
    record.status = "cancelled";
    recomputeDuplicates(session.receipts);
    return { ok: true };
  }

  function inPeriod(record, filter) {
    if (!filter || filter.mode === "all") return true;
    if (!record.date) return false;
    if (filter.mode === "year") return record.date.slice(0, 4) === filter.year;
    if (filter.mode === "month") return record.date.slice(0, 7) === filter.month;
    return true;
  }

  function cashSummary(receipts, filter) {
    let sum = 0;
    let missingAmount = 0;
    const included = [];
    const nonCash = [];
    const duplicates = [];
    receipts.forEach(function (item) {
      if (item.status === "cancelled") return;
      if (!inPeriod(item, filter)) return;
      if (item.kind !== "현금") {
        nonCash.push(item);
        return;
      }
      if (item.excludedDuplicate) {
        duplicates.push(item);
        return;
      }
      if (item.amount == null || Number.isNaN(item.amount)) {
        missingAmount += 1;
        return;
      }
      sum += item.amount;
      included.push(item);
    });
    return { sum: sum, included: included, nonCash: nonCash, duplicates: duplicates, missingAmount: missingAmount };
  }

  function prepStatus(docChecks, selfConfirmed) {
    const ready = docChecks.length > 0 && docChecks.every(Boolean) && !!selfConfirmed;
    return {
      ready: ready,
      message: "준비 완료는 이 서비스 안의 체크이며 실제 접수·수급은 기관 확인이 필요합니다."
    };
  }

  function guideProgress(confirmedCount, total, stopped) {
    return {
      done: !stopped && confirmedCount === total,
      changesDashboard: false,
      label: stopped ? "안내 중지" : confirmedCount === total ? "안내 진행 완료" : "진행 중"
    };
  }

  return {
    createSession: createSession,
    addDocument: addDocument,
    confirmField: confirmField,
    registerDocument: registerDocument,
    invalidateDocument: invalidateDocument,
    addReceipt: addReceipt,
    updateReceipt: updateReceipt,
    cancelReceipt: cancelReceipt,
    cashSummary: cashSummary,
    prepStatus: prepStatus,
    guideProgress: guideProgress
  };
});
