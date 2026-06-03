import { Controller, Get, Query } from "@nestjs/common";
import { AbaService } from "./aba.service.js";

@Controller("aba")
export class AbaController {
  constructor(private readonly aba: AbaService) {}

  @Get("weeks")
  weeks() {
    return this.aba.weeks();
  }

  @Get("search-terms")
  searchTerms(@Query() query: any) {
    return this.aba.searchTerms(query);
  }

  @Get("search-terms/export")
  exportSearchTerms(@Query() query: any) {
    return this.aba.exportSearchTerms(query);
  }
}
