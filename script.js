"use strict";

// =====================================
// 共通定数・ユーティリティ
// =====================================

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY"
});

const percentFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 1
});

// 割引率（中間利率の簡易モデル）
const DISCOUNT_RATE = 0.03;

// 自賠責の簡易上限（モデル）
const JIBAI_INJURY_CAP = 1200000;   // 傷害・後遺（傷害部分）上限イメージ
const JIBAI_DEATH_CAP  = 30000000;  // 死亡自賠責限度額イメージ

let lastResult = null;

// -----------------------
// DOMユーティリティ
// -----------------------
function getEl(id) {
  return document.getElementById(id);
}

function getNumberValue(id) {
  const el = getEl(id);
  if (!el) return 0;
  const raw = (el.value || "").toString().replace(/,/g, "");
  if (raw === "") return 0;
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}

function getStringValue(id) {
  const el = getEl(id);
  if (!el) return "";
  return (el.value || "").toString();
}

// -----------------------
// ライプニッツ係数（簡易）
// -----------------------
function calcLumpSumFactor(years) {
  const n = Number(years);
  if (!n || n <= 0) return 0;
  const r = DISCOUNT_RATE;
  // 年金現価係数の単純式
  return (1 - Math.pow(1 + r, -n)) / r;
}

// -----------------------
// 過失・既払処理
// -----------------------
function applyFault(amount, faultPercent) {
  const base = Number(amount) || 0;
  const fault = Number(faultPercent) || 0;
  const ratio = Math.max(0, Math.min(100, 100 - fault));
  return Math.max(0, Math.round((base * ratio) / 100));
}

function applyPaid(amount, alreadyPaid) {
  const base = Number(amount) || 0;
  const paid = Number(alreadyPaid) || 0;
  return Math.max(0, Math.round(base - paid));
}

// -----------------------
// 等級 → 後遺慰謝料（裁判所基準モデル）
// -----------------------
const COURT_AFTER_PAIN_TABLE = {
  "1": 28000000,
  "2": 23000000,
  "3": 20000000,
  "4": 17000000,
  "5": 14000000,
  "6": 12000000,
  "7": 10000000,
  "8": 8300000,
  "9": 6900000,
  "10": 5500000,
  "11": 4200000,
  "12": 2900000,
  "13": 1800000,
  "14": 1100000
};

// -----------------------
// 等級 → 後遺慰謝料（自賠責モデル）
// -----------------------
const JIBAI_AFTER_PAIN_TABLE = {
  "1": 11500000,
  "2": 9980000,
  "3": 8610000,
  "4": 7370000,
  "5": 6180000,
  "6": 5120000,
  "7": 4190000,
  "8": 3310000,
  "9": 2490000,
  "10": 1900000,
  "11": 1360000,
  "12": 940000,
  "13": 570000,
  "14": 320000
};

// -----------------------
// 等級 → 喪失率（裁判所モデル）
// -----------------------
const LOSS_RATE_TABLE = {
  "1": 1.00,
  "2": 1.00,
  "3": 1.00,
  "4": 0.92,
  "5": 0.79,
  "6": 0.67,
  "7": 0.56,
  "8": 0.45,
  "9": 0.35,
  "10": 0.27,
  "11": 0.20,
  "12": 0.14,
  "13": 0.09,
  "14": 0.05
};

// -----------------------
// 傷害慰謝料（裁判所基準・簡易）
// -----------------------
function calcCourtInjuryPain(treatmentDays, visitDays) {
  const t = Number(treatmentDays) || 0;
  const v = Number(visitDays) || 0;
  if (!t && !v) return 0;

  const baseDays = Math.min(t, 180);
  const points = Math.max(baseDays, v * 2); // 通院日数×2 のイメージ
  const amount = points * 4300;
  return Math.min(1350000, Math.round(amount));
}

// -----------------------
// 傷害慰謝料（自賠責基準・簡易）
// -----------------------
function calcJibaiInjuryPain(treatmentDays, visitDays) {
  const t = Number(treatmentDays) || 0;
  const v = Number(visitDays) || 0;
  if (!t && !v) return 0;

  const days = Math.min(t, 120);
  const amount = days * 4300;
  return Math.round(Math.min(amount, JIBAI_INJURY_CAP));
}

// -----------------------
// 後遺慰謝料（裁判所）
// -----------------------
function calcCourtAfterPain(grade) {
  if (!grade || grade === "none") return 0;
  return COURT_AFTER_PAIN_TABLE[grade] || 0;
}

