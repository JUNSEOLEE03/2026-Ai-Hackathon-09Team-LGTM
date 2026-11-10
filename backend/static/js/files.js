(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuFiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function mapType(raw) {
    if (raw === "공고문") return "notice";
    if (raw === "접수증" || raw === "접수 완료 안내") return "receipt";
    if (raw === "선정 통지서" || raw === "선정통지서") return "selection";
    if (raw === "안내문") return "unverified";
    return "unknown";
  }

  function parseWon(value) {
    const match = String(value || "").match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function parseDocument(text, meta) {
    const info = meta || {};
    const lines = String(text || "").split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    const fields = [];
    let docTypeRaw = "";
    let printedPage = null;
    let tableNo = null;
    const programNames = [];

    lines.forEach(function (line, index) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (!match) return;
      const key = match[1].trim();
      const value = match[2].trim();
      if (key === "인쇄 쪽번호") {
        printedPage = value;
        return;
      }
      if (key === "표 번호") {
        tableNo = value;
        return;
      }
      if (key === "문서 종류") docTypeRaw = value;
      if (key === "제도명") programNames.push(value);
      fields.push({
        id: key + ":" + index,
        key: key,
        label: key,
        value: value,
        sentence: line,
        pdfPage: info.pdfPage || 1,
        printedPage: null,
        tableNo: null,
        row: index + 1,
        col: 2
      });
    });

    fields.forEach(function (field) {
      field.printedPage = printedPage;
      field.tableNo = tableNo;
    });

    const docType = mapType(docTypeRaw);
    const applyField = fields.find(function (field) { return field.key === "접수 상태 문장"; });
    const selectField = fields.find(function (field) { return field.key === "선정 상태 문장"; });
    const hasApply = !!(applyField && applyField.value.indexOf("접수가 완료") !== -1);
    const hasSelect = !!(selectField && selectField.value.indexOf("선정되었습니다") !== -1);

    let statusClaim = "none";
    let blockedReason = null;
    if (docType === "receipt") {
      statusClaim = hasApply ? "applied" : "unverified";
      if (!hasApply) blockedReason = "확인 필요 / 근거 미확인";
    } else if (docType === "selection") {
      statusClaim = hasSelect ? "selected" : "unverified";
      if (!hasSelect) blockedReason = "확인 필요 / 근거 미확인";
    } else if (docType === "notice") {
      statusClaim = "none";
    } else {
      statusClaim = "unverified";
      blockedReason = "확인 필요 / 근거 미확인";
    }

    const plannedField = fields.find(function (field) { return field.key === "지급 예정 금액"; });
    return {
      docType: docType,
      docTypeRaw: docTypeRaw || "판정 불가",
      programNames: programNames,
      fields: fields,
      statusClaim: statusClaim,
      blockedReason: blockedReason,
      hold: programNames.length > 1 ? "여러 제도가 한 문서에 있어 자동으로 합치지 않습니다." : null,
      printedPage: printedPage,
      tableNo: tableNo,
      synthetic: String(text || "").indexOf("[합성 문서]") !== -1,
      plannedAmount: plannedField ? parseWon(plannedField.value) : null,
      pdfPage: info.pdfPage || 1
    };
  }

  return { parseDocument: parseDocument, mapType: mapType, parseWon: parseWon };
});
