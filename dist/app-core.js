(() => {
  "use strict";

  const JT_LOCAL_RATE_PROVINCES = new Set(["河北省", "天津"]);
  const JT_HIGH_RATE_PROVINCES = new Set([
    "四川省", "重庆", "云南省", "贵州省", "广西壮族自治区", "甘肃省", "宁夏回族自治区",
  ]);
  const JT_SMALL_REMOTE_PROVINCES = new Set([...JT_HIGH_RATE_PROVINCES, "内蒙古自治区"]);
  const JT_CITY_SURCHARGE_PROVINCES = new Set(["北京", "上海"]);
  const JT_MANUAL_PROVINCES = new Set(["辽宁省", "吉林省"]);
  const JT_DIRECT_REMOTE_RATES = new Map([
    ["青海省", { first: 9, lightExtra: 6, heavyRate: 4.5 }],
    ["海南省", { first: 12, lightExtra: 6, heavyRate: 5 }],
    ["新疆维吾尔自治区", { first: 18, lightExtra: 9, heavyRate: 6.5 }],
    ["西藏自治区", { first: 18, lightExtra: 9, heavyRate: 6.5 }],
  ]);
  const JT_TRANSFER_ROUTES = new Map([
    ["青海省", { via: "陕西咸阳", rateProvince: "陕西省" }],
    ["新疆维吾尔自治区", { via: "陕西咸阳", rateProvince: "陕西省" }],
    ["西藏自治区", { via: "四川", rateProvince: "四川省" }],
    ["香港特别行政区", { via: "广东珠海", rateProvince: "广东省", transferOnly: true }],
  ]);

  const SF_RATES = new Map([
    ["安徽省", [17, 0.85]], ["北京", [19, 0.95]], ["福建省", [21, 0.95]],
    ["甘肃省", [21, 0.95]], ["广东省", [19, 0.95]], ["广西壮族自治区", [21, 0.95]],
    ["贵州省", [21, 1.05]], ["海南省", [27, 1.27]], ["河北省", [14, 0.65]],
    ["河南省", [16, 0.75]], ["黑龙江省", [26, 1.06]], ["湖北省", [18, 0.9]],
    ["湖南省", [21, 1.05]], ["吉林省", [21, 1.05]], ["江苏省", [16.6, 0.83]],
    ["江西省", [19, 0.95]], ["辽宁省", [19.4, 0.97]], ["内蒙古自治区", [26, 1.05]],
    ["宁夏回族自治区", [19.6, 0.98]], ["青海省", [29, 1.2]], ["山东省", [16, 0.78]],
    ["山西省", [15, 0.75]], ["陕西省", [19, 0.95]], ["上海", [18, 0.9]],
    ["四川省", [21, 0.96]], ["天津", [15.6, 0.78]], ["新疆维吾尔自治区", [78, 3.4]],
    ["云南省", [29, 1.34]], ["浙江省", [17.2, 0.86]], ["重庆", [21, 0.95]],
  ]);
  const SF_UNVERIFIED_PROVINCES = new Set(["吉林省", "宁夏回族自治区", "新疆维吾尔自治区"]);

  const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const roundYuan = (value) => Math.round(value + 1e-9);
  const formatMoney = (value) => `¥${Number(value).toFixed(2)}`;
  const formatWeight = (value) => Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

  function validateInput(province, actualWeight) {
    const weight = Number(actualWeight);
    if (!province) return { error: "请选择收件省份" };
    if (!Number.isFinite(weight) || weight <= 0) return { error: "请输入大于0的重量" };
    return { weight };
  }

  function calculateJTDirectQuote(province, billableWeight) {
    const rate = JT_DIRECT_REMOTE_RATES.get(province);
    if (!rate) return null;
    let totalCost;
    let formulaText;
    if (billableWeight <= 1) {
      totalCost = rate.first;
      formulaText = `首1kg ${formatMoney(rate.first)}`;
    } else if (billableWeight <= 10) {
      totalCost = rate.first + (billableWeight - 1) * rate.lightExtra;
      formulaText = `${formatMoney(rate.first)} ＋ ${billableWeight - 1}kg × ${formatMoney(rate.lightExtra)}`;
    } else {
      totalCost = billableWeight * rate.heavyRate + 4;
      formulaText = `${billableWeight}kg × ${formatMoney(rate.heavyRate)} ＋ 面单 ${formatMoney(4)}`;
    }
    return {
      province,
      billableWeight,
      totalCost: roundMoney(totalCost),
      formulaText,
      pricingTier: billableWeight <= 10 ? "极兔报价单 · 1–10kg档" : "极兔报价单 · 10kg以上档",
    };
  }

  function calculateJTShipping(province, actualWeight) {
    const input = validateInput(province, actualWeight);
    if (input.error) return input;

    const billableWeight = Math.ceil(input.weight);
    const transferRoute = JT_TRANSFER_ROUTES.get(province);
    const directQuote = calculateJTDirectQuote(province, billableWeight);

    if (transferRoute) {
      const transferResult = calculateJTShipping(transferRoute.rateProvince, input.weight);
      return {
        ...transferResult,
        province,
        destinationProvince: province,
        transfer: true,
        transferOnly: Boolean(transferRoute.transferOnly),
        transferRoute,
        directQuote,
        pricingTier: `${transferRoute.via}中转 · ${transferResult.pricingTier}`,
      };
    }

    if (directQuote) {
      return {
        carrier: "jt",
        carrierName: "极兔",
        province,
        actualWeight: input.weight,
        billableWeight,
        baseFee: directQuote.totalCost,
        cityFee: 0,
        remoteFee: 0,
        transportFee: 0,
        totalCost: directQuote.totalCost,
        labelCredit: 0,
        monthlyDue: directQuote.totalCost,
        pricingTier: directQuote.pricingTier,
        directOnly: true,
        quoteOnly: true,
        directQuote,
      };
    }
    let baseFee;
    let pricingTier;

    if (billableWeight <= 1) {
      baseFee = 3;
      pricingTier = "1kg档";
    } else if (billableWeight <= 2) {
      baseFee = 4;
      pricingTier = "2kg档";
    } else if (billableWeight <= 3) {
      baseFee = 5;
      pricingTier = "3kg档";
    } else if (billableWeight <= 5) {
      baseFee = 7.5;
      pricingTier = "4–5kg档";
    } else if (JT_LOCAL_RATE_PROVINCES.has(province)) {
      baseFee = 4 + billableWeight;
      pricingTier = "大件Ⅰ档 · 1.00元/kg＋4元";
    } else if (JT_HIGH_RATE_PROVINCES.has(province)) {
      baseFee = 4 + billableWeight * 1.7;
      pricingTier = "大件Ⅲ档 · 1.70元/kg＋4元";
    } else {
      baseFee = 4 + billableWeight * 1.2;
      pricingTier = "大件Ⅱ档 · 1.20元/kg＋4元";
    }

    const cityFee = JT_CITY_SURCHARGE_PROVINCES.has(province) && billableWeight <= 5 ? 1 : 0;
    const remoteFee = JT_SMALL_REMOTE_PROVINCES.has(province) && billableWeight <= 3 ? 0.5 : 0;
    const transportFee = billableWeight <= 3 ? 0.05 : 0.05 + billableWeight * 0.02;
    const totalCost = roundMoney(baseFee + cityFee + remoteFee + transportFee);
    const labelCredit = 3.5;

    return {
      carrier: "jt",
      carrierName: "极兔",
      province,
      actualWeight: input.weight,
      billableWeight,
      baseFee: roundMoney(baseFee),
      cityFee: roundMoney(cityFee),
      remoteFee: roundMoney(remoteFee),
      transportFee: roundMoney(transportFee),
      totalCost,
      labelCredit,
      monthlyDue: roundMoney(totalCost - labelCredit),
      pricingTier,
      manual: JT_MANUAL_PROVINCES.has(province),
      inferredLargeRate: province === "吉林省" && billableWeight > 5,
    };
  }

  function calculateSFShipping(province, actualWeight) {
    const input = validateInput(province, actualWeight);
    if (input.error) return input;
    const rate = SF_RATES.get(province);
    if (!rate) {
      return { carrier: "sf", carrierName: "顺丰", unavailable: true, province };
    }

    const [firstPrice, extraRate] = rate;
    const billableWeight = Math.max(input.weight, 20);
    const rawMainFee = firstPrice + Math.max(billableWeight - 20, 0) * extraRate;
    const mainFee = roundYuan(rawMainFee);
    const serviceFee = 1.1;
    const totalCost = roundMoney(mainFee + serviceFee);

    return {
      carrier: "sf",
      carrierName: "顺丰",
      province,
      actualWeight: input.weight,
      billableWeight,
      firstPrice,
      extraRate,
      rawMainFee: roundMoney(rawMainFee),
      mainFee,
      serviceFee,
      totalCost,
      pricingTier: `首20kg ${firstPrice.toFixed(2)}元 · 续重 ${extraRate.toFixed(2)}元/kg`,
      unverifiedProvince: SF_UNVERIFIED_PROVINCES.has(province),
    };
  }

  function calculateQuote(carrier, province, actualWeight) {
    return carrier === "sf"
      ? calculateSFShipping(province, actualWeight)
      : calculateJTShipping(province, actualWeight);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { calculateJTShipping, calculateSFShipping, calculateQuote };
  }

  if (typeof document === "undefined") return;

  const form = document.getElementById("shipping-form");
  const courierInputs = Array.from(document.querySelectorAll('input[name="courier"]'));
  const provinceInput = document.getElementById("province");
  const weightInput = document.getElementById("weight");
  const resultContent = document.getElementById("result-content");
  const unavailableState = document.getElementById("unavailable-state");
  const policyCard = document.getElementById("policy-card");
  const policyTitle = document.getElementById("policy-title");
  const policyText = document.getElementById("policy-text");

  const currentCourier = () => courierInputs.find((input) => input.checked)?.value || "jt";
  const show = (id, visible) => { document.getElementById(id).hidden = !visible; };

  function setInterfaceCopy(carrier) {
    const isSF = carrier === "sf";
    document.getElementById("brand-mark").textContent = isSF ? "SF" : "JT";
    document.getElementById("verified-text").textContent = isSF ? "顺丰250票主运费已核对" : "极兔5–6月账单已核对";
    document.getElementById("form-description").textContent = isSF
      ? "顺丰干配最低按20kg计费，对账请填写结算重量。"
      : "极兔不足1kg按1kg向上取整。";
    document.getElementById("weight-label").textContent = isSF ? "结算重量" : "实际重量";
    document.getElementById("weight-hint").textContent = isSF
      ? "20kg以内按首重价；超过20kg按省份续重单价计算。"
      : "例如输入2.32kg，极兔按3kg计费。";
    document.getElementById("rule-version").textContent = isSF
      ? "顺丰规则：2026年6–9月干配订单"
      : "极兔规则：2026年5–6月账单";
  }

  function setPolicy(result) {
    policyCard.classList.remove("manual", "unavailable");
    const icon = policyCard.querySelector(".policy-icon");

    if (result.unavailable) {
      policyCard.classList.add("unavailable");
      icon.textContent = "×";
      policyTitle.textContent = "暂无报价";
      policyText.textContent = result.carrier === "sf"
        ? "顺丰报价表没有该地区价格，请联系确认。"
        : "该地区暂时没有可用报价。";
      return;
    }

    if (result.carrier === "sf" && result.unverifiedProvince) {
      policyCard.classList.add("manual");
      icon.textContent = "!";
      policyTitle.textContent = "报价表有价格，暂无账单样本";
      policyText.textContent = "吉林、宁夏、新疆在本批250票中没有订单，发货前建议确认。";
      return;
    }

    if (result.carrier === "jt" && result.transfer) {
      policyCard.classList.add("manual");
      icon.textContent = "↔";
      if (result.transferOnly) {
        policyTitle.textContent = `仅走${result.transferRoute.via}中转`;
        policyText.textContent = `目的地按${result.transferRoute.rateProvince}账单价格计算，没有极兔直发报价。`;
      } else {
        policyTitle.textContent = `走${result.transferRoute.via}中转`;
        policyText.textContent = `主价格按${result.transferRoute.rateProvince}计算，下方同时显示极兔直发报价单。`;
      }
      return;
    }

    if (result.carrier === "jt" && result.directOnly) {
      policyCard.classList.add("manual");
      icon.textContent = "直";
      policyTitle.textContent = "无中转路线";
      policyText.textContent = "海南仅按极兔原始报价单计算，暂无后续账单样本验证。";
      return;
    }

    if (result.carrier === "jt" && result.manual) {
      policyCard.classList.add("manual");
      icon.textContent = "!";
      policyTitle.textContent = "需联系确认地址";
      policyText.textContent = result.inferredLargeRate
        ? "吉林6kg以上暂无账单样本，当前按同组规则估算。"
        : "费用可计算，但下单前需要消费者联系确认地址。";
      return;
    }

    icon.textContent = "✓";
    policyTitle.textContent = result.carrier === "sf" ? "主运费已核对" : "可直接下单";
    policyText.textContent = result.carrier === "sf"
      ? "主运费公式逐票匹配；少数订单可能另有未注明附加费。"
      : "该省份按已确认账单规则计费。";
  }

  function renderUnavailable(result) {
    resultContent.hidden = true;
    unavailableState.hidden = false;
    document.getElementById("unavailable-title").textContent = `${result.carrierName}发往${result.province}暂无报价`;
    document.getElementById("unavailable-text").textContent = result.carrier === "sf"
      ? "顺丰报价表未列出该地区。请在发货前联系顺丰确认价格。"
      : "该地区暂时没有可用报价，请联系网点确认。";
  }

  function renderJT(result) {
    show("row-city", true);
    show("row-remote", true);
    show("row-transport", true);
    show("row-service", false);
    show("row-extra", false);
    document.getElementById("base-label").textContent = "基础运费";
    document.getElementById("base-fee").textContent = formatMoney(result.baseFee);
    document.getElementById("city-fee").textContent = formatMoney(result.cityFee);
    document.getElementById("remote-fee").textContent = formatMoney(result.remoteFee);
    document.getElementById("transport-fee").textContent = formatMoney(result.transportFee);
    if (result.transfer) {
      document.getElementById("amount-note").textContent = `${result.transferRoute.via}中转，按${result.transferRoute.rateProvince}账单价；月结补交 ${formatMoney(result.monthlyDue)}`;
      if (result.directQuote) {
        document.getElementById("settlement-title").textContent = "极兔直发报价单";
        document.getElementById("settlement-hint").textContent = "原始报价，暂无实际账单验证";
        document.getElementById("settlement-value").textContent = formatMoney(result.directQuote.totalCost);
      } else {
        document.getElementById("settlement-title").textContent = "报价类型";
        document.getElementById("settlement-hint").textContent = `仅支持${result.transferRoute.via}中转`;
        document.getElementById("settlement-value").textContent = "中转价";
      }
    } else if (result.directOnly) {
      document.getElementById("amount-note").textContent = "极兔原始报价单价格，未走中转";
      document.getElementById("settlement-title").textContent = "报价类型";
      document.getElementById("settlement-hint").textContent = "海南没有中转路线";
      document.getElementById("settlement-value").textContent = "直发价";
    } else {
      document.getElementById("amount-note").textContent = "这是极兔本票完整运费";
      document.getElementById("settlement-title").textContent = "月结账单还需补交";
      document.getElementById("settlement-hint").textContent = "已冲减每票3.50元面单金额";
      document.getElementById("settlement-value").textContent = result.monthlyDue < 0
        ? `抵扣 ${formatMoney(Math.abs(result.monthlyDue))}`
        : formatMoney(result.monthlyDue);
    }
    const pieces = [`基础运费 ${formatMoney(result.baseFee)}`];
    if (result.cityFee) pieces.push(`北京／上海加收 ${formatMoney(result.cityFee)}`);
    if (result.remoteFee) pieces.push(`偏远加收 ${formatMoney(result.remoteFee)}`);
    if (result.transportFee) pieces.push(`运输加收 ${formatMoney(result.transportFee)}`);
    if (result.transfer) pieces.unshift(`${result.transferRoute.via}中转`);
    if (result.directOnly) pieces.unshift("极兔报价单直发价");
    if (result.directQuote && result.transfer) pieces.push(`直发报价 ${formatMoney(result.directQuote.totalCost)}`);
    document.getElementById("calculation-note").querySelector("p").textContent = pieces.join(" ＋ ");
  }

  function renderSF(result) {
    show("row-city", false);
    show("row-remote", false);
    show("row-transport", false);
    show("row-service", true);
    show("row-extra", true);
    document.getElementById("base-label").textContent = "主运费";
    document.getElementById("base-fee").textContent = formatMoney(result.mainFee);
    document.getElementById("service-fee").textContent = formatMoney(result.serviceFee);
    document.getElementById("amount-note").textContent = "含每票1.10元信息服务费；未知附加费未计入";
    document.getElementById("settlement-title").textContent = "计费规则";
    document.getElementById("settlement-hint").textContent = "最低20kg，主运费最后四舍五入到整数元";
    document.getElementById("settlement-value").textContent = "20kg起";
    const extraWeight = Math.max(result.billableWeight - 20, 0);
    document.getElementById("calculation-note").querySelector("p").textContent = extraWeight
      ? `首20kg ${formatMoney(result.firstPrice)} ＋ ${formatWeight(extraWeight)}kg × ${formatMoney(result.extraRate)}，主运费取整后再加服务费 ${formatMoney(result.serviceFee)}`
      : `首20kg ${formatMoney(result.firstPrice)}，主运费取整后再加服务费 ${formatMoney(result.serviceFee)}`;
  }

  function renderResult(result) {
    unavailableState.hidden = true;
    resultContent.hidden = false;
    document.getElementById("route-title").textContent = `${result.carrierName}发往${result.province}`;
    document.getElementById("billable-weight").textContent = `计费${formatWeight(result.billableWeight)}kg`;
    document.getElementById("total-cost").innerHTML = `<span>¥</span>${result.totalCost.toFixed(2)}`;
    document.getElementById("breakdown-total").textContent = formatMoney(result.totalCost);
    document.getElementById("pricing-tier").textContent = result.pricingTier;
    if (result.carrier === "sf") renderSF(result);
    else renderJT(result);
  }

  function calculateAndRender() {
    const carrier = currentCourier();
    setInterfaceCopy(carrier);
    const result = calculateQuote(carrier, provinceInput.value, weightInput.value);
    if (result.error) {
      weightInput.setCustomValidity(result.error);
      weightInput.reportValidity();
      return result;
    }
    weightInput.setCustomValidity("");
    setPolicy(result);
    if (result.unavailable) renderUnavailable(result);
    else renderResult(result);
    return result;
  }

  function registerCalculatorTool() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const knownProvinces = new Set(Array.from(provinceInput.options, (option) => option.value));
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "calculate_shipping_quote",
        title: "计算极兔或顺丰运费",
        description: "输入快递公司、省份和重量，按已核对账单规则计算运费。",
        inputSchema: {
          type: "object",
          properties: {
            carrier: { type: "string", enum: ["jt", "sf"], description: "jt为极兔，sf为顺丰" },
            province: { type: "string", description: "收件省份" },
            weight: { type: "number", exclusiveMinimum: 0, description: "重量，单位kg" },
          },
          required: ["carrier", "province", "weight"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== "object") throw new TypeError("请输入快递、省份和重量");
          if (!knownProvinces.has(String(input.province || ""))) throw new RangeError("该省份不在列表中");
          const result = calculateQuote(String(input.carrier), String(input.province), Number(input.weight));
          if (result.error) throw new RangeError(result.error);
          return result;
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch (_) {
      // 可见计算器不依赖此接口。
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    calculateAndRender();
  });
  courierInputs.forEach((input) => input.addEventListener("change", calculateAndRender));
  provinceInput.addEventListener("change", calculateAndRender);
  weightInput.addEventListener("input", () => {
    if (weightInput.value && Number(weightInput.value) > 0) calculateAndRender();
  });

  window.ShippingCalculator = { calculateJTShipping, calculateSFShipping, calculateQuote };
  calculateAndRender();
  registerCalculatorTool();
})();