// -----------------------
// 後遺慰謝料（自賠責）
// -----------------------
function calcJibaiAfterPain(grade) {
  if (!grade || grade === "none") return 0;
  return JIBAI_AFTER_PAIN_TABLE[grade] || 0;
}

// -----------------------
// 喪失率・喪失期間の解決
// -----------------------
function resolveLossRate(inputs) {
  if (inputs.lossRateManual != null && inputs.lossRateManual > 0) {
    return Math.min(1, inputs.lossRateManual / 100);
  }
  if (inputs.grade && LOSS_RATE_TABLE[inputs.grade]) {
    return LOSS_RATE_TABLE[inputs.grade];
  }
  return 0;
}

function resolveLossYears(inputs) {
  if (inputs.lossYearsManual != null && inputs.lossYearsManual > 0) {
    return inputs.lossYearsManual;
  }
  const age = inputs.age || 0;
  if (age > 0 && age < 67) {
    return 67 - age;
  }
  return 5; // 67歳超などの簡易モデル
}

// -----------------------
// 逸失利益（裁判所）
// -----------------------
function calcLostEarningsCourt(annualIncome, lossRate, lossYears) {
  if (!annualIncome || !lossRate || !lossYears) return 0;
  const factor = calcLumpSumFactor(lossYears);
  const amount = annualIncome * lossRate * factor;
  return Math.round(amount);
}

// -----------------------
// 死亡慰謝料（裁判所・プリセット）
// -----------------------
function resolveDeathPain(inputs) {
  const preset = inputs.deathPainPreset;
  if (preset === "custom") {
    return inputs.deathPainCustom || 0;
  }
  if (preset === "self") {
    return 29000000;
  }
  if (preset === "dependent") {
    return 35000000;
  }
  return 0;
}

// -----------------------
// 生活費控除率（死亡）
// -----------------------
function resolveDeathLifeRate(inputs) {
  if (inputs.deathLifeRateManual != null && inputs.deathLifeRateManual >= 0) {
    return Math.max(0, Math.min(1, inputs.deathLifeRateManual / 100));
  }
  switch (inputs.deathSupportType) {
    case "none":     // 被扶養者なし
      return 0.40;
    case "one":      // 扶養1名
      return 0.30;
    case "twoPlus":  // 扶養2名以上
      return 0.30;
    default:
      return 0.35;
  }
}

// -----------------------
// 就労可能年数（死亡）
// -----------------------
function resolveDeathWorkYears(inputs) {
  if (inputs.deathWorkYearsManual != null && inputs.deathWorkYearsManual > 0) {
    return inputs.deathWorkYearsManual;
  }
  const age = inputs.age || 0;
  if (age > 0 && age < 67) {
    return 67 - age;
  }
  return 5;
}

// ===============================
// 入力値の収集
// ===============================
function collectInputs() {
  const status = getStringValue("victimStatus");

  const inputs = {
    status: status,
    accidentDate: getStringValue("accidentDate"),
    age: getNumberValue("age"),
    annualIncome: getNumberValue("annualIncome"),

    // 傷害・休業損害
    treatmentDays: getNumberValue("treatmentDays"),
    visitDays: getNumberValue("visitDays"),
    absenceDays: getNumberValue("absenceDays"),
    dailyIncome: getNumberValue("dailyIncome"),

    // 後遺
    grade: getStringValue("grade"),
    lossRateManual: getNumberValue("lossRate"),
    lossYearsManual: getNumberValue("lossYears"),

    // 死亡
    deathSupportType: getStringValue("deathSupportType"),
    deathLifeRateManual: getNumberValue("deathLifeRate"),
    deathWorkYearsManual: getNumberValue("deathWorkYears"),
    deathPainPreset: getStringValue("deathPainPreset"),
    deathPainCustom: getNumberValue("deathPainCustom"),
    funeralCost: getNumberValue("funeralCost"),

    // その他
    otherCosts: getNumberValue("otherCosts"),
    faultPercent: getNumberValue("faultPercent"),
    alreadyPaid: getNumberValue("alreadyPaid")
  };

  return inputs;
}

