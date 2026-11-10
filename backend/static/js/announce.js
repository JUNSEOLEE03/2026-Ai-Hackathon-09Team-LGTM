(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WonjuAnnounce = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SECTION_NAMES = [
    { id: "title", names: ["공고명", "공고 제목", "제목"] },
    { id: "target", names: ["지원대상", "지원 대상", "신청대상", "신청 대상", "신청자격", "신청 자격", "모집대상", "모집 대상"] },
    { id: "benefit", names: ["지원내용", "지원 내용", "지원금액", "지원 금액", "사업내용", "사업 내용"] },
    { id: "period", names: ["신청기간", "신청 기간", "접수기간", "접수 기간", "모집기간", "모집 기간"] },
    { id: "docs", names: ["제출서류", "제출 서류", "구비서류", "구비 서류", "필요서류", "필요 서류", "신청서류", "신청 서류"] },
    { id: "method", names: ["신청방법", "신청 방법", "접수방법", "접수 방법", "신청절차", "신청 절차", "처리절차", "방문신청", "온라인신청"] },
    { id: "office", names: ["문의처", "접수처", "담당부서", "담당 기관", "접수 안내", "문의"] }
  ];

  const EXTRA_KEYS = [
    { id: "title", keys: ["제도명", "공고명", "사업명"] },
    { id: "target", keys: ["연령 조건", "거주 조건", "복직 조건", "소득 조건", "보육 조건", "대상 지역"] },
    { id: "benefit", keys: ["지원 형태", "지급 단위", "금액 구분", "항목 금액"] },
    { id: "period", keys: ["신청 시작일", "신청 종료일", "종료일 검증"] },
    { id: "docs", keys: ["필요 서류"] },
    { id: "method", keys: ["접수 방법"] },
    { id: "office", keys: ["담당 기관", "접수 안내"] }
  ];

  const LABELS = {
    title: "이름",
    target: "지원 대상",
    benefit: "지원 내용",
    period: "신청 기간",
    docs: "필요 서류",
    method: "신청 방법",
    office: "접수·문의",
    pay: "지급",
    exclude: "지원 제외"
  };

  const SELF_SERVE = [
    { label: "주민등록번호", re: /주민등록번호|주민번호/ },
    { label: "계좌", re: /계좌/ },
    { label: "비밀번호", re: /비밀번호/ },
    { label: "인증번호", re: /인증번호|OTP|일회용 번호/ },
    { label: "상세 주소", re: /상세\s*주소|주소\s*전체/ }
  ];

  function sliceMainHtml(html) {
    const source = String(html || "");
    const match = source.match(/<div\b[^>]*\bid=["']contents["'][^>]*>/i) || source.match(/<div\b[^>]*\bid=["']content["'][^>]*>/i);
    if (!match) return source;
    let index = match.index + match[0].length;
    let depth = 1;
    const lower = source.toLowerCase();
    while (index < source.length && depth > 0) {
      const nextOpen = lower.indexOf("<div", index);
      const nextClose = lower.indexOf("</div", index);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        index = nextOpen + 4;
      } else {
        depth -= 1;
        index = nextClose + 5;
      }
    }
    return source.slice(match.index, index);
  }

  function textFromHtml(html) {
    const source = sliceMainHtml(String(html || "").replace(/<!--[\s\S]*?-->/g, " "));
    const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? cleanInline(titleMatch[1]) : "";
    const withoutHidden = source
      .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, " ")
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<(p|div|h[1-6]|li|tr|section|article|table)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|table)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ");
    const text = cleanInline(withoutHidden.replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { title: title, text: text };
  }

  function cleanInline(value) {
    return String(value || "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function headingNames() {
    const names = [];
    SECTION_NAMES.forEach(function (section) {
      section.names.forEach(function (name) {
        names.push({ id: section.id, name: name });
      });
    });
    names.sort(function (a, b) { return b.name.length - a.name.length; });
    return names;
  }

  function compactName(value) {
    return String(value || "").replace(/\s+/g, "");
  }

  function headingFromName(name, inline) {
    const compact = compactName(name);
    const found = SECTION_NAMES.find(function (section) {
      return section.names.some(function (label) {
        return label === name || compactName(label) === compact;
      });
    });
    if (!found) return null;
    return { id: found.id, inline: cleanInline(inline || "") };
  }

  function headingOf(line) {
    const cleaned = line
      .replace(/^[●○□■•▪◦\-\s]+/, "")
      .replace(/^[①-⑩]\s*/, "")
      .replace(/^\d+\s*[.)]\s*/, "")
      .replace(/^[가-하]\s*[.)]\s*/, "")
      .replace(/[【\[]/g, "")
      .replace(/[】\]]/g, "")
      .trim();
    const parts = cleaned.split(/[:：]/);
    const name = parts[0].trim();
    if (name && name.length <= 24) {
      const exact = headingFromName(name, parts.slice(1).join(":"));
      if (exact) return { before: "", heading: exact };
    }
    const names = headingNames();
    for (let i = 0; i < names.length; i += 1) {
      const candidate = names[i];
      const at = cleaned.lastIndexOf(candidate.name);
      if (at === -1) continue;
      const after = cleaned.slice(at + candidate.name.length).trim();
      const before = cleaned.slice(0, at).trim();
      const beforeOk = at === 0 || /[\s>·\-/]$/.test(cleaned.slice(0, at));
      const afterOk = after === "" || /^[:：]/.test(after);
      if (!beforeOk || !afterOk) continue;
      return {
        before: before,
        heading: { id: candidate.id, inline: cleanInline(after.replace(/^[:：]\s*/, "")) }
      };
    }
    const compactLine = compactName(cleaned);
    if (compactLine.indexOf("신청방법") === 0 && compactLine.length <= 12) {
      return { before: "", heading: { id: "method", inline: "" } };
    }
    if (compactLine.indexOf("지원제외대상") === 0 || compactLine.indexOf("제외대상") === 0) {
      return { before: "", heading: { id: "exclude", inline: "" } };
    }
    if (compactLine.indexOf("지급방법") === 0 || compactLine.indexOf("지급시기") === 0) {
      return { before: "", heading: { id: "pay", inline: cleanInline(cleaned.split(/[:：]/).slice(1).join(":")) } };
    }
    if (compactLine.indexOf("모집장소및기간") !== -1 && cleaned.length <= 80) {
      return { before: "", heading: { id: "period", inline: "" } };
    }
    if (compactLine === "신청서접수") {
      return { before: "", heading: { id: "method", inline: "" } };
    }
    return null;
  }

  function extraOf(line) {
    const match = line.match(/^([^:：]{2,20})\s*[:：]\s*(.+)$/);
    if (!match) return null;
    const key = match[1].trim();
    const found = EXTRA_KEYS.find(function (item) {
      return item.keys.indexOf(key) !== -1;
    });
    if (!found) return null;
    return { id: found.id, text: key + ": " + match[2].trim() };
  }

  function joinBucket(lines) {
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function clip(text, max) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length <= max) return value;
    return value.slice(0, max - 1) + "…";
  }

  function sentenceWith(text, re) {
    const parts = String(text || "").split(/\n+|(?<=다\.)\s+|(?<=요\.)\s+/);
    const found = parts.find(function (part) { return re.test(part); });
    return (found || parts[0] || "").trim();
  }

  function cutPageChrome(text) {
    const markers = [
      "콘텐츠 만족도",
      "만족도 조사",
      "이 페이지에서 제공하는 정보",
      "배너모음",
      "배너 모음",
      "관련 사이트",
      "사이트맵",
      "개인정보처리방침"
    ];
    let cut = text.length;
    markers.forEach(function (marker) {
      const at = text.indexOf(marker);
      if (at !== -1 && at < cut) cut = at;
    });
    return text.slice(0, cut);
  }

  function looksLikeDocument(name) {
    const compact = name.replace(/\s+/g, "");
    if (/만족도|매우만족|매우불만족|^만족$|^보통$|^불만족$/.test(compact)) return false;
    if (/배너|담당자|담당부서|전화번호|최종수정|정보망|자비스|소비자24|혁신센터|안전포털|주민e직접|소통24|정치후원금|신고센터|스팸대응/.test(compact)) return false;
    if (/주민등록번호|주민번호|계좌번호|비밀번호|인증번호|값을 받지/.test(name)) return false;
    return /신청서|동의서|확인서|증명서|등본|초본|사본|명부|영수증|통장사본|진단서|등록증|계약서|재직|가족관계|신분증|사진|서식|구비|서류|1부/.test(name);
  }

  function splitItems(text) {
    const raw = String(text || "").split(/\n|\||·|;(?=\s*)/);
    const items = [];
    raw.forEach(function (piece) {
      piece.split(/,(?=\s*[^0-9])/).forEach(function (part) {
        const name = part.replace(/^[-•\d.)\s]+/, "").trim();
        if (name.length < 2 || name.length > 140) return;
        if (!looksLikeDocument(name)) return;
        items.push(name);
      });
    });
    return items.filter(function (item, index) {
      return items.indexOf(item) === index;
    });
  }

  function splitSteps(text) {
    const lines = String(text || "").split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    const numbered = lines.map(function (line) {
      const match = line.match(/^(?:\d+\s*[.)]|[①-⑩])\s*(.+)$/);
      return match ? match[1].trim() : "";
    }).filter(function (line) {
      return line.length >= 8 && !/^[\d.\s]+$/.test(line);
    });
    if (numbered.length >= 2) return numbered;
    const sentences = String(text || "").replace(/\n+/g, " ").split(/(?<=다\.)\s+|(?<=요\.)\s+/).map(function (part) {
      return part.trim();
    }).filter(function (part) { return part.length > 6; });
    if (sentences.length >= 2) return sentences;
    const whole = String(text || "").trim();
    return whole ? [whole] : [];
  }

  function classifyStep(text) {
    return {
      text: text,
      login: /로그인|비밀번호|인증번호|본인\s*인증/.test(text),
      attach: /첨부|서류/.test(text),
      submit: /제출|접수/.test(text),
      input: /입력|기재|기입/.test(text)
    };
  }

  function parseDates(text) {
    const found = [];
    const re = /(\d{4})\s*[.\-년/]\s*(\d{1,2})\s*[.\-월/]\s*(\d{1,2})/g;
    let match = re.exec(text);
    while (match) {
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        found.push({
          iso: match[1] + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"),
          index: match.index,
          raw: match[0]
        });
      }
      match = re.exec(text);
    }
    return found;
  }

  function withoutClockRanges(text) {
    return String(text || "").replace(/\d{1,2}:\d{2}\s*[~～]\s*\d{1,2}:\d{2}/g, function (match) {
      return " ".repeat(match.length);
    });
  }

  function endDate(text) {
    const source = withoutClockRanges(text);
    const dates = parseDates(source);
    const tildes = source.match(/[~～]/g) || [];
    if (tildes.length > 1 && source.indexOf("까지") === -1) return null;
    if (tildes.length === 1) {
      const tilde = Math.max(source.lastIndexOf("~"), source.lastIndexOf("～"));
      const after = dates.filter(function (item) { return item.index > tilde; });
      if (after.length) return after[after.length - 1];
      const tail = source.slice(tilde + 1);
      const md = tail.match(/(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
      const yearSource = dates.filter(function (item) { return item.index < tilde; }).pop();
      if (md && yearSource) {
        const month = Number(md[1]);
        const day = Number(md[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return {
            iso: yearSource.iso.slice(0, 4) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"),
            index: tilde,
            raw: md[0]
          };
        }
      }
      return null;
    }
    if (!dates.length) return null;
    const until = source.lastIndexOf("까지");
    if (until !== -1) {
      const before = dates.filter(function (item) { return item.index <= until; });
      if (before.length) return before[before.length - 1];
    }
    return dates[dates.length - 1];
  }

  function parseAgeRange(text) {
    const source = String(text || "");
    const range = source.match(/(\d+)\s*개월\s*이상\s*(\d+)\s*개월\s*미만/);
    if (range) {
      return { min: Number(range[1]), maxExclusive: Number(range[2]), quote: range[0] };
    }
    const span = source.match(/(\d+)\s*[~～]\s*(\d+)\s*개월/);
    if (span) {
      return { min: Number(span[1]), maxExclusive: Number(span[2]) + 1, quote: span[0] };
    }
    const underOnly = source.match(/(\d+)\s*개월\s*미만/);
    if (underOnly) {
      return { min: 0, maxExclusive: Number(underOnly[1]), quote: underOnly[0] };
    }
    const underYears = source.match(/만\s*(\d+)\s*세\s*미만/);
    if (underYears) {
      return { min: 0, maxExclusive: Number(underYears[1]) * 12, quote: underYears[0] };
    }
    const underMonths = source.match(/(\d+)\s*개월\s*(?:이하|까지)/);
    if (underMonths) {
      return { min: 0, maxExclusive: Number(underMonths[1]) + 1, quote: underMonths[0] };
    }
    return null;
  }

  function buildQuestions(targetText) {
    const questions = [];
    const childAge = /(\d+)\s*[~～]\s*(\d+)\s*개월/.test(targetText)
      || /(\d+)\s*개월\s*이상\s*(\d+)\s*개월\s*미만/.test(targetText)
      || /(\d+)\s*개월\s*미만/.test(targetText)
      || /만\s*\d+\s*세\s*미만/.test(targetText)
      || (/(자녀|아동|영아|유아|영유아)/.test(targetText) && /개월|세/.test(targetText));
    if (childAge) {
      questions.push({
        id: "childMonths",
        kind: "months",
        prompt: "문서에 자녀 나이 조건이 있습니다. 자녀는 몇 개월인가요?",
        help: "생년월일 대신 개월 수만 받습니다.",
        quote: sentenceWith(targetText, /개월|세|영아|유아|나이/)
      });
    }
    if (/거주|원주시|관내|주소지/.test(targetText)) {
      questions.push(choiceQuestion(
        "residence",
        "문서에 거주 조건이 있습니다. 그 지역에 살고 있나요?",
        "상세 주소는 받지 않습니다.",
        sentenceWith(targetText, /거주|원주시|관내|주소지/)
      ));
    }
    if (/복직|육아휴직|맞벌이|휴직/.test(targetText)) {
      questions.push(choiceQuestion(
        "work",
        "문서에 복직·휴직·맞벌이 조건이 있습니다. 그 조건에 해당하나요?",
        "해당 여부는 본인 답변이며, 재직 증빙을 확인한 것은 아닙니다.",
        sentenceWith(targetText, /복직|육아\s*휴직|맞벌이|휴직/)
      ));
    }
    if (/소득|중위/.test(targetText) && !/소득(?:수준)?[^\n]{0,8}무관/.test(targetText)) {
      questions.push(choiceQuestion(
        "income",
        "문서에 소득 조건이 있습니다. 그 조건에 해당하나요?",
        "소득 금액과 증빙은 받지 않습니다. 모르겠으면 아직 모름을 고르세요.",
        sentenceWith(targetText, /소득|중위/)
      ));
    }
    if (/어린이집|보육\s*시설|아이돌봄/.test(targetText)) {
      questions.push(choiceQuestion(
        "childcare",
        "문서에 보육 시설 조건이 있습니다. 이용 중인가요?",
        "시설 이름이나 주소는 받지 않습니다.",
        sentenceWith(targetText, /어린이집|보육|아이돌봄/)
      ));
    }
    if (/임산|임신/.test(targetText)) {
      questions.push(choiceQuestion(
        "pregnancy",
        "문서에 임신·출산 조건이 있습니다. 그 조건에 해당하나요?",
        "진료 정보나 이름은 받지 않습니다.",
        sentenceWith(targetText, /임산|임신/)
      ));
    }
    return questions;
  }

  function choiceQuestion(id, prompt, help, quote) {
    return {
      id: id,
      kind: "choice",
      prompt: prompt,
      help: help,
      quote: quote,
      options: [
        { value: "yes", label: "예, 해당합니다" },
        { value: "no", label: "아니오" },
        { value: "unknown", label: "아직 모르겠습니다" }
      ]
    };
  }

  function cleanFact(line) {
    return String(line || "").replace(/\s*-->\s*/g, " ").replace(/\s+/g, " ").trim();
  }

  function factLines(text) {
    return String(text || "").split(/\n/).map(cleanFact).filter(function (line) {
      if (line.length < 4 || line.length > 180) return false;
      if (/^<\/?[a-z]/i.test(line)) return false;
      if (/보기$/.test(line) && !/방문|온라인|우편|팩스/.test(line)) return false;
      if (/^(사업내용|대상자 요건|지급방법 및 시기|지원금액|개월별 차등지원|신청 · 접수|신청·접수)$/.test(line)) return false;
      return true;
    });
  }

  function buildNeeded(sections, documents) {
    function textOf(id) {
      const found = sections.find(function (item) { return item.id === id; });
      return found ? found.text : "";
    }
    const groups = [];
    const target = factLines(textOf("target")).filter(function (line) {
      return /출생|거주|개월|세|국적|소득|양육|입양|수급|자격/.test(line);
    }).slice(0, 10);
    if (target.length) groups.push({ id: "target", label: "확인할 조건", items: target });
    const money = factLines(textOf("benefit")).filter(function (line) {
      return /원|미지급|바우처|감면|할인/.test(line);
    }).slice(0, 8);
    if (money.length) groups.push({ id: "benefit", label: "금액·지원", items: money });
    const docs = documents.map(function (item) { return item.name; }).filter(Boolean).slice(0, 8);
    if (docs.length) groups.push({ id: "docs", label: "제출 서류", items: docs });
    const method = factLines(textOf("method")).filter(function (line) {
      return /방문|온라인|우편|팩스|전자우편|신청|복지센터|플랫폼/.test(line);
    }).slice(0, 6);
    if (method.length) groups.push({ id: "method", label: "신청 방법", items: method });
    const pay = factLines(textOf("pay")).filter(function (line) {
      return /지급|계좌|매월|\d+일/.test(line);
    }).slice(0, 4);
    if (pay.length) groups.push({ id: "pay", label: "지급", items: pay });
    const exclude = factLines(textOf("exclude")).slice(0, 6);
    if (exclude.length) groups.push({ id: "exclude", label: "지원에서 빠지는 경우", items: exclude });
    return groups;
  }

  function buildExplanation(found, missing) {
    if (!found.length) {
      return "제목, 대상, 지원 내용, 기간, 서류, 신청 방법 중 구분되는 항목을 찾지 못했습니다. 없는 내용은 만들지 않습니다.";
    }
    const body = found.map(function (section) {
      return section.label + " — " + clip(section.text, 160);
    }).join(" ");
    const gap = missing.length ? " 문서에서 찾지 못한 항목: " + missing.join(", ") + ". 이 항목은 확인이 필요합니다." : "";
    return "올려 주신 글에서 구분한 내용입니다. " + body + gap;
  }

  function readAnnouncement(raw, meta) {
    const info = meta || {};
    let text = String(raw || "").replace(/\r/g, "").trim();
    let pageTitle = info.title || "";
    if (/^-\s*\d+\s*-$/.test(pageTitle) || pageTitle.split(" - ").length > 2) pageTitle = "";
    if (/<[a-z][^>]*>/i.test(text)) {
      const converted = textFromHtml(text);
      text = converted.text;
      if (!pageTitle) pageTitle = converted.title;
    }
    text = cutPageChrome(text);

    const buckets = { title: [], target: [], benefit: [], period: [], docs: [], method: [], office: [], pay: [], exclude: [] };
    const preamble = [];
    let current = null;
    text.split("\n").forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      const heading = headingOf(trimmed);
      if (heading) {
        if (heading.before && !current) preamble.push(heading.before);
        current = heading.heading.id;
        if (heading.heading.inline) buckets[current].push(heading.heading.inline);
        return;
      }
      const extra = extraOf(trimmed);
      if (extra) {
        current = extra.id;
        buckets[current].push(extra.text);
        return;
      }
      if (!current) {
        preamble.push(trimmed);
        return;
      }
      buckets[current].push(trimmed);
    });

    const leads = preamble.filter(function (line) {
      return !/^-\s*\d+\s*-$/.test(line) && line.length >= 8 && line.length <= 90 && line.charAt(0) !== "[";
    });
    const lead = leads.find(function (line) {
      return /공고/.test(line) && !/공고\s*제/.test(line);
    }) || leads[0] || "";
    let title = { text: "", location: "", kind: "missing" };
    if (buckets.title.length) {
      title = { text: joinBucket(buckets.title), location: "문서에 적힌 이름", kind: "section" };
    } else if (pageTitle) {
      title = { text: pageTitle, location: "페이지 제목", kind: "page" };
    } else if (lead) {
      title = { text: lead, location: "문서 첫머리", kind: "lead" };
    }

    const found = ["target", "benefit", "period", "docs", "method", "office", "pay", "exclude"].filter(function (id) {
      return buckets[id].length > 0;
    }).map(function (id) {
      return { id: id, label: LABELS[id], text: joinBucket(buckets[id]), location: "문서 표기 · " + LABELS[id] };
    });
    const missing = ["target", "benefit", "period", "docs", "method", "office"].filter(function (id) {
      return buckets[id].length === 0;
    }).map(function (id) { return LABELS[id]; });
    if (title.kind === "missing") missing.unshift("공고명");

    const targetText = joinBucket(buckets.target);
    const questions = buildQuestions(targetText);
    const documents = splitItems(joinBucket(buckets.docs)).map(function (name) {
      return { name: name, quote: name };
    });
    const steps = splitSteps(joinBucket(buckets.method)).map(function (step, index) {
      const flags = classifyStep(step);
      return {
        id: "step-" + (index + 1),
        index: index + 1,
        text: flags.text,
        quote: flags.text,
        login: flags.login,
        attach: flags.attach,
        submit: flags.submit,
        input: flags.input
      };
    });
    const selfServe = SELF_SERVE.filter(function (item) {
      return item.re.test(text);
    }).map(function (item) {
      return { label: item.label, quote: sentenceWith(text, item.re) };
    });
    const links = [];
    const linkRe = /https?:\/\/[^\s)<>\]]+/g;
    let link = linkRe.exec(text);
    while (link) {
      const url = link[0].replace(/[.,;]+$/, "");
      if (links.indexOf(url) === -1) links.push(url);
      link = linkRe.exec(text);
    }
    if (info.url && links.indexOf(info.url) === -1) links.unshift(info.url);

    const tooShort = text.replace(/\s/g, "").length < 20;
    return {
      sourceName: info.name || "",
      sourceUrl: info.url || "",
      sourceKind: info.kind || "document",
      tooShort: tooShort,
      title: title,
      sections: found,
      missing: missing,
      questions: tooShort ? [] : questions,
      documents: tooShort ? [] : documents,
      needed: tooShort ? [] : buildNeeded(found, documents),
      steps: tooShort ? [] : steps,
      selfServe: selfServe,
      links: links,
      benefitQuote: joinBucket(buckets.benefit),
      periodQuote: joinBucket(buckets.period),
      ageRange: parseAgeRange(targetText),
      explanation: tooShort
        ? "읽을 본문이 거의 없습니다. 공고 PDF나 본문을 올려 주세요. 없는 절차는 만들지 않습니다."
        : buildExplanation(found, missing)
    };
  }

  function choiceStatus(answer, yesDetail) {
    if (!answer || answer === "unknown") {
      return { status: "보류", tone: "hold", detail: "아직 모르는 조건입니다. 탈락으로 처리하지 않습니다." };
    }
    if (answer === "no") {
      return { status: "조건 불일치", tone: "no", detail: "올려 주신 답은 문서의 해당 문구와 다릅니다. 기관 판정은 아닙니다." };
    }
    if (answer === "yes" && yesDetail) {
      return { status: "확인 필요", tone: "check", detail: yesDetail };
    }
    return { status: "조건 일치", tone: "ok", detail: "답은 문서의 해당 문구와 어긋나지 않습니다. 기관 확인이 필요합니다." };
  }

  function compareAnswers(briefing, answers, today) {
    const given = answers || {};
    const clock = today || "2026-11-07";
    const items = (briefing.questions || []).map(function (question) {
      const answer = given[question.id];
      if (question.kind === "months") {
        if (answer == null || String(answer).trim() === "") {
          return item(question, "보류", "hold", "개월 수가 없습니다. 탈락이 아니라 보류입니다.", answer);
        }
        const months = Number(answer);
        if (!Number.isInteger(months) || months < 0 || months > 144) {
          return item(question, "확인 필요", "check", "개월 수를 0에서 144 사이의 정수로 읽지 못했습니다.", answer);
        }
        if (!briefing.ageRange) {
          return item(question, "확인 필요", "check", "나이 문장은 있으나 개월 범위로 확정하지 못했습니다. 문서 문장을 직접 봐 주세요.", answer);
        }
        const range = briefing.ageRange;
        if (months >= range.min && months < range.maxExclusive) {
          return item(question, "조건 일치", "ok", "문서의 개월 범위 안에 있습니다. 수급이 확정된 것은 아니며 기관 확인이 필요합니다.", answer);
        }
        return item(question, "조건 불일치", "no", "문서의 개월 범위 밖입니다. 기관의 최종 판정은 아닙니다.", answer);
      }
      if (question.id === "income") {
        const judged = choiceStatus(answer, "본인이 해당한다고 답했습니다. 소득 증빙은 확인하지 않았습니다.");
        return item(question, judged.status, judged.tone, judged.detail, answer);
      }
      const judged = choiceStatus(answer);
      return item(question, judged.status, judged.tone, judged.detail, answer);
    });

    if (briefing.periodQuote) {
      const end = endDate(briefing.periodQuote);
      if (!end) {
        items.push({
          id: "period",
          prompt: "신청 기간",
          quote: briefing.periodQuote,
          status: "확인 필요",
          tone: "check",
          detail: "기간 문장은 있으나 종료일을 날짜로 확정하지 못했습니다. 신청 기간 종료로 처리하지 않습니다.",
          answer: ""
        });
      } else if (end.iso < clock) {
        items.push({
          id: "period",
          prompt: "신청 기간",
          quote: end.raw,
          status: "신청 기간 종료",
          tone: "end",
          detail: "문서에서 읽은 종료일 " + end.iso + "이 기준일 " + clock + "보다 앞입니다.",
          answer: end.iso
        });
      } else {
        items.push({
          id: "period",
          prompt: "신청 기간",
          quote: end.raw,
          status: "기간 내",
          tone: "ok",
          detail: "문서에서 읽은 종료일 " + end.iso + "은 기준일 " + clock + " 당일이거나 그 이후입니다. 기관 일정 확인이 필요합니다.",
          answer: end.iso
        });
      }
    }

    return {
      items: items,
      note: "문서에 적힌 문구와 답을 비교한 결과입니다. 기관이 자격이나 수급을 확인한 것은 아닙니다. 예상 금액은 합산하지 않습니다."
    };
  }

  function item(question, status, tone, detail, answer) {
    return {
      id: question.id,
      prompt: question.prompt,
      quote: question.quote,
      status: status,
      tone: tone,
      detail: detail,
      answer: answer == null ? "" : String(answer)
    };
  }

  return {
    textFromHtml: textFromHtml,
    readAnnouncement: readAnnouncement,
    compareAnswers: compareAnswers,
    parseAgeRange: parseAgeRange,
    endDate: endDate
  };
});
