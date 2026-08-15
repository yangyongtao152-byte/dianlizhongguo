declare module "lunar-javascript" {
  export type LunarDate = {
    getYearInGanZhi(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getMonth(): number;
    getDay(): number;
    getFestivals(): string[];
    getDayYi(): string[];
    getDayJi(): string[];
    getZhiXing(): string;
    getDayTianShen(): string;
    getDayChongDesc(): string;
    getDaySha(): string;
    getPengZuGan(): string;
    getPengZuZhi(): string;
  };

  export type SolarDate = {
    getLunar(): LunarDate;
    getFestivals(): string[];
  };

  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarDate;
  };
}
