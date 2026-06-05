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
  weeks() {
    return this.aba.weeks();
  }

  @Get("search-terms")
  async searchTerms(@Query() query: any, @Req() req: Request) {
    await this.auth.consumeQuota(getAuthenticatedUser(req), "query", req, query);
    return this.aba.searchTerms(query);
  }

  @Get("search-terms/export")
  async exportSearchTerms(@Query() query: any, @Req() req: Request) {
    const user = getAuthenticatedUser(req);
    await this.auth.consumeQuota(user, "export", req, query);
    const result = await this.aba.exportSearchTerms(query);
    const exportId = await this.auth.logExport(user, req, result.rows.length, query);
    return { ...result, exportId };
  }
}
