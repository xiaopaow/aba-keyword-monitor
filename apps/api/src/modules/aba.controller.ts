import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AbaService } from "./aba.service.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService, getAuthenticatedUser } from "./auth.service.js";

@UseGuards(AuthGuard)
@Controller("aba")
export class AbaController {
  constructor(
    private readonly aba: AbaService,
    private readonly auth: AuthService
  ) {}

  @Get("weeks")
  async weeks(@Req() req: Request) {
    const user = getAuthenticatedUser(req);
    const visibleLimit = this.auth.getVisibleDataDepth(user.plan);
    const weeks = await this.aba.weeks();
    if (visibleLimit === null) return weeks;
    return weeks.map((week) => ({ ...week, totalTerms: Math.min(week.totalTerms, visibleLimit) }));
  }

  @Get("search-terms")
  async searchTerms(@Query() query: any, @Req() req: Request) {
    const user = getAuthenticatedUser(req);
    await this.auth.consumeQuota(user, "query", req, query);
    return this.aba.searchTerms(query, this.auth.getVisibleDataDepth(user.plan));
  }

  @Get("search-terms/export")
  async exportSearchTerms(@Query() query: any, @Req() req: Request) {
    const user = getAuthenticatedUser(req);
    await this.auth.consumeQuota(user, "export", req, query);
    const result = await this.aba.exportSearchTerms(query, this.auth.getVisibleDataDepth(user.plan));
    const exportId = await this.auth.logExport(user, req, result.rows.length, query);
    return { ...result, exportId };
  }
}
