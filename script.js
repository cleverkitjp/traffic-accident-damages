// 数値フォーマット（日本円）
const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

// 等級ごとの典型的な喪失率・喪失期間（モデル値）
const gradeLossPreset = {
  none: { rate: 0, years: 0 },
  "14": { rate: 5, years: 5 },
  "13": { rate: 9, years: 7 },
  "12": { rate: 14, years: 10 },
  "11": { rate: 20, years: 15 },
  "10": { rate: 27, years: 17 },
  "9":  { rate: 35, years: 20 },
  "8":  { rate: 45, years: 22 },
  "7":  { rate: 56, years: 27 },
  "6":  { rate: 67, years: 30 },
  "5":  { rate: 79, years: 32 },
  "4":  { rate: 79, years: 34 },
  "3":  { rate: 100, years: 35 },
  "2":  { rate: 100, years: 40 },
  "1":  { rate: 100, years: 45 }
};

// 自賠責の後遺障害慰謝料（モデル値。実務で使用する場合は最新基準で要調整）
const jibaiAfterPainTable = {
  "1": 16500000,
  "2": 12030000,
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

// 裁判所基準（モデル）の後遺障害慰謝料（代表値）
const courtAfterPainTable = {
  "1": 2800000,
  "2": 2370000,
  "3": 1990000,
  "4": 1670000,
  "5": 1400000,
  "6": 1180000,
  "7": 1000000,
  "8": 830000,
  "9": 690000,
  "10": 550000,
  "11": 420000,
  "12": 290000,
  "13": 180000,
  "14": 110000
};

// 傷害慰謝料（裁判所基準モデル）の代表値（1〜6か月、通院頻度「中」の想定）
const courtInjuryBaseTable = {
  1: 190000,
  2: 280000,
  3: 530000,
  4: 670000,
  5: 750000,
  6: 880000
};

document.addEventListener("DOMContentLoaded", () => {
  const gradeEl = document.getElementById("grade");
  const lossRateEl = document.getElementById("lossRate");
  const lossYearsEl = document.getElementById("lossYears");
  const incomePresetEl = document.getElementById("incomePreset");
  const annualIncomeEl = document.getElementById("annualIncome");
  const calcButton = document.getElementById("calcButton");
  const toggleAdvancedBtn = document.getElementById("toggleAdvanced");
  const advancedSection = document.getElementById("advancedSection");

  // 等級変更時に喪失率・期間を自動設定
  gradeEl.addEventListener("change", () => {
    const value = gradeEl.value || "none";
    const preset = gradeLossPreset[value] || gradeLossPreset["none"];
    lossRateEl.value = preset.rate > 0 ? String(preset.rate) : "";
    lossYearsEl.value = preset.years > 0 ? String(preset.years) : "";
  });

  // 基礎収入プリセット
  incomePresetEl.addEventListener("change", () => {
    const value = incomePresetEl.value;
    if (value === "avgAll") {
      annualIncomeEl.value = "4000000"; // モデル値
    } else if (value === "avgMale") {
      annualIncomeEl.value = "5000000"; // モデル値
    } else if (value === "avgFemale") {
      annualIncomeEl.value = "3000000"; // モデル値
    }
    // "custom" の場合は何もしない
  });

  // 詳細設定表示/非表示
  toggleAdvancedBtn.addEventListener("click", () => {
    const isHidden = advancedSection.classList.contains("hidden");
    if (isHidden) {
      advancedSection.classList.remove("hidden");
      toggleAdvancedBtn.textContent = "詳細設定（労働能力喪失率・喪失期間）を隠す";
    } else {
      advancedSection.classList.add("hidden");
      toggleAdvancedBtn.textContent = "詳細設定（労働能力喪失率・喪失期間）を表示";
    }
  });

  // 計算ボタン
  calcButton.addEventListener("click", () => {
    const inputs = parseInputs();
    const errors = validateInputs(inputs);
    showErrors(errors);

    if (errors.length === 0) {
      const result = calculateAll(inputs);
      updateResultDisplay(result);
    }
  });
});

// 入力取得
function parseInputs() {
  const intOrNull = (id) => {
    const v = document.getElementById(id).value.trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const grade = document.getElementById("grade").value;
  const lossRate = intOrNull("lossRate");
  const lossYears = (() => {
    const v = document.getElementById("lossYears").value.trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  })();

  const treatmentDays = intOrNull("treatmentDays");
  const visitDays = intOrNull("visitDays");
  const dailyIncome = intOrNull("dailyIncome");
  const absenceDays = intOrNull("absenceDays");
  const otherCosts = intOrNull("otherCosts") ?? 0;
  const annualIncome = intOrNull("annualIncome");
  const faultPercent = intOrNull("faultPercent");
  const alreadyPaid = intOrNull("alreadyPaid") ?? 0;
  const accidentDate = document.getElementById("accidentDate").value || null;

  return {
    treatmentDays,
    visitDays,
    dailyIncome,
    absenceDays,
    otherCosts,
    grade,
    lossRateOverride: lossRate,
    lossYearsOverride: lossYears,
    annualIncome,
    faultPercent,
    alreadyPaid,
    accidentDate
  };
}

// 入力バリデーション
function validateInputs(inputs) {
  const errors = [];

  if (!inputs.treatmentDays || inputs.treatmentDays <= 0) {
    errors.push("治療期間（日数）を1以上の整数で入力してください。");
  }
  if (inputs.visitDays === null || inputs.visitDays < 0) {
    errors.push("実通院日数（日）を0以上の整数で入力してください。");
  }
  if (!inputs.dailyIncome || inputs.dailyIncome < 0) {
    errors.push("休業損害の実収入日額（円）を0以上で入力してください。");
  }
  if (inputs.absenceDays === null || inputs.absenceDays < 0) {
    errors.push("休業日数（日）を0以上の整数で入力してください。");
  }
  if (!inputs.grade) {
    errors.push("後遺障害等級を選択してください。");
  }
  if (!inputs.annualIncome || inputs.annualIncome < 0) {
    errors.push("基礎収入（年額・円）を0以上で入力してください。");
  }
  if (inputs.faultPercent === null || inputs.faultPercent < 0 || inputs.faultPercent > 100) {
    errors.push("被害者側過失割合（％）は0〜100の範囲で入力してください。");
  }
  if (inputs.alreadyPaid < 0) {
    errors.push("既払金合計（円）は0以上で入力してください。");
  }

  return errors;
}

// エラーメッセージ表示
function showErrors(errors) {
  const box = document.getElementById("errorMessages");
  if (!errors.length) {
    box.style.display = "none";
    box.textContent = "";
    return;
  }
  box.style.display = "block";
  box.innerHTML = errors.map((e) => `<div>・${e}</div>`).join("");
}

// 全体計算
function calculateAll(inputs) {
  const fault = inputs.faultPercent / 100;

  // 自賠責基準
  const jibaiInjuryPain = calcJibaiInjuryPain(inputs.treatmentDays, inputs.visitDays);
  const jibaiLostWages = calcJibaiLostEarnings(inputs.dailyIncome, inputs.absenceDays);
  const jibaiAfterPain = calcJibaiAfterEffectPain(inputs.grade);
  const jibaiOtherCosts = inputs.otherCosts; // 全額その他として加算（簡略モデル）

  const jibaiTotalGross = jibaiInjuryPain + jibaiLostWages + jibaiAfterPain + jibaiOtherCosts;
  const jibaiAfterFault = applyFault(jibaiTotalGross, fault);
  const jibaiAfterPaid = applyPaid(jibaiAfterFault, inputs.alreadyPaid);
  const jibaiCap = 1200000; // 傷害120万円枠

  // 裁判所基準モデル
  const courtInjuryPain = calcCourtInjuryPain(inputs.treatmentDays, inputs.visitDays);
  const courtAfterPain = calcCourtAfterEffectPain(inputs.grade);
  const courtLostEarnings = calcLostEarningsCourt(inputs.annualIncome, getLossRate(inputs), getLossYears(inputs));
  const courtLostWages = calcCourtLostWages(inputs.dailyIncome, inputs.absenceDays);
  const courtOtherCosts = inputs.otherCosts;

  const courtTotalGross =
    courtInjuryPain + courtAfterPain + courtLostEarnings + courtLostWages + courtOtherCosts;
  const courtAfterFault = applyFault(courtTotalGross, fault);
  const courtAfterPaid = applyPaid(courtAfterFault, inputs.alreadyPaid);

  const ratios = calcPercentageDistribution({
    injury: courtInjuryPain,
    after: courtAfterPain,
    lost: courtLostEarnings,
    other: courtLostWages + courtOtherCosts
  });

  return {
    jibai: {
      injuryPain: jibaiInjuryPain,
      lostWages: jibaiLostWages,
      afterPain: jibaiAfterPain,
      otherCosts: jibaiOtherCosts,
      total: jibaiTotalGross,
      afterFault: jibaiAfterFault,
      afterPaid: jibaiAfterPaid,
      cap: jibaiCap
    },
    court: {
      injuryPain: courtInjuryPain,
      afterPain: courtAfterPain,
      lostEarnings: courtLostEarnings,
      lostWages: courtLostWages,
      otherCosts: courtOtherCosts,
      total: courtTotalGross,
      afterFault: courtAfterFault,
      afterPaid: courtAfterPaid,
      ratios
    }
  };
}

// 自賠責：傷害慰謝料
function calcJibaiInjuryPain(treatmentDays, visitDays) {
  const base = 4300;
  const periods = Math.min(treatmentDays || 0, (visitDays || 0) * 2);
  if (!treatmentDays || !visitDays) return 0;
  return base * periods;
}

// 自賠責：休業損害
function calcJibaiLostEarnings(dailyIncome, absenceDays) {
  if (!dailyIncome || !absenceDays) return 0;
  const daily = Math.min(dailyIncome, 6100);
  return daily * absenceDays;
}

// 自賠責：後遺障害慰謝料
function calcJibaiAfterEffectPain(grade) {
  if (!grade || grade === "none") return 0;
  return jibaiAfterPainTable[grade] || 0;
}

// 裁判所基準：傷害慰謝料（入通院）モデル
function calcCourtInjuryPain(treatmentDays, visitDays) {
  if (!treatmentDays || treatmentDays <= 0) return 0;
  const periodDays = treatmentDays;
  const months = periodDays / 30;
  const capMonth = Math.max(1, Math.min(6, months));

  const freq = (visitDays && treatmentDays) ? (visitDays / treatmentDays) : 0;
  let freqMultiplier = 0.8; // 中頻度
  if (freq >= 0.4) {
    freqMultiplier = 1.0; // 高頻度
  } else if (freq < 0.2) {
    freqMultiplier = 0.6; // 低頻度
  }

  const lowerMonth = Math.floor(capMonth);
  const upperMonth = Math.ceil(capMonth);
  const lowerBase = courtInjuryBaseTable[lowerMonth] || courtInjuryBaseTable[6];
  const upperBase = courtInjuryBaseTable[upperMonth] || (courtInjuryBaseTable[6] + (upperMonth - 6) * 30000);

  const t = capMonth - lowerMonth;
  const interpolated = lowerBase + (upperBase - lowerBase) * t;

  const amount = interpolated * freqMultiplier;
  return Math.round(amount);
}

// 裁判所基準：後遺障害慰謝料
function calcCourtAfterEffectPain(grade) {
  if (!grade || grade === "none") return 0;
  return courtAfterPainTable[grade] || 0;
}

// 等級から喪失率
function getLossRate(inputs) {
  if (inputs.lossRateOverride != null && inputs.lossRateOverride >= 0) {
    return inputs.lossRateOverride / 100;
  }
  const gradeKey = inputs.grade || "none";
  const preset = gradeLossPreset[gradeKey] || gradeLossPreset["none"];
  return (preset.rate || 0) / 100;
}

// 等級から喪失期間
function getLossYears(inputs) {
  if (inputs.lossYearsOverride != null && inputs.lossYearsOverride >= 0) {
    return inputs.lossYearsOverride;
  }
  const gradeKey = inputs.grade || "none";
  const preset = gradeLossPreset[gradeKey] || gradeLossPreset["none"];
  return preset.years || 0;
}

// ライプニッツ係数（利率3％）
function getLiapnizCoefficient(years, rate = 0.03) {
  if (!years || years <= 0) return 0;
  const n = years;
  const coeff = (1 - Math.pow(1 + rate, -n)) / rate;
  return coeff;
}

// 裁判所基準：逸失利益
function calcLostEarningsCourt(annualIncome, lossRate, lossYears) {
  if (!annualIncome || !lossRate || !lossYears) return 0;
  const coeff = getLiapnizCoefficient(lossYears, 0.03);
  const base = annualIncome * lossRate * coeff;
  return Math.round(base);
}

// 裁判所基準：休業損害
function calcCourtLostWages(dailyIncome, absenceDays) {
  if (!dailyIncome || !absenceDays) return 0;
  return dailyIncome * absenceDays;
}

// 過失相殺
function applyFault(total, fault) {
  if (!total || total <= 0) return 0;
  const f = !fault ? 0 : fault;
  return Math.max(0, Math.round(total * (1 - f)));
}

// 既払控除
function applyPaid(amount, alreadyPaid) {
  if (!amount || amount <= 0) return 0;
  const paid = alreadyPaid || 0;
  return Math.max(0, amount - paid);
}

// 構成比
function calcPercentageDistribution(parts) {
  const total = parts.injury + parts.after + parts.lost + parts.other;
  if (!total || total <= 0) {
    return {
      injury: "-",
      after: "-",
      lost: "-",
      other: "-"
    };
  }
  const pct = (v) => ((v / total) * 100).toFixed(1) + "%";
  return {
    injury: pct(parts.injury),
    after: pct(parts.after),
    lost: pct(parts.lost),
    other: pct(parts.other)
  };
}

// 結果表示更新
function updateResultDisplay(result) {
  // セクション表示
  document.getElementById("resultSection").classList.remove("hidden");
  document.getElementById("detailResults").classList.remove("hidden");

  // サマリー
  document.getElementById("courtNetAmount").textContent =
    result.court.afterPaid > 0 ? yenFormatter.format(result.court.afterPaid) : "¥0";
  document.getElementById("jibaiNetAmount").textContent =
    result.jibai.afterPaid > 0 ? yenFormatter.format(result.jibai.afterPaid) : "¥0";

  // 裁判所基準
  document.getElementById("courtInjuryPain").textContent = yenFormatter.format(result.court.injuryPain);
  document.getElementById("courtAfterPain").textContent = yenFormatter.format(result.court.afterPain);
  document.getElementById("courtLostEarnings").textContent = yenFormatter.format(result.court.lostEarnings);
  document.getElementById("courtLostWages").textContent = yenFormatter.format(result.court.lostWages);
  document.getElementById("courtOtherCosts").textContent = yenFormatter.format(result.court.otherCosts);
  document.getElementById("courtTotal").textContent = yenFormatter.format(result.court.total);
  document.getElementById("courtAfterFault").textContent = yenFormatter.format(result.court.afterFault);
  document.getElementById("courtAfterPaid").textContent = yenFormatter.format(result.court.afterPaid);

  document.getElementById("courtRatioInjury").textContent = result.court.ratios.injury;
  document.getElementById("courtRatioAfter").textContent = result.court.ratios.after;
  document.getElementById("courtRatioLostEarnings").textContent = result.court.ratios.lost;
  document.getElementById("courtRatioOther").textContent = result.court.ratios.other;

  // 自賠責
  document.getElementById("jibaiInjuryPain").textContent = yenFormatter.format(result.jibai.injuryPain);
  document.getElementById("jibaiAfterPain").textContent = yenFormatter.format(result.jibai.afterPain);
  document.getElementById("jibaiLostWages").textContent = yenFormatter.format(result.jibai.lostWages);
  document.getElementById("jibaiOtherCosts").textContent = yenFormatter.format(result.jibai.otherCosts);
  document.getElementById("jibaiTotal").textContent = yenFormatter.format(result.jibai.total);
  document.getElementById("jibaiAfterFault").textContent = yenFormatter.format(result.jibai.afterFault);
  document.getElementById("jibaiAfterPaid").textContent = yenFormatter.format(result.jibai.afterPaid);

  const capText = (() => {
    const total = result.jibai.total;
    if (total <= 0) return "–";
    if (total <= result.jibai.cap) {
      return `総損害額は傷害120万円枠の範囲内（残り約 ${yenFormatter.format(result.jibai.cap - total)}）`;
    } else {
      return `総損害額は傷害120万円枠を約 ${yenFormatter.format(total - result.jibai.cap)} 超過`;
    }
  })();
  document.getElementById("jibaiCapInfo").textContent = capText;
}