// -----------------------
// 簡易バリデーション
// -----------------------
function validateInputs(inputs) {
  const errors = [];

  if (!inputs.status) {
    errors.push("事故類型を選択してください。");
  }
  if (!inputs.age || inputs.age <= 0) {
    errors.push("年齢を正しく入力してください。");
  }
  if (!inputs.annualIncome || inputs.annualIncome < 0) {
    errors.push("基礎収入（年収）を正しく入力してください。");
  }

  // 後遺・傷害では、治療期間・通院日数・休業日数のいずれかはあった方がよい
  if (inputs.status === "injury" || inputs.status === "after") {
    if (!inputs.treatmentDays && !inputs.visitDays && !inputs.absenceDays) {
      errors.push("治療期間・実通院日数・休業日数のいずれかを入力してください。");
    }
  }

  // 死亡事故では扶養状況を入れてもらう
  if (inputs.status === "death") {
    if (!inputs.deathSupportType) {
      errors.push("死亡事故の場合は、生活費控除方式（扶養状況）を選択してください。");
    }
  }

  return errors;
}

function showErrors(errors) {
  if (!errors || errors.length === 0) return;
  const box = getEl("errorBox");
  const list = getEl("errorList");

  if (box && list) {
    list.innerHTML = "";
    errors.forEach(msg => {
      const li = document.createElement("li");
      li.textContent = msg;
      list.appendChild(li);
    });
    box.classList.remove("hidden");
  } else {
    alert(errors.join("\n"));
  }
}

// ===============================
// メイン計算
// ===============================
function calculateAll() {
  const inputs = collectInputs();
  const errors = validateInputs(inputs);
  if (errors.length > 0) {
    showErrors(errors);
    return;
  }

  // エラーボックスがあれば消す
  const box = getEl("errorBox");
  if (box) box.classList.add("hidden");

  // 裁判所基準
  let courtInjury = 0;
  let courtAfter = 0;
  let courtLost = 0;
  let courtLostWages = 0;
  let courtOther = inputs.otherCosts || 0;

  if (inputs.status === "injury" || inputs.status === "after") {
    // 傷害慰謝料
    courtInjury = calcCourtInjuryPain(inputs.treatmentDays, inputs.visitDays);

    // 後遺慰謝料＋逸失利益
    if (inputs.status === "after") {
      courtAfter = calcCourtAfterPain(inputs.grade);
      const lossRate = resolveLossRate(inputs);
      const lossYears = resolveLossYears(inputs);
      courtLost = calcLostEarningsCourt(inputs.annualIncome, lossRate, lossYears);
    }

    // 休業損害
    if (inputs.dailyIncome && inputs.absenceDays) {
      courtLostWages = Math.round(inputs.dailyIncome * inputs.absenceDays);
    }
  } else if (inputs.status === "death") {
    // 死亡慰謝料
    courtAfter = resolveDeathPain(inputs);
    const lifeRate = resolveDeathLifeRate(inputs);
    const workYears = resolveDeathWorkYears(inputs);
    // 死亡逸失利益：基礎収入×(1-生活費控除率)×係数
    const netIncome = inputs.annualIncome * (1 - lifeRate);
    courtLost = Math.round(netIncome * calcLumpSumFactor(workYears));
    // 葬儀費
    courtOther += inputs.funeralCost || 0;
  }

  const courtTotal = courtInjury + courtAfter + courtLost + courtLostWages + courtOther;
  const courtAfterFault = applyFault(courtTotal, inputs.faultPercent);
  const courtAfterPaid = applyPaid(courtAfterFault, inputs.alreadyPaid);

  // 自賠責基準（簡易）
  let jibaiInjury = 0;
  let jibaiAfter = 0;
  let jibaiLostWages = 0;
  let jibaiOther = inputs.otherCosts || 0;
  let jibaiCap = null;

  if (inputs.status === "injury" || inputs.status === "after") {
    jibaiInjury = calcJibaiInjuryPain(inputs.treatmentDays, inputs.visitDays);
    jibaiLostWages = Math.round(inputs.dailyIncome * (inputs.absenceDays || 0));
    if (inputs.status === "after") {
      jibaiAfter = calcJibaiAfterPain(inputs.grade);
    }
    jibaiCap = JIBAI_INJURY_CAP;
  } else if (inputs.status === "death") {
    // 死亡自賠責は「限度額」を目安的に使用
    jibaiCap = JIBAI_DEATH_CAP;
    jibaiInjury = 0;
    jibaiAfter = JIBAI_DEATH_CAP;
  }

  let jibaiTotal = jibaiInjury + jibaiAfter + jibaiLostWages + jibaiOther;
  if (jibaiCap != null) {
    jibaiTotal = Math.min(jibaiTotal, jibaiCap);
  }
  const jibaiAfterFault = applyFault(jibaiTotal, inputs.faultPercent);
  const jibaiAfterPaid = applyPaid(jibaiAfterFault, inputs.alreadyPaid);

  // 構成比
  const courtRatios = buildRatio({
    injury: courtInjury,
    after: courtAfter,
    lost: courtLost,
    other: courtLostWages + courtOther
  });

  const result = {
    court: {
      injuryPain: courtInjury,
      afterPain: courtAfter,
      lostEarnings: courtLost,
      lostWages: courtLostWages,
      otherCosts: courtOther,
      total: courtTotal,
      afterFault: courtAfterFault,
      afterPaid: courtAfterPaid,
      ratios: courtRatios
    },
    jibai: {
      injuryPain: jibaiInjury,
      afterPain: jibaiAfter,
      lostWages: jibaiLostWages,
      otherCosts: jibaiOther,
      total: jibaiTotal,
      afterFault: jibaiAfterFault,
      afterPaid: jibaiAfterPaid,
      cap: jibaiCap
    },
    meta: {
      status: inputs.status,
      age: inputs.age,
      annualIncome: inputs.annualIncome,
      treatmentDays: inputs.treatmentDays,
      visitDays: inputs.visitDays,
      absenceDays: inputs.absenceDays,
      grade: inputs.grade,
      deathSupportType: inputs.deathSupportType,
      deathWorkYears: resolveDeathWorkYears(inputs),
      deathLifeRate: resolveDeathLifeRate(inputs)
    },
    inputs: inputs
  };

  lastResult = result;
  renderResult(result);

  // 結果カードまで自動スクロール
  const target = getEl("resultSection");
  if (target) {
    setTimeout(() => {
      const rect = target.getBoundingClientRect();
      const y = rect.top + window.pageYOffset - 8;
      window.scrollTo({
        top: y,
        behavior: "smooth"
      });
    }, 200);
  }
}

