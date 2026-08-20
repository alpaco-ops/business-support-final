const express = require("express");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");

const app = express();

const API_URL =
  "https://apis.data.go.kr/B490001/gySjbPstateInfoService/getGySjBoheomBsshItem";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

app.get("/", function (req: any, res: any) {
  res.status(200).json({
    success: true,
    message: "사업장 정보 조회 API가 실행 중입니다.",
  });
});

app.get("/business", async function (req: any, res: any) {
  try {
    /*
     * 하이픈이 포함된 사업자등록번호도 처리합니다.
     * 예: 123-45-67890 → 1234567890
     */
    const businessNumber = String(req.query.businessNumber || "").replace(
      /\D/g,
      ""
    );

    if (!/^\d{10}$/.test(businessNumber)) {
      return res.status(400).json({
        success: false,
        message: "사업자등록번호 10자리를 입력해주세요.",
      });
    }

    /*
     * 공공데이터 인증키는 코드나 요청 주소에 직접 넣지 않고
     * Vercel 환경변수에서 가져옵니다.
     */
    const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY;

    if (!serviceKey) {
      return res.status(500).json({
        success: false,
        message: "공공데이터 인증키가 설정되지 않았습니다.",
      });
    }

    const apiResponse = await axios.get(API_URL, {
      params: {
        serviceKey,
        pageNo: 1,
        numOfRows: 10,
        v_saeopjaDrno: businessNumber,
        opaBoheomFg: 2, // 1: 산재보험, 2: 고용보험
      },
      responseType: "text",
      timeout: 10000,
    });

    const parsedXml = xmlParser.parse(apiResponse.data);
    const response = parsedXml?.response;
    const resultCode = String(response?.header?.resultCode || "");
    const resultMessage = String(response?.header?.resultMsg || "");

    if (resultCode !== "00") {
      return res.status(502).json({
        success: false,
        message: "근로복지공단 API 조회에 실패했습니다.",
        resultCode,
        resultMessage,
      });
    }

    const totalCount = Number(response?.body?.totalCount || 0);
    const rawItem = response?.body?.items?.item;

    if (totalCount === 0 || !rawItem) {
      return res.status(404).json({
        success: false,
        message: "해당 사업자등록번호의 고용보험 사업장 정보가 없습니다.",
        businessNumber,
      });
    }

    /*
     * 검색 결과가 한 건이면 객체, 여러 건이면 배열로 반환될 수 있으므로
     * 항상 배열 형태로 통일합니다.
     */
    const items = Array.isArray(rawItem) ? rawItem : [rawItem];

    const businesses = items.map(function (item: any) {
      return {
        businessNumber: item.saeopjaDrno || businessNumber,
        businessName: item.saeopjangNm || null,
        employeeCount: Number(
          String(item.sangsiInwonCnt || "0").replace(/,/g, "")
        ),
        establishmentDate: item.seongripDt || null,
        industryCode: item.sjEopjongCd || null,
        industryName: item.sjEopjongNm || null,
        address: item.addr || null,
        postalCode: item.post || null,
        insuranceType: "고용보험",
        insuranceTypeCode: item.opaBoheomFg || "2",
      };
    });

    return res.status(200).json({
      success: true,
      message: "고용보험 사업장 정보를 조회했습니다.",
      totalCount,
      businesses,
    });
  } catch (error: any) {
    console.error("사업장 정보 조회 오류:", error.message);

    return res.status(500).json({
      success: false,
      message: "사업장 정보를 조회하는 중 오류가 발생했습니다.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
});

/*
 * Vercel이 Express 애플리케이션을 실행할 수 있도록 내보냅니다.
 * Vercel 배포용 코드에서는 app.listen(3000)을 사용하지 않습니다.
 */

if (!process.env.VERCEL) {
  app.listen(3000, function () {
    console.log("서버 실행 완료: http://127.0.0.1:3000");
  });
}

export default app;