import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { KeywordService } from "./keyword.service.js";
import { RuleService } from "./rule.service.js";

@Controller()
export class KeywordController {
  constructor(
    private readonly keywords: KeywordService,
    private readonly rules: RuleService
  ) {}

  @Get("keywords")
  list(@Query() query: any) {
    return this.keywords.list(query);
  }

  @Get("keywords/:keyword")
  detail(@Param("keyword") keyword: string, @Query("date") date?: string) {
    return this.keywords.detail(decodeURIComponent(keyword), date);
  }

  @Get("keywords/:keyword/trend")
  trend(@Param("keyword") keyword: string, @Query("range") range?: string) {
    return this.keywords.trend(decodeURIComponent(keyword), range ?? "30d");
  }

  @Patch("keywords/:keyword/profile")
  updateProfile(@Param("keyword") keyword: string, @Body() body: { tag?: string; note?: string; isFavorite?: boolean }) {
    return this.keywords.updateProfile(decodeURIComponent(keyword), body);
  }

  @Get("opportunities")
  opportunities(@Query("date") date?: string, @Query("type") type?: string) {
    return this.rules.opportunities(date, type);
  }

  @Get("alerts")
  alerts(@Query("date") date?: string, @Query("type") type?: string) {
    return this.rules.alerts(date, type);
  }

  @Patch("alerts/:id")
  updateAlert(@Param("id") id: string, @Body() body: { status?: "handled" | "unhandled" }) {
    return this.rules.updateAlert(Number(id), body.status ?? "handled");
  }
}
