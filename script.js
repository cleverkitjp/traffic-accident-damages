// 日本円フォーマット
const yenFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

// localStorageキー
const LS_KEY_INPUTS = "trafficAccidentCalcLastInputsV1";

// 等級ごとの典型的な喪失率・喪失期間（モデル値）
const gradeLossPreset = {
  none: { rate: 0, years: 0 },
  "14": { rate: 5, years: 5 },
  "13": { rate: 9, years: 7 },
  "12": { rate: 14, years: 10 },
  "11": { rate: 20, years: 15 },
  "10": { rate: 27, years: 17 },
  "9": { rate: 35, years: 20 },
  "8": { rate: 45, years: 22 },
  "7": { rate: 56, years: 27 },
  "6": { rate: 67, years: 30 },
  "5": { rate: 79, years: 32 },
  "4": { rate: 79, years: 34 },
  "3": { rate: 100, years: 35 },
  "2": { rate: 100, years: 40 },
  "1": { rate: 100, years: 45 }
};

// 自賠責の後遺障害慰謝料（モデル値）
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

// 直近の計算結果・入力を保持（サマリー生成用）
let lastInputs = null;
let lastResult = null;

// シナリオA/B（現在の計算結果をスナップショット保存）
let scenarioA = null;
let scenarioB = null;