// -----------------------
// 構成比の計算
// -----------------------
function buildRatio(parts) {
  const injury = parts.injury || 0;
  const after = parts.after || 0;
  const lost = parts.lost || 0;
  const other = parts.other || 0;
  const total = injury + after + lost + other;
  if (!total) {
    return {
      injury: 0,
      after: 0,
      lost: 0,
      other: 0
    };
  }
  return {
    injury: (injury / total) * 100,
    after: (after / total) * 100,
    lost: (lost / total) * 100,
    other: (other / total) * 100
  };
}

// ===============================
// 結果の描画
// ===============================
function renderResult(all) {
  const court = all.court;
  const jibai = all.jibai;
  const meta = all.meta;
  const inputs = all.inputs;

  // サマリー文言
  const statusLabelMap = {
    injury: "傷害（入通院）",
    after: "後遺障害",
    death: "死亡事故"
  };
  const statusLabel = statusLabelMap[meta.status] || "";

  const caseSummaryEl = getEl("caseSummary");
  if (caseSummaryEl) {
    const agePart = meta.age ? `${meta.age}歳` : "";
    const incomePart = meta.annualIncome
      ? `年収 ${yenFormatter.format(meta.annualIncome)}`
      : "";
    const pieces = [];
    if (statusLabel) pieces.push(statusLabel);
    if (agePart) pieces.push(agePart);
    if (incomePart) pieces.push(incomePart);
    caseSummaryEl.textContent = pieces.join(" ／ ");
  }

  // 裁判所基準サマリー
  const courtNetEl = getEl("courtNetAmount");
  const courtHintEl = getEl("courtHint");
  if (courtNetEl) {
    courtNetEl.textContent = yenFormatter.format(court.afterPaid);
  }
  if (courtHintEl) {
    courtHintEl.textContent =
      `① 総損害額 ${yenFormatter.format(court.total)} ` +
      `→ ② 過失相殺後 ${yenFormatter.format(court.afterFault)} ` +
      `→ ③ 既払控除後（受取想定） ${yenFormatter.format(court.afterPaid)}`;
  }

  // 自賠責サマリー
  const jibaiNetEl = getEl("jibaiNetAmount");
  const jibaiHintEl = getEl("jibaiHint");
  if (jibaiNetEl) {
    jibaiNetEl.textContent = yenFormatter.format(jibai.afterPaid);
  }
  if (jibaiHintEl) {
    let capInfo = "";
    if (jibai.cap != null) {
      capInfo = `（限度額 ${yenFormatter.format(jibai.cap)} を上限とするモデル）`;
    }
    jibaiHintEl.textContent =
      `① 総損害額 ${yenFormatter.format(jibai.total)} ` +
      `→ ② 過失相殺後 ${yenFormatter.format(jibai.afterFault)} ` +
      `→ ③ 既払控除後（受取想定） ${yenFormatter.format(jibai.afterPaid)} ${capInfo}`;
  }

  // 明細（裁判所）
  const setText = (id, value) => {
    const el = getEl(id);
    if (el) el.textContent = yenFormatter.format(value || 0);
  };

  setText("courtInjuryPain", court.injuryPain);
  setText("courtAfterPain", court.afterPain);
  setText("courtLostEarnings", court.lostEarnings);
  setText("courtLostWages", court.lostWages);
  setText("courtOtherCosts", court.otherCosts);
  setText("courtTotal", court.total);
  setText("courtAfterFault", court.afterFault);
  setText("courtAfterPaid", court.afterPaid);

  const ratio = court.ratios || { injury: 0, after: 0, lost: 0, other: 0 };
  const setRatio = (id, v) => {
    const el = getEl(id);
    if (el) el.textContent = `${percentFormatter.format(v || 0)}％`;
  };
  setRatio("courtRatioInjury", ratio.injury);
  setRatio("courtRatioAfter", ratio.after);
  setRatio("courtRatioLostEarnings", ratio.lost);
  setRatio("courtRatioOther", ratio.other);

  // 明細（自賠責）
  setText("jibaiInjuryPain", jibai.injuryPain);
  setText("jibaiAfterPain", jibai.afterPain);
  setText("jibaiLostWages", jibai.lostWages);
  setText("jibaiOtherCosts", jibai.otherCosts);
  setText("jibaiTotal", jibai.total);
  setText("jibaiAfterFault", jibai.afterFault);
  setText("jibaiAfterPaid", jibai.afterPaid);

  const capInfoEl = getEl("jibaiCapInfo");
  if (capInfoEl) {
    if (jibai.cap != null) {
      capInfoEl.textContent = `※自賠責限度額のモデル：${yenFormatter.format(
        jibai.cap
      )}（概算）`;
    } else {
      capInfoEl.textContent = "";
    }
  }

  // グラフ
  updateCourtChart(court);

  // カード表示
  const resultSection = getEl("resultSection");
  const detailSection = getEl("detailResults");
  if (resultSection) resultSection.classList.remove("hidden");
  if (detailSection) detailSection.classList.remove("hidden");
}

// -----------------------
// 円グラフ描画
// -----------------------
function updateCourtChart(court) {
  const section = getEl("chartSection");
  const canvas = getEl("courtChart");
  const legend = getEl("chartLegend");
  const note = getEl("chartNote");
  if (!canvas || !legend || !section) return;

  const injury = court.injuryPain || 0;
  const after = court.afterPain || 0;
  const lost = court.lostEarnings || 0;
  const other = (court.lostWages || 0) + (court.otherCosts || 0);
  const total = injury + after + lost + other;

  if (!total) {
    section.classList.add("hidden");
    legend.innerHTML = "";
    if (note) note.textContent = "裁判所基準の総損害額が0円のため表示しません。";
    return;
  }

  section.classList.remove("hidden");

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 10;

  const parts = [
    { label: "傷害慰謝料", value: injury, color: "#60a5fa" },
    { label: "後遺/死亡慰謝料", value: after, color: "#f97373" },
    { label: "逸失利益", value: lost, color: "#22c55e" },
    { label: "その他", value: other, color: "#facc15" }
  ].filter(p => p.value > 0);

  let start = -Math.PI / 2;

  parts.forEach(p => {
    const angle = (p.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    start += angle;
  });

  legend.innerHTML = "";
  parts.forEach(p => {
    const pct = ((p.value / total) * 100).toFixed(1) + "%";
    const item = document.createElement("div");
    item.className = "chart-legend-item";

    const box = document.createElement("span");
    box.className = "chart-legend-color";
    box.style.backgroundColor = p.color;

    const label = document.createElement("span");
    label.textContent = `${p.label}：${yenFormatter.format(p.value)}（${pct}）`;

    item.appendChild(box);
    item.appendChild(label);
    legend.appendChild(item);
  });

  if (note) {
    note.textContent = `総損害額 ${yenFormatter.format(
      total
    )} の構成比を表示しています。`;
  }
}

// -----------------------
// 事故類型で入力UI切替
// -----------------------
function updateInputVisibility() {
  const v = getStringValue("victimStatus");
  const inj = getEl("injuryInputs");
  const aft = getEl("afterInputs");
  const dth = getEl("deathInputs");

  if (inj) inj.classList.add("hidden");
  if (aft) aft.classList.add("hidden");
  if (dth) dth.classList.add("hidden");

  if (v === "injury" && inj) inj.classList.remove("hidden");
  if (v === "after") {
    if (inj) inj.classList.remove("hidden");
    if (aft) aft.classList.remove("hidden");
  }
  if (v === "death" && dth) dth.classList.remove("hidden");
}

// -----------------------
// 典型モデル適用
// -----------------------
const modelPresets = {
  after_14_30: {
    status: "after",
    age: 30,
    annualIncome: 4000000,
    grade: "14"
  },
  after_12_40: {
    status: "after",
    age: 40,
    annualIncome: 5000000,
    grade: "12"
  },
  after_9_30: {
    status: "after",
    age: 30,
    annualIncome: 6000000,
    grade: "9"
  },
  after_12_30: {
    status: "after",
    age: 30,
    annualIncome: 4500000,
    grade: "12"
  },
  death_40_dep: {
    status: "death",
    age: 40,
    annualIncome: 5000000,
    deathSupportType: "twoPlus",
    deathPainPreset: "dependent"
  },
  death_75_single: {
    status: "death",
    age: 75,
    annualIncome: 3000000,
    deathSupportType: "none",
    deathPainPreset: "self"
  }
};

function applyModelPreset(key) {
  const preset = modelPresets[key];
  if (!preset) return;

  const setVal = (id, val) => {
    if (val === undefined) return;
    const el = getEl(id);
    if (el) el.value = val;
  };

  if (preset.status) {
    setVal("victimStatus", preset.status);
    updateInputVisibility();
  }

  setVal("age", preset.age);
  setVal("annualIncome", preset.annualIncome);
  setVal("grade", preset.grade);
  setVal("deathSupportType", preset.deathSupportType);
  setVal("deathPainPreset", preset.deathPainPreset);
}

// -----------------------
// 損害明細コピー
// -----------------------
function buildSummaryTextFromLastResult() {
  if (!lastResult) return "";

  const all = lastResult;
  const court = all.court;
  const jibai = all.jibai;
  const meta = all.meta;
  const inputs = all.inputs;

  const statusLabelMap = {
    injury: "傷害（入通院）",
    after: "後遺障害",
    death: "死亡事故"
  };
  const statusLabel = statusLabelMap[meta.status] || "";

  const supportMap = {
    none: "被扶養者なし",
    one: "扶養1名",
    twoPlus: "扶養2名以上"
  };

  const lines = [];
  lines.push("【交通事故損害概算（参考値・モデル計算）】");
  if (statusLabel) lines.push(`事故類型：${statusLabel}`);
  if (meta.age) lines.push(`年齢：${meta.age}歳`);
  if (meta.annualIncome) {
    lines.push(`基礎収入：${yenFormatter.format(meta.annualIncome)}／年`);
  }
  if (inputs.accidentDate) {
    lines.push(`事故日：${inputs.accidentDate}`);
  }
  if (inputs.faultPercent || inputs.faultPercent === 0) {
    lines.push(`過失割合（被害者側）：${inputs.faultPercent}%`);
  }
  if (inputs.alreadyPaid) {
    lines.push(`既払金：${yenFormatter.format(inputs.alreadyPaid)}`);
  }

  if (meta.status === "injury" || meta.status === "after") {
    if (meta.treatmentDays || meta.visitDays || meta.absenceDays) {
      const t = meta.treatmentDays ? `${meta.treatmentDays}日` : "-";
      const v = meta.visitDays ? `${meta.visitDays}日` : "-";
      const a = meta.absenceDays ? `${meta.absenceDays}日` : "-";
      lines.push(`治療期間：${t}／実通院日数：${v}／休業日数：${a}`);
    }
    if (meta.status === "after" && meta.grade && meta.grade !== "none") {
      lines.push(`後遺障害等級：${meta.grade}級（慰謝料モデル＋逸失利益モデル）`);
    }
  }

  if (meta.status === "death") {
    if (meta.deathSupportType) {
      lines.push(
        `扶養状況：${supportMap[meta.deathSupportType] || ""}`
      );
    }
    if (meta.deathWorkYears) {
      lines.push(
        `就労可能年数（モデル）：約${meta.deathWorkYears}年（67歳までを目安）`
      );
    }
    if (meta.deathLifeRate != null) {
      const pct = (meta.deathLifeRate * 100).toFixed(1).replace(/\.0$/, "");
      lines.push(`生活費控除率（モデル）：約${pct}%`);
    }
    if (inputs.funeralCost) {
      lines.push(`葬儀費：${yenFormatter.format(inputs.funeralCost)}`);
    }
  }

  lines.push("");
  lines.push("＜裁判所基準モデル＞");
  lines.push(`傷害慰謝料：${yenFormatter.format(court.injuryPain)}`);
  lines.push(`後遺障害／死亡慰謝料：${yenFormatter.format(court.afterPain)}`);
  lines.push(`逸失利益：${yenFormatter.format(court.lostEarnings)}`);
  lines.push(`休業損害：${yenFormatter.format(court.lostWages)}`);
  lines.push(`その他費用：${yenFormatter.format(court.otherCosts)}`);
  lines.push(`総損害額：${yenFormatter.format(court.total)}`);
  lines.push(`過失相殺後：${yenFormatter.format(court.afterFault)}`);
  lines.push(`既払控除後（受取想定）：${yenFormatter.format(court.afterPaid)}`);

  lines.push("");
  lines.push("＜自賠責基準モデル＞");
  lines.push(`傷害慰謝料：${yenFormatter.format(jibai.injuryPain)}`);
  lines.push(`後遺障害慰謝料：${yenFormatter.format(jibai.afterPain)}`);
  lines.push(`休業損害：${yenFormatter.format(jibai.lostWages)}`);
  lines.push(`その他費用：${yenFormatter.format(jibai.otherCosts)}`);
  lines.push(`総損害額：${yenFormatter.format(jibai.total)}`);
  if (jibai.cap) {
    lines.push(`自賠責限度額：${yenFormatter.format(jibai.cap)}`);
  }
  lines.push(`過失相殺後：${yenFormatter.format(jibai.afterFault)}`);
  lines.push(`既払控除後（受取想定）：${yenFormatter.format(jibai.afterPaid)}`);

  lines.push("");
  lines.push(
    "※本明細は公開されている目安額・モデル算式に基づく概算値であり、実際の解決額を保証するものではありません。"
  );

  return lines.join("\n");
}

function copySummaryToClipboard() {
  if (!lastResult) {
    alert("先に「損害額を計算する」を実行してください。");
    return;
  }
  const text = buildSummaryTextFromLastResult();
  if (!text) {
    alert("コピー可能な明細がありません。");
    return;
  }

  let success = false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    success = document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch (e) {
    success = false;
  }

  const statusEl = getEl("copyStatus");
  if (success) {
    if (statusEl) {
      statusEl.textContent = "損害明細をクリップボードにコピーしました。";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 4000);
    } else {
      alert("損害明細をコピーしました。");
    }
  } else {
    window.prompt(
      "コピーに失敗しました。下記テキストを選択してコピーしてください。",
      text
    );
  }
}

// -----------------------
// 初期化
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
  updateInputVisibility();

  const statusSel = getEl("victimStatus");
  if (statusSel) {
    statusSel.addEventListener("change", updateInputVisibility);
  }

  const calcBtn = getEl("calcButton");
  if (calcBtn) {
    calcBtn.addEventListener("click", e => {
      e.preventDefault();
      calcBtn.classList.add("btn-pressed");
      setTimeout(() => calcBtn.classList.remove("btn-pressed"), 150);
      calculateAll();
    });
  }

  const presetSelect = getEl("modelPreset");
  if (presetSelect) {
    presetSelect.addEventListener("change", e => {
      applyModelPreset(e.target.value);
    });
  }

  const copyBtn = getEl("copySummaryButton");
  if (copyBtn) {
    copyBtn.addEventListener("click", e => {
      e.preventDefault();
      copySummaryToClipboard();
    });
  }
});