document.addEventListener("DOMContentLoaded", () => {
  const gradeEl = document.getElementById("grade");
  const lossRateEl = document.getElementById("lossRate");
  const lossYearsEl = document.getElementById("lossYears");
  const incomePresetEl = document.getElementById("incomePreset");
  const annualIncomeEl = document.getElementById("annualIncome");
  const calcButton = document.getElementById("calcButton");
  const toggleAdvancedBtn = document.getElementById("toggleAdvanced");
  const advancedSection = document.getElementById("advancedSection");
  const restoreButton = document.getElementById("restoreButton");
  const restoreStatus = document.getElementById("restoreStatus");
  const copySummaryButton = document.getElementById("copySummaryButton");
  const copySummaryStatus = document.getElementById("copySummaryStatus");
  const delayTodayButton = document.getElementById("delayTodayButton");
  const delayCalcButton = document.getElementById("delayCalcButton");
  const delayCalcStatus = document.getElementById("delayCalcStatus");
  const saveScenarioAButton = document.getElementById("saveScenarioA");
  const saveScenarioBButton = document.getElementById("saveScenarioB");
  const showScenarioButton = document.getElementById("showScenario");
  const scenarioStatus = document.getElementById("scenarioStatus");

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
      // グローバルに保存（サマリー・遅延損害金・シナリオ用）
      lastInputs = inputs;
      lastResult = result;
      // localStorage に保存
      saveInputsToStorage(inputs);
      updateResultDisplay(result);
      restoreStatus.textContent = ""; // 計算後は復元メッセージをクリア
    }
  });

  // 前回入力復元
  restoreButton.addEventListener("click", () => {
    const loaded = loadInputsFromStorage();
    if (!loaded) {
      restoreStatus.textContent = "保存された前回の入力はありません。";
      return;
    }
    applyInputsToForm(loaded);
    restoreStatus.textContent = "前回の入力をフォームに復元しました。";
  });

  // サマリーをコピー
  copySummaryButton.addEventListener("click", async () => {
    copySummaryStatus.textContent = "";
    if (!lastInputs || !lastResult) {
      copySummaryStatus.textContent = "先に「損害額を計算する」を実行してください。";
      return;
    }
    const text = buildSummaryText(lastInputs, lastResult);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copySummaryStatus.textContent = "サマリーをクリップボードにコピーしました。";
      } else {
        // クリップボードAPIがない環境向けフォールバック
        fallbackCopyText(text);
        copySummaryStatus.textContent = "サマリーを選択状態にしました。必要に応じてコピーしてください。";
      }
    } catch (_e) {
      copySummaryStatus.textContent = "コピーに失敗しました。環境によっては対応していない場合があります。";
    }
  });

  // 遅延損害金：支払日に本日をセット
  delayTodayButton.addEventListener("click", () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    document.getElementById("delayPayDate").value = iso;
  });

  // 遅延損害金計算
  delayCalcButton.addEventListener("click", () => {
    const delayErrorBox = document.getElementById("delayError");
    const delayResult = document.getElementById("delayResult");

    // クリックされたことを即座に表示
    if (delayCalcStatus) {
      delayCalcStatus.textContent = "遅延損害金の計算を実行中です…";
    }

    delayErrorBox.style.display = "none";
    delayErrorBox.textContent = "";
    delayResult.textContent = "";

    const baseAmount = toNumberOrNull(document.getElementById("delayBaseAmount").value);
    const rate = toNumberOrNull(document.getElementById("delayRate").value);
    const accidentDateStr = document.getElementById("accidentDate").value;
    const payDateStr = document.getElementById("delayPayDate").value;

    const errors = [];
    if (!baseAmount || baseAmount <= 0) {
      errors.push("遅延損害金の対象額（円）を0より大きい値で入力してください。");
    }
    if (!rate || rate < 0) {
      errors.push("年利（％）を0以上の数値で入力してください。");
    }
    if (!accidentDateStr) {
      errors.push("事故日が未入力のため、遅延損害金を計算できません。Step1で事故日を入力してください。");
    }
    if (!payDateStr) {
      errors.push("支払日（または和解日）を入力してください。");
    }

    if (errors.length > 0) {
      delayErrorBox.style.display = "block";
      delayErrorBox.innerHTML = errors.map((e) => `<div>・${e}</div>`).join("");
      if (delayCalcStatus) {
        delayCalcStatus.textContent = "入力エラーのため、遅延損害金を計算できませんでした。";
      }
      return;
    }

    const diff = calcDelayDamages(baseAmount, accidentDateStr, payDateStr, rate);
    if (diff.error) {
      delayErrorBox.style.display = "block";
      delayErrorBox.innerHTML = `<div>・${diff.error}</div>`;
      if (delayCalcStatus) {
        delayCalcStatus.textContent = "エラーにより、遅延損害金を計算できませんでした。";
      }
      return;
    }

    delayResult.textContent =
      `事故日から支払日までの経過日数は約 ${diff.days} 日、年利${rate.toFixed(1)}％での遅延損害金は概ね `
      + `${yenFormatter.format(diff.amount)} 程度です。`;

    if (delayCalcStatus) {
      delayCalcStatus.textContent = "遅延損害金の計算が完了しました。";
    }
  });

  // シナリオAとして保存
  saveScenarioAButton.addEventListener("click", () => {
    scenarioStatus.textContent = "";
    if (!lastInputs || !lastResult) {
      scenarioStatus.textContent = "先に「損害額を計算する」を実行してからシナリオAを保存してください。";
      return;
    }
    scenarioA = {
      inputs: structuredCloneSafe(lastInputs),
      result: structuredCloneSafe(lastResult)
    };
    scenarioStatus.textContent = "現在の計算結果をシナリオAとして保存しました。";
    updateScenarioCompareDisplay();
  });

  // シナリオBとして保存
  saveScenarioBButton.addEventListener("click", () => {
    scenarioStatus.textContent = "";
    if (!lastInputs || !lastResult) {
      scenarioStatus.textContent = "先に「損害額を計算する」を実行してからシナリオBを保存してください。";
      return;
    }
    scenarioB = {
      inputs: structuredCloneSafe(lastInputs),
      result: structuredCloneSafe(lastResult)
    };
    scenarioStatus.textContent = "現在の計算結果をシナリオBとして保存しました。";
    updateScenarioCompareDisplay();
  });

  // シナリオ比較表示／更新
  showScenarioButton.addEventListener("click", () => {
    if (!scenarioA && !scenarioB) {
      scenarioStatus.textContent = "シナリオA/Bのいずれも保存されていません。先に保存してください。";
      return;
    }
    scenarioStatus.textContent = "シナリオ比較を更新しました。";
    updateScenarioCompareDisplay(true);
  });
});

// 共通：文字列→数値
function toNumberOrNull(v) {
  if (v == null) return null;
  const trimmed = String(v).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

// 入力取得
function parseInputs() {
  const intOrNullInput = (id) => {
    const v = document.getElementById(id).value.trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const grade = document.getElementById("grade").value;
  const lossRateOverride = intOrNullInput("lossRate");
  const lossYearsOverride = (() => {
    const v = document.getElementById("lossYears").value.trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  })();

  const treatmentDays = intOrNullInput("treatmentDays");
  const visitDays = intOrNullInput("visitDays");
  const dailyIncome = intOrNullInput("dailyIncome");
  const absenceDays = intOrNullInput("absenceDays");
  const otherCosts = intOrNullInput("otherCosts") ?? 0;
  const annualIncome = intOrNullInput("annualIncome");
  const faultPercent = intOrNullInput("faultPercent");
  const alreadyPaid = intOrNullInput("alreadyPaid") ?? 0;
  const accidentDate = document.getElementById("accidentDate").value || null;

  return {
    treatmentDays,
    visitDays,
    dailyIncome,
    absenceDays,
    otherCosts,
    grade,
    lossRateOverride,
    lossYearsOverride,
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
  const jibaiOtherCosts = inputs.otherCosts;

  const jibaiTotalGross = jibaiInjuryPain + jibaiLostWages + jibaiAfterPain + jibaiOtherCosts;
  const jibaiAfterFault = applyFault(jibaiTotalGross, fault);
  const jibaiAfterPaid = applyPaid(jibaiAfterFault, inputs.alreadyPaid);
  const jibaiCap = 1200000; // 傷害120万円枠

  // 裁判所基準モデル
  const courtInjuryPain = calcCourtInjuryPain(inputs.treatmentDays, inputs.visitDays);
  const courtAfterPain = calcCourtAfterEffectPain(inputs.grade);
  const lossRate = getLossRate(inputs);
  const lossYears = getLossYears(inputs);
  const courtLostEarnings = calcLostEarningsCourt(inputs.annualIncome, lossRate, lossYears);
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
      ratios,
      lossRate,
      lossYears
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
  document.getElementById("resultSection").classList.remove("hidden");
  document.getElementById("detailResults").classList.remove("hidden");

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

// localStorage 保存
function saveInputsToStorage(inputs) {
  try {
    const json = JSON.stringify(inputs);
    localStorage.setItem(LS_KEY_INPUTS, json);
  } catch (_e) {
    // 何もしない（ストレージが使えない環境）
  }
}

// localStorage 読み込み
function loadInputsFromStorage() {
  try {
    const json = localStorage.getItem(LS_KEY_INPUTS);
    if (!json) return null;
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch (_e) {
    return null;
  }
}

// 保存された入力をフォームに反映
function applyInputsToForm(inputs) {
  const setValue = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (v === null || v === undefined) {
      el.value = "";
    } else {
      el.value = String(v);
    }
  };

  setValue("treatmentDays", inputs.treatmentDays);
  setValue("visitDays", inputs.visitDays);
  setValue("dailyIncome", inputs.dailyIncome);
  setValue("absenceDays", inputs.absenceDays);
  setValue("otherCosts", inputs.otherCosts);
  setValue("annualIncome", inputs.annualIncome);
  setValue("faultPercent", inputs.faultPercent);
  setValue("alreadyPaid", inputs.alreadyPaid);
  setValue("accidentDate", inputs.accidentDate || "");

  const gradeEl = document.getElementById("grade");
  if (gradeEl) gradeEl.value = inputs.grade || "";

  // 詳細設定（喪失率・期間）も復元
  const lossRateEl = document.getElementById("lossRate");
  const lossYearsEl = document.getElementById("lossYears");
  if (lossRateEl) {
    lossRateEl.value =
      inputs.lossRateOverride != null ? String(inputs.lossRateOverride) : "";
  }
  if (lossYearsEl) {
    lossYearsEl.value =
      inputs.lossYearsOverride != null ? String(inputs.lossYearsOverride) : "";
  }
}

// シンプルなディープコピー（structuredClone が使えない環境向けフォールバック付き）
function structuredCloneSafe(obj) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(obj);
    }
  } catch (_e) {
    // ignore
  }
  return JSON.parse(JSON.stringify(obj));
}

// シナリオ比較表示更新
function updateScenarioCompareDisplay(forceShow = false) {
  const container = document.getElementById("scenarioCompare");
  const aLabelEl = document.getElementById("scenarioALabel");
  const bLabelEl = document.getElementById("scenarioBLabel");

  const courtNetA = document.getElementById("scenarioCourtNetA");
  const courtNetB = document.getElementById("scenarioCourtNetB");
  const jibaiNetA = document.getElementById("scenarioJibaiNetA");
  const jibaiNetB = document.getElementById("scenarioJibaiNetB");
  const courtTotalA = document.getElementById("scenarioCourtTotalA");
  const courtTotalB = document.getElementById("scenarioCourtTotalB");
  const jibaiTotalA = document.getElementById("scenarioJibaiTotalA");
  const jibaiTotalB = document.getElementById("scenarioJibaiTotalB");

  // 保存されていない側は「未保存」と表示
  if (!scenarioA) {
    aLabelEl.textContent = "未保存";
    courtNetA.textContent = "–";
    jibaiNetA.textContent = "–";
    courtTotalA.textContent = "–";
    jibaiTotalA.textContent = "–";
  } else {
    aLabelEl.textContent = buildScenarioTag(scenarioA.inputs);
    courtNetA.textContent = yenFormatter.format(scenarioA.result.court.afterPaid);
    jibaiNetA.textContent = yenFormatter.format(scenarioA.result.jibai.afterPaid);
    courtTotalA.textContent = yenFormatter.format(scenarioA.result.court.total);
    jibaiTotalA.textContent = yenFormatter.format(scenarioA.result.jibai.total);
  }

  if (!scenarioB) {
    bLabelEl.textContent = "未保存";
    courtNetB.textContent = "–";
    jibaiNetB.textContent = "–";
    courtTotalB.textContent = "–";
    jibaiTotalB.textContent = "–";
  } else {
    bLabelEl.textContent = buildScenarioTag(scenarioB.inputs);
    courtNetB.textContent = yenFormatter.format(scenarioB.result.court.afterPaid);
    jibaiNetB.textContent = yenFormatter.format(scenarioB.result.jibai.afterPaid);
    courtTotalB.textContent = yenFormatter.format(scenarioB.result.court.total);
    jibaiTotalB.textContent = yenFormatter.format(scenarioB.result.jibai.total);
  }

  // どちらか一方でも登録があれば表示
  if ((scenarioA || scenarioB) && container) {
    container.classList.remove("hidden");
  } else if (forceShow) {
    container.classList.add("hidden");
  }
}

// シナリオラベル（等級・過失・基礎収入等のタグ文字列）
function buildScenarioTag(inputs) {
  const gradeLabel = (() => {
    if (!inputs.grade || inputs.grade === "none") return "等級：非該当";
    return "等級：" + inputs.grade + "級";
  })();

  const faultLabel =
    inputs.faultPercent != null ? `過失：${inputs.faultPercent}％` : "過失：-";

  const incomeLabel =
    inputs.annualIncome != null
      ? `基礎収入：${yenFormatter.format(inputs.annualIncome)}／年`
      : "基礎収入：-";

  return `${gradeLabel} ／ ${faultLabel} ／ ${incomeLabel}`;
}

// サマリーテキスト生成
function buildSummaryText(inputs, result) {
  const gradeLabel = (() => {
    if (!inputs.grade || inputs.grade === "none") return "非該当";
    return inputs.grade + "級";
  })();

  const baseLines = [];

  baseLines.push("事案メモ（概算試算）");
  baseLines.push("");
  baseLines.push(`・治療期間：${inputs.treatmentDays ?? "-"}日（実通院${inputs.visitDays ?? "-"}日）`);
  baseLines.push(`・後遺障害等級：${gradeLabel}`);
  baseLines.push(`・基礎収入：${inputs.annualIncome ? yenFormatter.format(inputs.annualIncome) + "／年" : "-"}`);
  baseLines.push(`・被害者側過失割合：${inputs.faultPercent != null ? inputs.faultPercent + "％" : "-"}`);
  baseLines.push(`・既払金合計：${yenFormatter.format(inputs.alreadyPaid ?? 0)}`);
  if (inputs.accidentDate) {
    baseLines.push(`・事故日：${inputs.accidentDate}`);
  }
  baseLines.push("");

  // 裁判所基準
  baseLines.push("【裁判所基準モデル】");
  baseLines.push(`・総損害額（過失・既払前）：${yenFormatter.format(result.court.total)}`);
  baseLines.push(`・過失相殺後：${yenFormatter.format(result.court.afterFault)}`);
  baseLines.push(`・既払控除後（受取想定）：${yenFormatter.format(result.court.afterPaid)}`);
  baseLines.push(
    `・内訳：傷害慰謝料 ${yenFormatter.format(result.court.injuryPain)} / `
    + `後遺障害慰謝料 ${yenFormatter.format(result.court.afterPain)} / `
    + `逸失利益 ${yenFormatter.format(result.court.lostEarnings)} / `
    + `休業損害 ${yenFormatter.format(result.court.lostWages)} / `
    + `その他 ${yenFormatter.format(result.court.otherCosts)}`
  );
  baseLines.push("");

  // 自賠責基準
  baseLines.push("【自賠責基準】");
  baseLines.push(`・総損害額（過失・既払前）：${yenFormatter.format(result.jibai.total)}`);
  baseLines.push(`・過失相殺後：${yenFormatter.format(result.jibai.afterFault)}`);
  baseLines.push(`・既払控除後（受取想定）：${yenFormatter.format(result.jibai.afterPaid)}`);
  baseLines.push(
    `・内訳：傷害慰謝料 ${yenFormatter.format(result.jibai.injuryPain)} / `
    + `後遺障害慰謝料 ${yenFormatter.format(result.jibai.afterPain)} / `
    + `休業損害 ${yenFormatter.format(result.jibai.lostWages)} / `
    + `その他 ${yenFormatter.format(result.jibai.otherCosts)}`
  );
  baseLines.push("");

  baseLines.push("※本試算は一般的な算式・公開目安に基づく概算であり、実際の和解額を保証するものではありません。");

  return baseLines.join("\n");
}

// クリップボードAPI非対応環境向けフォールバック
function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } catch (_e) {
    // 失敗しても特に何もしない
  } finally {
    document.body.removeChild(textarea);
  }
}

// 遅延損害金計算
function calcDelayDamages(baseAmount, startDateStr, endDateStr, ratePercent) {
  try {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { error: "日付の形式が不正です。" };
    }
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0) {
      return { error: "支払日が事故日より前になっています。日付を確認してください。" };
    }
    const rate = ratePercent / 100;
    const amount = Math.round(baseAmount * rate * (diffDays / 365));
    return { amount, days: Math.round(diffDays) };
  } catch (_e) {
    return { error: "遅延損害金の計算中にエラーが発生しました。" };
  }
}
